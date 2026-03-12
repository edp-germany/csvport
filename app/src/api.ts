import type { TableData, TableSummary } from "./types";

function withRefreshQuery(path: string, refreshKey?: string): string {
  if (!refreshKey) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}refresh=${encodeURIComponent(refreshKey)}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Data request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchTables(refreshKey?: string): Promise<TableSummary[]> {
  const response = await fetch(withRefreshQuery("/data/tables.json", refreshKey), {
    cache: "no-store"
  });
  return parseJson<TableSummary[]>(response);
}

export async function fetchTable(tableId: string, refreshKey?: string): Promise<TableData> {
  const response = await fetch(withRefreshQuery(`/data/${tableId}.json`, refreshKey), {
    cache: "no-store"
  });
  return parseJson<TableData>(response);
}
