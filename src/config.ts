export class ConfigError extends Error {}

export interface Config {
  token: string;
  /** Always ends in `/api` with no trailing slash. */
  apiUrl: string;
  readOnly: boolean;
}

const DEFAULT_ORIGIN = "https://app.teable.ai";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function normalizeApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ConfigError(`TEABLE_BASE_URL is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new ConfigError("TEABLE_BASE_URL must use https (http is only allowed for localhost).");
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path.endsWith("/api") ? path : `${path}/api`}`;
}

function parseBool(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = (env.TEABLE_TOKEN ?? env.TEABLE_API_KEY ?? "").trim();
  if (!token) {
    throw new ConfigError(
      "TEABLE_TOKEN is not set. Create a personal access token in Teable (Settings > Access tokens) and pass it to the server as TEABLE_TOKEN.",
    );
  }
  return {
    token,
    apiUrl: normalizeApiUrl(env.TEABLE_BASE_URL || DEFAULT_ORIGIN),
    readOnly: parseBool(env.TEABLE_READ_ONLY),
  };
}
