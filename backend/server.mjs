import { config as loadEnv } from "dotenv";
import express from "express";
import { Client } from "basic-ftp";
import { parse } from "csv-parse/sync";
import { Writable } from "node:stream";

loadEnv();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getTableConfigs() {
  const parsed = JSON.parse(requireEnv("CSV_TABLES"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CSV_TABLES must be a non-empty JSON array.");
  }

  return parsed;
}

function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
}

function detectDelimiter(csv, fallbackDelimiter) {
  if (fallbackDelimiter) {
    return fallbackDelimiter;
  }

  const firstLine = csv.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t", "|"];
  let bestDelimiter = ",";
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = firstLine.split(candidate).length;
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = candidate;
    }
  }

  return bestDelimiter;
}

async function downloadFileAsString(client, remotePath) {
  const chunks = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  });

  await client.downloadTo(writable, remotePath);
  return Buffer.concat(chunks).toString("utf-8");
}

async function fetchTable(client, tableConfig) {
  const csv = await downloadFileAsString(client, tableConfig.path);
  const delimiter = detectDelimiter(csv, tableConfig.delimiter);
  let ftpModifiedAt = null;

  try {
    const modifiedAt = await client.lastMod(tableConfig.path);
    ftpModifiedAt = modifiedAt.toISOString();
  } catch (_error) {
    ftpModifiedAt = null;
  }

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    bom: true,
    relax_quotes: true
  });

  const rows = records.map(normalizeRecord);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    id: tableConfig.id,
    label: tableConfig.label,
    columns,
    rows,
    rowCount: rows.length,
    updatedAt: new Date().toISOString(),
    ftpModifiedAt
  };
}

async function fetchAllTables() {
  const client = new Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: requireEnv("FTP_HOST"),
      port: Number(process.env.FTP_PORT ?? "21"),
      user: requireEnv("FTP_USER"),
      password: requireEnv("FTP_PASSWORD"),
      secure: process.env.FTP_SECURE === "true"
    });

    const tables = [];
    for (const tableConfig of getTableConfigs()) {
      tables.push(await fetchTable(client, tableConfig));
    }

    return tables;
  } finally {
    client.close();
  }
}

let cache = {
  tables: [],
  byId: new Map(),
  fetchedAt: null
};

async function refreshCache() {
  const tables = await fetchAllTables();
  cache = {
    tables: tables.map((table) => ({
      id: table.id,
      label: table.label,
      columns: table.columns,
      rowCount: table.rowCount,
      updatedAt: table.updatedAt,
      ftpModifiedAt: table.ftpModifiedAt
    })),
    byId: new Map(tables.map((table) => [table.id, table])),
    fetchedAt: new Date().toISOString()
  };

  return cache;
}

async function ensureCache() {
  if (cache.tables.length === 0) {
    await refreshCache();
  }

  return cache;
}

const app = express();
const port = Number(process.env.PORT ?? "3000");
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "*";

app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", frontendOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
});

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/tables", async (request, response) => {
  try {
    const state = request.query.refresh === "1" ? await refreshCache() : await ensureCache();
    response.json(state.tables);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

app.get("/api/tables/:id", async (request, response) => {
  try {
    const state = request.query.refresh === "1" ? await refreshCache() : await ensureCache();
    const table = state.byId.get(request.params.id);

    if (!table) {
      response.status(404).json({ error: "Table not found" });
      return;
    }

    response.json(table);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

app.post("/api/refresh", async (_request, response) => {
  try {
    const state = await refreshCache();
    response.json({
      ok: true,
      fetchedAt: state.fetchedAt,
      tables: state.tables
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Refresh failed"
    });
  }
});

app.listen(port, () => {
  console.log(`CSVport backend listening on port ${port}`);
});
