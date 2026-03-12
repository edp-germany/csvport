import { useEffect, useMemo, useState } from "react";
import { fetchTable, fetchTables } from "./api";
import { getVisibleColumns } from "./tableConfig";
import type { TableData, TableSummary } from "./types";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string };

function App() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [activeTableId, setActiveTableId] = useState<string>("");
  const [activeTable, setActiveTable] = useState<TableData | null>(null);
  const [search, setSearch] = useState("");
  const [selectedColumn, setSelectedColumn] = useState<string>("__all__");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  async function loadTables(preferredTableId?: string, refreshKey?: string) {
    try {
      setLoadState({ status: "loading" });
      const nextTables = await fetchTables(refreshKey);
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
      const nextTable = await fetchTable(nextActiveTableId, refreshKey);
      setActiveTable(nextTable);
      setLoadState({ status: "idle" });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Tabellen konnten nicht geladen werden."
      });
    }
  }

  async function loadSingleTable(tableId: string, refreshKey?: string) {
    try {
      setLoadState({ status: "loading" });
      const nextTable = await fetchTable(tableId, refreshKey);
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
    void loadTables();
  }, []);

  useEffect(() => {
    if (!activeTableId || activeTable?.id === activeTableId) {
      return;
    }

    setSelectedColumn("__all__");
    setSearch("");
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

  return (
    <div className="shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <header className="hero">
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
              onClick={() => void loadTables(activeTableId, String(Date.now()))}
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
              <div>
                <h2>{activeTable.label}</h2>
                <p>
                  {filteredRows.length} von {activeTable.rowCount} Zeilen sichtbar
                </p>
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
                <p className="sync-hint">
                  Der Refresh-Button aktualisiert den zuletzt auf Firebase
                  bereitgestellten Datenstand. Neue FTP-Daten werden erst nach
                  erneutem Sync und Deploy sichtbar.
                </p>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={`${activeTable.id}-${index}`}>
                      {visibleColumns.map((column) => (
                        <td key={`${index}-${column.key}`}>{row[column.key] ?? ""}</td>
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
