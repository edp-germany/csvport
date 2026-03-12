import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

type TableConfig = {
  id: string;
  label: string;
  path: string;
  delimiter?: string;
  refreshMinutes?: number;
};

type FtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
};

type SecretLike = {
  value(): string;
};

function requireConfigValue(name: string, secret?: SecretLike): string {
  const value = process.env[name] ?? secret?.value();
  if (!value) {
    throw new Error(`Missing required configuration value: ${name}`);
  }

  return value;
}

function getOptionalConfigValue(name: string, secret?: SecretLike): string | undefined {
  return process.env[name] ?? secret?.value();
}

export function getFtpConfig(secrets?: {
  host?: SecretLike;
  port?: SecretLike;
  user?: SecretLike;
  password?: SecretLike;
  secure?: SecretLike;
}): FtpConfig {
  return {
    host: requireConfigValue("FTP_HOST", secrets?.host),
    port: Number(getOptionalConfigValue("FTP_PORT", secrets?.port) ?? "21"),
    user: requireConfigValue("FTP_USER", secrets?.user),
    password: requireConfigValue("FTP_PASSWORD", secrets?.password),
    secure: (getOptionalConfigValue("FTP_SECURE", secrets?.secure) ?? "false") === "true"
  };
}

export function getTableConfigs(secret?: SecretLike): TableConfig[] {
  const raw = requireConfigValue("CSV_TABLES", secret);
  const parsed = JSON.parse(raw) as TableConfig[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CSV_TABLES must be a non-empty JSON array.");
  }

  return parsed;
}

export function getRefreshToken(secret?: SecretLike): string | null {
  return getOptionalConfigValue("ADMIN_REFRESH_TOKEN", secret) ?? null;
}

export type { SecretLike, TableConfig };
