import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildQuery, path, TeableApiError, TeableClient } from "../src/client.js";

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let server: Server;
let seen: Seen[];
let handler: (req: IncomingMessage, res: ServerResponse, n: number) => void;

function client(opts: ConstructorParameters<typeof TeableClient>[1] = {}) {
  const { port } = server.address() as AddressInfo;
  return new TeableClient({ token: "secret-token", apiUrl: `http://127.0.0.1:${port}/api` }, { sleep: async () => {}, ...opts });
}

beforeEach(async () => {
  seen = [];
  handler = (_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end("{}");
  };
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      handler(req, res, seen.length);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe("path", () => {
  it("encodes interpolated values", () => {
    expect(path`/table/${"tbl1"}/record/${"a/b?c"}`).toBe("/table/tbl1/record/a%2Fb%3Fc");
  });
});

describe("buildQuery", () => {
  it("repeats array keys, stringifies objects and drops nullish values", () => {
    expect(
      buildQuery({ take: 10, projection: ["a", "b"], filter: { conjunction: "and" }, skip: undefined, x: null, flag: false }),
    ).toBe("?take=10&projection=a&projection=b&filter=%7B%22conjunction%22%3A%22and%22%7D&flag=false");
  });
  it("returns an empty string when there is nothing to send", () => {
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({})).toBe("");
  });
});

describe("TeableClient", () => {
  it("sends the bearer token and parses JSON", async () => {
    handler = (_req, res) => res.end(JSON.stringify({ ok: true }));
    const data = await client().get("/space");
    expect(data).toEqual({ ok: true });
    expect(seen[0]?.url).toBe("/api/space");
    expect(seen[0]?.headers.authorization).toBe("Bearer secret-token");
  });

  it("sends JSON bodies and query strings", async () => {
    await client().post("/table/tbl1/record", { records: [] }, { fieldKeyType: "id" });
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url).toBe("/api/table/tbl1/record?fieldKeyType=id");
    expect(seen[0]?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ records: [] });
  });

  it("returns null for empty responses", async () => {
    handler = (_req, res) => {
      res.statusCode = 204;
      res.end();
    };
    expect(await client().delete("/table/tbl1/record/rec1")).toBeNull();
  });

  it("maps errors without leaking the token", async () => {
    handler = (_req, res) => {
      res.statusCode = 403;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "no scope", code: "restricted_resource" }));
    };
    const err = (await client().get("/space").catch((e: unknown) => e)) as TeableApiError;
    expect(err).toBeInstanceOf(TeableApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("restricted_resource");
    expect(err.message).toContain("no scope");
    expect(err.message).toContain("required scope");
    expect(err.message).not.toContain("secret-token");
  });

  it("retries 429 for any method and honours the retry limit", async () => {
    handler = (_req, res, n) => {
      res.statusCode = n < 3 ? 429 : 200;
      res.end("{}");
    };
    await client().post("/table/tbl1/record", {});
    expect(seen).toHaveLength(3);

    seen = [];
    handler = (_req, res) => {
      res.statusCode = 429;
      res.end("{}");
    };
    await expect(client({ maxRetries: 2 }).get("/space")).rejects.toMatchObject({ status: 429 });
    expect(seen).toHaveLength(3);
  });

  it("retries 5xx for GET but not for writes", async () => {
    handler = (_req, res, n) => {
      res.statusCode = n < 2 ? 503 : 200;
      res.end("{}");
    };
    await client().get("/space");
    expect(seen).toHaveLength(2);

    seen = [];
    handler = (_req, res) => {
      res.statusCode = 503;
      res.end("{}");
    };
    await expect(client().patch("/table/tbl1/record/rec1", {})).rejects.toMatchObject({ status: 503 });
    expect(seen).toHaveLength(1);
  });

  it("rejects paths that do not start with a slash", async () => {
    await expect(client().get("space")).rejects.toThrow(/must start with/);
  });
});
