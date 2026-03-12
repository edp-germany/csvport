import { useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { fetchRefreshStatus, fetchTable, fetchTables } from "./api";
import { auth } from "./firebase";
import { getVisibleColumns } from "./tableConfig";
import type { TableData, TableSummary } from "./types";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string };

type AuthState =
  | { status: "checking" }
  | { status: "signed_out" }
  | { status: "signed_in"; user: User };

type SortState = {
  column: string;
  direction: "asc" | "desc";
};

function parseSortableValue(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const asNumber = Number(normalized);

  if (normalized !== "" && !Number.isNaN(asNumber)) {
    return asNumber;
  }

  return value.trim().toLowerCase();
}

function formatExportTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [authError, setAuthError] = useState<string>("");
  const [authPending, setAuthPending] = useState(false);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [activeTableId, setActiveTableId] = useState<string>("");
  const [activeTable, setActiveTable] = useState<TableData | null>(null);
  const [search, setSearch] = useState("");
  const [selectedColumn, setSelectedColumn] = useState<string>("__all__");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [copiedCell, setCopiedCell] = useState<string>("");
  const [exportPending, setExportPending] = useState<"" | "csv" | "xlsx">("");
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Daten werden vorbereitet");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthState({ status: "signed_in", user });
        return;
      }

      setAuthState({ status: "signed_out" });
    });

    return unsubscribe;
  }, []);

  async function loadTables(
    preferredTableId?: string,
    options?: { refreshKey?: string; forceRefresh?: boolean }
  ) {
    try {
      setLoadState({ status: "loading" });
      const nextTables = await fetchTables(options);
      setTables(nextTables);

      if (nextTables.length === 0) {
        setActiveTable(null);
        setActiveTableId("");
        setLoadState({ status: "idle" });
        return;
      }

      const nextActiveTableId =
        preferredTableId && nextTables.some((table) => table.id === preferredTableId)
          ? preferredTableId
          : nextTables[0].id;

      setActiveTableId(nextActiveTableId);
      const nextTable = await fetchTable(nextActiveTableId, options);
      setActiveTable(nextTable);
      setLoadState({ status: "idle" });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Tabellen konnten nicht geladen werden."
      });
    }
  }

  async function loadSingleTable(
    tableId: string,
    options?: { refreshKey?: string; forceRefresh?: boolean }
  ) {
    try {
      setLoadState({ status: "loading" });
      const nextTable = await fetchTable(tableId, options);
      setActiveTable(nextTable);
      setLoadState({ status: "idle" });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Tabelle konnte nicht geladen werden."
      });
    }
  }

  useEffect(() => {
    if (authState.status !== "signed_in") {
      return;
    }

    void loadTables();
  }, [authState.status]);

  useEffect(() => {
    if (!activeTableId || activeTable?.id === activeTableId) {
      return;
    }

    setSelectedColumn("__all__");
    setSearch("");
    setSortState(null);
    void loadSingleTable(activeTableId);
  }, [activeTableId, activeTable?.id]);

  useEffect(() => {
    if (loadState.status !== "loading") {
      setLoadingSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [loadState.status]);

  useEffect(() => {
    if (loadState.status !== "loading") {
      setLoadingMessage("Daten werden vorbereitet");
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchRefreshStatus()
        .then((status) => {
          if (status.message) {
            setLoadingMessage(status.message);
          }
        })
        .catch(() => {
          setLoadingMessage("Daten werden vorbereitet");
        });
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [loadState.status]);

  const visibleColumns = useMemo(() => {
    if (!activeTable) {
      return [];
    }

    return getVisibleColumns(activeTable.id, activeTable.columns);
  }, [activeTable]);

  const filteredRows = useMemo(() => {
    if (!activeTable) {
      return [];
    }

    const term = search.trim().toLowerCase();
    if (!term) {
      return activeTable.rows;
    }

    return activeTable.rows.filter((row) => {
      const values =
        selectedColumn === "__all__"
          ? Object.values(row)
          : [row[selectedColumn] ?? ""];

      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [activeTable, search, selectedColumn]);

  const sortedRows = useMemo(() => {
    if (!sortState) {
      return filteredRows;
    }

    return [...filteredRows].sort((leftRow, rightRow) => {
      const leftValue = parseSortableValue(leftRow[sortState.column] ?? "");
      const rightValue = parseSortableValue(rightRow[sortState.column] ?? "");

      if (leftValue < rightValue) {
        return sortState.direction === "asc" ? -1 : 1;
      }

      if (leftValue > rightValue) {
        return sortState.direction === "asc" ? 1 : -1;
      }

      return 0;
    });
  }, [filteredRows, sortState]);

  const stats = useMemo(() => {
    if (!activeTable) {
      return [];
    }

    return [
      { label: "Tabellen", value: String(tables.length) },
      { label: "Spalten", value: String(visibleColumns.length) },
      { label: "Zeilen", value: String(activeTable.rowCount) },
      {
        label: "Zuletzt synchronisiert",
        value: activeTable.updatedAt
          ? new Intl.DateTimeFormat("de-DE", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(activeTable.updatedAt))
          : "Noch nicht synchronisiert"
      }
    ];
  }, [activeTable, tables.length, visibleColumns.length]);

  function toggleSort(column: string) {
    setSortState((current) => {
      if (!current || current.column !== column) {
        return { column, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { column, direction: "desc" };
      }

      return null;
    });
  }

  async function handleCopyCell(value: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedCell(value);
      window.setTimeout(() => setCopiedCell(""), 1600);
    } catch (_error) {
      setCopiedCell("");
    }
  }

  async function loadXlsx() {
    return import("xlsx");
  }

  async function handleExportXlsx() {
    if (!activeTable) {
      return;
    }

    setExportPending("xlsx");

    try {
      const exportRows = sortedRows.map((row) =>
        Object.fromEntries(
          visibleColumns.map((column) => [column.label, row[column.key] ?? ""])
        )
      );

      const XLSX = await loadXlsx();
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      worksheet["!cols"] = visibleColumns.map((column) => {
        const longestValue = exportRows.reduce((max, row) => {
          const cellValue = String(row[column.label] ?? "");
          return Math.max(max, cellValue.length);
        }, column.label.length);

        return { wch: Math.min(Math.max(longestValue + 2, 12), 48) };
      });
      XLSX.utils.book_append_sheet(workbook, worksheet, activeTable.label);
      XLSX.writeFile(
        workbook,
        `${activeTable.id}-${formatExportTimestamp(new Date())}.xlsx`
      );
    } finally {
      setExportPending("");
    }
  }

  async function handleExportCsv() {
    if (!activeTable) {
      return;
    }

    setExportPending("csv");

    try {
      const exportRows = sortedRows.map((row) =>
        Object.fromEntries(
          visibleColumns.map((column) => [column.label, row[column.key] ?? ""])
        )
      );

      const XLSX = await loadXlsx();
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ";", RS: "\n" });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeTable.id}-${formatExportTimestamp(new Date())}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportPending("");
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthPending(true);
    setAuthError("");

    try {
      await setPersistence(
        auth,
        rememberLogin ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Anmeldung fehlgeschlagen."
      );
    } finally {
      setAuthPending(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    setTables([]);
    setActiveTable(null);
    setActiveTableId("");
    setSearch("");
    setSelectedColumn("__all__");
    setSortState(null);
  }

  if (authState.status === "checking") {
    return (
      <div className="shell auth-shell">
        <div className="background-orb background-orb-left" />
        <div className="background-orb background-orb-right" />
        <main className="auth-card">
          <span className="eyebrow">CSVport</span>
          <h1>Authentifizierung wird geprueft</h1>
          <p>Bitte einen Moment warten.</p>
        </main>
      </div>
    );
  }

  if (authState.status === "signed_out") {
    return (
      <div className="shell auth-shell">
        <div className="background-orb background-orb-left" />
        <div className="background-orb background-orb-right" />
        <main className="auth-card">
          <span className="eyebrow">CSVport</span>
          <h1>Login</h1>
          <p>Bitte Login-Daten eingeben</p>

          <form className="auth-form" onSubmit={handleLogin}>
            <label className="input-group">
              <span>E-Mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label className="input-group">
              <span>Passwort</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            <label className="remember-login">
              <input
                type="checkbox"
                checked={rememberLogin}
                onChange={(event) => setRememberLogin(event.target.checked)}
              />
              <span>Angemeldet bleiben</span>
            </label>

            {authError ? <p className="auth-error">{authError}</p> : null}

            <button type="submit" className="refresh-button" disabled={authPending}>
              {authPending ? "Anmeldung laeuft ..." : "Anmelden"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <header className="hero">
        <div className="hero-session">
          <span>{authState.user.email}</span>
          <button type="button" className="logout-button" onClick={() => void handleLogout()}>
            Abmelden
          </button>
        </div>

        <div className="hero-copy">
          <span className="eyebrow">CSV Dashboard</span>
          <h1>CSVport</h1>
          <p>Abruf von CSV-Dateien via FTP</p>
        </div>

        <div className="stats-grid">
          {stats.map((item) => (
            <article className="stat-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </header>

      <main className="panel">
        <section className="toolbar">
          <div className="tabs" role="tablist" aria-label="CSV Tabellen">
            {tables.map((table) => (
              <button
                key={table.id}
                className={table.id === activeTableId ? "tab active" : "tab"}
                onClick={() => setActiveTableId(table.id)}
                role="tab"
                aria-selected={table.id === activeTableId}
              >
                <span>{table.label}</span>
                <small>{table.rowCount} Zeilen</small>
              </button>
            ))}
          </div>

          <div className="filters">
            <button
              type="button"
              className="refresh-button"
              onClick={() =>
                void loadTables(activeTableId, {
                  refreshKey: String(Date.now()),
                  forceRefresh: true
                })
              }
            >
              Daten neu laden
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={handleExportCsv}
              disabled={!activeTable || sortedRows.length === 0 || exportPending !== ""}
            >
              {exportPending === "csv" ? "CSV wird erstellt ..." : "CSV exportieren"}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={handleExportXlsx}
              disabled={!activeTable || sortedRows.length === 0 || exportPending !== ""}
            >
              {exportPending === "xlsx" ? "XLSX wird erstellt ..." : "XLSX exportieren"}
            </button>

            <label className="input-group">
              <span>Suche</span>
              <input
                type="search"
                placeholder="In Tabelle suchen ..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="input-group">
              <span>Suche in</span>
              <select
                value={selectedColumn}
                onChange={(event) => setSelectedColumn(event.target.value)}
                disabled={!activeTable}
              >
                <option value="__all__">Alle Spalten</option>
                {visibleColumns.map((column) => (
                  <option key={column.key} value={column.key}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {loadState.status === "error" ? (
          <section className="empty-state">
            <h2>Fehler beim Laden</h2>
            <p>{loadState.message}</p>
          </section>
        ) : null}

        {loadState.status === "loading" ? (
          <section className="empty-state">
            <h2>Daten werden geladen</h2>
            <p className="loading-note-strong">{loadingMessage}</p>
            <p>
              Die CSV wird gerade vom Backend geladen. Nach einer Render-Ruhezeit
              kann der erste Abruf etwas laenger dauern.
            </p>
            {loadingSeconds > 0 ? (
              <p className="loading-note">Aktueller Abruf laeuft seit {loadingSeconds}s</p>
            ) : null}
          </section>
        ) : null}

        {loadState.status === "idle" && tables.length === 0 ? (
          <section className="empty-state">
            <h2>Noch keine Tabellen konfiguriert</h2>
            <p>
              Hinterlege mindestens einen Eintrag in `CSV_TABLES`, damit die erste
              CSV-Datei als Tab geladen werden kann.
            </p>
          </section>
        ) : null}

        {loadState.status === "idle" && activeTable && tables.length > 0 ? (
          <section className="table-wrap">
            <div className="table-meta">
              <div className="table-meta-main">
                <h2>{activeTable.label}</h2>
                <p>
                  {sortedRows.length} von {activeTable.rowCount} Zeilen sichtbar
                </p>
              </div>
              <div className="table-meta-side">
                <p className="sync-note">
                  Zuletzt synchronisiert:{" "}
                  {activeTable.updatedAt
                    ? new Intl.DateTimeFormat("de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(activeTable.updatedAt))
                    : "Noch nicht synchronisiert"}
                </p>
                <p className="sync-note">
                  FTP-Datei zuletzt geaendert:{" "}
                  {activeTable.ftpModifiedAt
                    ? new Intl.DateTimeFormat("de-DE", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(activeTable.ftpModifiedAt))
                    : "Nicht verfuegbar"}
                </p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column.key} className={column.className}>
                        <button
                          type="button"
                          className="sort-button"
                          onClick={() => toggleSort(column.key)}
                        >
                          <span>{column.label}</span>
                          <span className="sort-indicator">
                            {sortState?.column === column.key
                              ? sortState.direction === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, index) => (
                    <tr key={`${activeTable.id}-${index}`}>
                      {visibleColumns.map((column) => (
                        <td
                          key={`${index}-${column.key}`}
                          className={column.className}
                          onClick={() => void handleCopyCell(row[column.key] ?? "")}
                          title="Klicken zum Kopieren"
                        >
                          <span className="cell-value">{row[column.key] ?? ""}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>

      {copiedCell ? <div className="copy-toast">Kopiert</div> : null}
    </div>
  );
}

export default App;
