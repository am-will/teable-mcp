import type { Config } from "./config.js";

export class TeableApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "TeableApiError";
  }
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ClientOptions {
  fetch?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Tagged template that URL-encodes every interpolated value: path`/table/${id}/record`. */
export function path(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? encodeURIComponent(String(values[i])) : ""), "");
}

function queryValue(v: unknown): string {
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * Arrays use bracket notation (`ids[]=a&ids[]=b`, as in Teable's docs) so a one-item array stays an array on the
 * server. Objects become JSON strings. null and undefined are dropped.
 */
export function buildQuery(query: Record<string, unknown> | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(`${key}[]`, queryValue(item));
    } else {
      params.append(key, queryValue(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class TeableClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly config: Pick<Config, "token" | "apiUrl">,
    options: ClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.sleep = options.sleep ?? sleepMs;
  }

  get<T = unknown>(p: string, query?: Record<string, unknown>) {
    return this.request<T>("GET", p, { query });
  }
  post<T = unknown>(p: string, body?: unknown, query?: Record<string, unknown>) {
    return this.request<T>("POST", p, { body, query });
  }
  put<T = unknown>(p: string, body?: unknown) {
    return this.request<T>("PUT", p, { body });
  }
  patch<T = unknown>(p: string, body?: unknown) {
    return this.request<T>("PATCH", p, { body });
  }
  delete<T = unknown>(p: string, query?: Record<string, unknown>, body?: unknown) {
    return this.request<T>("DELETE", p, { query, body });
  }

  async request<T = unknown>(method: string, p: string, options: RequestOptions = {}): Promise<T> {
    if (!p.startsWith("/")) throw new Error(`Path must start with "/": ${p}`);
    const url = `${this.config.apiUrl}${p}${buildQuery(options.query)}`;
    const verb = method.toUpperCase();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/json",
      "User-Agent": "teable-mcp",
    };
    let payload: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(options.body);
    }

    for (let attempt = 0; ; attempt++) {
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(this.timeoutMs)])
        : AbortSignal.timeout(this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: verb, headers, body: payload, signal });
      } catch (err) {
        if (options.signal?.aborted) throw err;
        if (verb === "GET" && attempt < this.maxRetries) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw new Error(`Request to Teable failed: ${(err as Error).message}`);
      }

      if (res.ok) return (await parseBody(res)) as T;

      const retryable = res.status === 429 || (verb === "GET" && [502, 503, 504].includes(res.status));
      if (retryable && attempt < this.maxRetries) {
        await res.body?.cancel();
        await this.sleep(retryDelay(res, attempt));
        continue;
      }
      throw await toApiError(res);
    }
  }
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt;
}

function retryDelay(res: Response, attempt: number): number {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : backoff(attempt);
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const HINTS: Record<number, string> = {
  401: "The Teable token is missing, invalid or expired.",
  403: "The token does not have the required scope or access to this resource.",
  404: "Not found. Check the id, and that the token has access to it.",
};

async function toApiError(res: Response): Promise<TeableApiError> {
  const body = await parseBody(res);
  const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const detail = typeof obj.message === "string" ? obj.message : typeof body === "string" && body ? body : res.statusText;
  const hint = HINTS[res.status];
  const code = typeof obj.code === "string" ? obj.code : undefined;
  return new TeableApiError(res.status, `Teable API ${res.status}: ${detail}${hint ? ` (${hint})` : ""}`, code, body);
}
