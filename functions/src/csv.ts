import { Client } from "basic-ftp";
import { Writable } from "node:stream";
import { parse } from "csv-parse/sync";
import type { SecretLike, TableConfig } from "./config";
import { getFtpConfig } from "./config";

export type ParsedTable = {
  id: string;
  label: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  rowCount: number;
  updatedAt: string;
};

async function downloadFileAsBuffer(client: Client, remotePath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];

  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }
  });

  await client.downloadTo(writable, remotePath);
  return Buffer.concat(chunks);
}

function normalizeRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
}

export async function downloadAndParseTable(
  config: TableConfig,
  ftpSecrets?: {
    host?: SecretLike;
    port?: SecretLike;
    user?: SecretLike;
    password?: SecretLike;
    secure?: SecretLike;
  }
): Promise<ParsedTable> {
  const ftp = getFtpConfig(ftpSecrets);
  const client = new Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftp.host,
      port: ftp.port,
      user: ftp.user,
      password: ftp.password,
      secure: ftp.secure
    });

    const fileBuffer = await downloadFileAsBuffer(client, config.path);
    const csv = fileBuffer.toString("utf-8");
    const records = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: config.delimiter ?? ",",
      bom: true
    }) as Record<string, unknown>[];

    const rows = records.map(normalizeRecord);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      id: config.id,
      label: config.label,
      columns,
      rows,
      rowCount: rows.length,
      updatedAt: new Date().toISOString()
    };
  } finally {
    client.close();
  }
}
