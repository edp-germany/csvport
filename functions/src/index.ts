import express from "express";
import admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { downloadAndParseTable } from "./csv";
import { getRefreshToken, getTableConfigs } from "./config";

admin.initializeApp();

const db = admin.firestore();
const TABLE_COLLECTION = "csvTables";
const ftpHostSecret = defineSecret("FTP_HOST");
const ftpPortSecret = defineSecret("FTP_PORT");
const ftpUserSecret = defineSecret("FTP_USER");
const ftpPasswordSecret = defineSecret("FTP_PASSWORD");
const ftpSecureSecret = defineSecret("FTP_SECURE");
const csvTablesSecret = defineSecret("CSV_TABLES");
const adminRefreshTokenSecret = defineSecret("ADMIN_REFRESH_TOKEN");
const runtimeSecrets = [
  ftpHostSecret,
  ftpPortSecret,
  ftpUserSecret,
  ftpPasswordSecret,
  ftpSecureSecret,
  csvTablesSecret,
  adminRefreshTokenSecret
];

type StoredTable = {
  id: string;
  label: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  rowCount: number;
  updatedAt: string;
};

function readTableConfigs() {
  return getTableConfigs(csvTablesSecret);
}

async function syncTable(tableId: string): Promise<StoredTable> {
  const tableConfig = readTableConfigs().find((item) => item.id === tableId);
  if (!tableConfig) {
    throw new Error(`Unknown table: ${tableId}`);
  }

  const table = await downloadAndParseTable(tableConfig, {
    host: ftpHostSecret,
    port: ftpPortSecret,
    user: ftpUserSecret,
    password: ftpPasswordSecret,
    secure: ftpSecureSecret
  });
  await db.collection(TABLE_COLLECTION).doc(table.id).set(table);
  return table;
}

async function getStoredTable(tableId: string): Promise<StoredTable | null> {
  const snapshot = await db.collection(TABLE_COLLECTION).doc(tableId).get();
  if (!snapshot.exists) {
    return null;
  }

  return snapshot.data() as StoredTable;
}

async function getOrRefreshTable(tableId: string): Promise<StoredTable> {
  const tableConfig = readTableConfigs().find((item) => item.id === tableId);
  if (!tableConfig) {
    throw new Error(`Unknown table: ${tableId}`);
  }

  const cached = await getStoredTable(tableId);
  if (!cached) {
    return syncTable(tableId);
  }

  const refreshMinutes = tableConfig.refreshMinutes ?? 30;
  const updatedAt = new Date(cached.updatedAt).getTime();
  const cacheAge = Date.now() - updatedAt;

  if (cacheAge > refreshMinutes * 60 * 1000) {
    return syncTable(tableId);
  }

  return cached;
}

const app = express();

app.get("/api/tables", async (_request, response) => {
  try {
    const configs = readTableConfigs();
    const tables = await Promise.all(
      configs.map(async (config) => {
        const stored = await getStoredTable(config.id);
        return {
          id: config.id,
          label: config.label,
          rowCount: stored?.rowCount ?? 0,
          updatedAt: stored?.updatedAt ?? null,
          columns: stored?.columns ?? []
        };
      })
    );

    response.json(tables);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

app.get("/api/tables/:id", async (request, response) => {
  try {
    const table = await getOrRefreshTable(request.params.id);
    response.json(table);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

app.post("/api/refresh", async (_request, response) => {
  try {
    const refreshToken = getRefreshToken(adminRefreshTokenSecret);
    const authHeader = _request.header("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (refreshToken && bearerToken !== refreshToken) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }

    const configs = readTableConfigs();
    const tables = await Promise.all(configs.map((config) => syncTable(config.id)));
    response.json({
      ok: true,
      tables: tables.map((table) => ({
        id: table.id,
        label: table.label,
        rowCount: table.rowCount,
        updatedAt: table.updatedAt
      }))
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Refresh failed"
    });
  }
});

export const api = onRequest(
  {
    region: "europe-west3",
    cors: true,
    secrets: runtimeSecrets
  },
  app
);

export const scheduledRefresh = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "europe-west3",
    timeZone: "Europe/Berlin",
    secrets: runtimeSecrets
  },
  async () => {
    const configs = readTableConfigs();
    await Promise.all(configs.map((config) => syncTable(config.id)));
  }
);
