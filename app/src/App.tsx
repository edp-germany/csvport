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
import { fetchTable, fetchTables } from "./api";
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
            <p>Die CSV wird aus dem Backend vorbereitet und angezeigt.</p>
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
                        <td key={`${index}-${column.key}`} className={column.className}>
                          {row[column.key] ?? ""}
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
    </div>
  );
}

export default App;
