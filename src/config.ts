export class ConfigError extends Error {}

export interface Config {
  token: string;
  /** Always ends in `/api` with no trailing slash. */
  apiUrl: string;
  readOnly: boolean;
  /** Things worth telling the user at startup, e.g. that hidden characters were removed from the token. */
  notes?: string[];
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

// Terminal escape sequences, such as the ESC[200~ ... ESC[201~ some terminals wrap around pasted text.
const ESCAPE_SEQUENCES = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Pasted tokens often carry invisible extras: a trailing newline, a zero-width space, smart quotes, terminal escape
 * codes, or a "Bearer " prefix. Node refuses to send most of those in a header. Teable tokens are plain ASCII, so keep
 * only visible ASCII. `removed` counts what was dropped beyond harmless padding, quotes and the Bearer prefix.
 */
export function cleanToken(raw: string): { token: string; removed: number } {
  const withoutEscapes = raw.replace(ESCAPE_SEQUENCES, "");
  const unwrapped = withoutEscapes
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["'`\u201C\u2018](.*)["'`\u201D\u2019]$/s, "$1");
  const token = unwrapped.replace(/[^\x21-\x7E]/g, "");
  return { token, removed: raw.length - withoutEscapes.length + unwrapped.length - token.length };
}

function parseBool(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.TEABLE_TOKEN ?? env.TEABLE_API_KEY ?? "";
  const { token, removed } = cleanToken(raw);
  if (!token) {
    throw new ConfigError(
      raw.trim()
        ? "TEABLE_TOKEN only contains hidden or non-ASCII characters. Copy the token from Teable again."
        : "TEABLE_TOKEN is not set. Create a personal access token in Teable (Settings > Access tokens) and pass it to the server as TEABLE_TOKEN.",
    );
  }
  const notes = removed > 0 ? [`removed ${removed} hidden or non-ASCII character${removed > 1 ? "s" : ""} from TEABLE_TOKEN`] : [];
  return {
    token,
    apiUrl: normalizeApiUrl(env.TEABLE_BASE_URL || DEFAULT_ORIGIN),
    readOnly: parseBool(env.TEABLE_READ_ONLY),
    ...(notes.length > 0 && { notes }),
  };
}
