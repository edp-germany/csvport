import { config as loadEnv } from "dotenv";
import { Client } from "basic-ftp";
import { parse } from "csv-parse/sync";
import { mkdir, writeFile } from "node:fs/promises";
import { Writable } from "node:stream";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: path.resolve(process.cwd(), "functions/.env.local") });

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

async function main() {
  const ftpHost = requireEnv("FTP_HOST");
  const ftpPort = Number(process.env.FTP_PORT ?? "21");
  const ftpUser = requireEnv("FTP_USER");
  const ftpPassword = requireEnv("FTP_PASSWORD");
  const ftpSecure = process.env.FTP_SECURE === "true";
  const tableConfigs = getTableConfigs();

  const client = new Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpHost,
      port: ftpPort,
      user: ftpUser,
      password: ftpPassword,
      secure: ftpSecure
    });

    const tables = [];
    for (const tableConfig of tableConfigs) {
      const table = await fetchTable(client, tableConfig);
      tables.push(table);
    }

    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFile);
    const dataDir = path.resolve(currentDir, "../../app/public/data");
    await mkdir(dataDir, { recursive: true });

    const tableSummaries = tables.map((table) => ({
      id: table.id,
      label: table.label,
      columns: table.columns,
      rowCount: table.rowCount,
      updatedAt: table.updatedAt,
      ftpModifiedAt: table.ftpModifiedAt
    }));

    await writeFile(
      path.join(dataDir, "tables.json"),
      `${JSON.stringify(tableSummaries, null, 2)}\n`,
      "utf-8"
    );

    await Promise.all(
      tables.map((table) =>
        writeFile(path.join(dataDir, `${table.id}.json`), `${JSON.stringify(table, null, 2)}\n`, "utf-8")
      )
    );

    console.log(`Synced ${tables.length} table(s) to app/public/data`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
