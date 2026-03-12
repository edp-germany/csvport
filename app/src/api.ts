import type { TableData, TableSummary } from "./types";
import { auth } from "./firebase";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

function buildUrl(
  path: string,
  options?: { refreshKey?: string; forceRefresh?: boolean }
): string {
  const searchParams = new URLSearchParams();

  if (apiBaseUrl && options?.forceRefresh) {
    searchParams.set("refresh", "1");
  } else if (options?.refreshKey) {
    searchParams.set("refresh", options.refreshKey);
  }

  const query = searchParams.toString();
  const normalizedPath = apiBaseUrl
    ? `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`
    : path;

  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Data request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function buildHeaders(options?: { forceRefresh?: boolean }): Promise<HeadersInit> {
  if (!apiBaseUrl) {
    return {};
  }

  const user = auth.currentUser;
  if (!user) {
    return {};
  }

  const idToken = await user.getIdToken(options?.forceRefresh ?? false);
  return {
    Authorization: `Bearer ${idToken}`
  };
}

export async function fetchTables(options?: {
  refreshKey?: string;
  forceRefresh?: boolean;
}): Promise<TableSummary[]> {
  const headers = await buildHeaders(options);
  const path = apiBaseUrl ? "/api/tables" : "/data/tables.json";
  const response = await fetch(buildUrl(path, options), {
    cache: "no-store",
    headers
  });
  return parseJson<TableSummary[]>(response);
}

export async function fetchTable(
  tableId: string,
  options?: { refreshKey?: string; forceRefresh?: boolean }
): Promise<TableData> {
  const headers = await buildHeaders(options);
  const path = apiBaseUrl ? `/api/tables/${tableId}` : `/data/${tableId}.json`;
  const response = await fetch(buildUrl(path, options), {
    cache: "no-store",
    headers
  });
  return parseJson<TableData>(response);
}

export async function fetchRefreshStatus(): Promise<{
  phase: string;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}> {
  const headers = await buildHeaders();
  const response = await fetch(buildUrl("/api/status"), {
    cache: "no-store",
    headers
  });
  return parseJson(response);
}
