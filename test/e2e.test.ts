import { execFileSync, spawnSync } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the compiled server as a real child process over stdio, against a mock Teable on a local port.

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = `${root}dist/index.js`;

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
}

let mock: Server;
let seen: Seen[] = [];
let baseUrl = "";

beforeAll(async () => {
  execFileSync("npm", ["run", "build", "--silent"], { cwd: root, stdio: "pipe" });
  mock = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers });
    const path = (req.url ?? "").split("?")[0];
    res.setHeader("content-type", "application/json");
    if (path === "/api/auth/user") return void res.end(JSON.stringify({ id: "usr1", name: "E2E User" }));
    if (path === "/api/table/tbl1/field") return void res.end(JSON.stringify([{ id: "fld1", name: "Status" }]));
    if (path === "/api/table/tbl1/record" && req.method === "GET") {
      return void res.end(JSON.stringify({ records: [{ id: "rec1", fields: { Status: "Open" } }] }));
    }
    if (path === "/api/table/tbl1/record" && req.method === "DELETE") return void res.end();
    res.statusCode = 404;
    res.end(JSON.stringify({ message: `no mock for ${req.method} ${req.url}`, status: 404, code: "not_found" }));
  });
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((r) => mock.close(() => r()));
});

async function start(env: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { PATH: process.env.PATH ?? "", TEABLE_TOKEN: "e2e-token", TEABLE_BASE_URL: baseUrl, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "e2e", version: "0.0.0" });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

const text = (res: Awaited<ReturnType<Client["callTool"]>>) => (res.content as { text: string }[])[0]?.text ?? "";

describe("stdio end to end", () => {
  it("authenticates, reads and sends arrays and JSON the way Teable expects", async () => {
    seen = [];
    const { client, close } = await start();
    try {
      expect(text(await client.callTool({ name: "teable_whoami", arguments: {} }))).toContain("E2E User");
      expect(seen[0]?.headers.authorization).toBe("Bearer e2e-token");

      seen = [];
      const res = await client.callTool({
        name: "teable_list_records",
        arguments: {
          tableId: "tbl1",
          fields: ["Status"],
          filter: { conjunction: "and", filterSet: [{ field: "Status", operator: "is", value: "Open" }] },
          take: 5,
        },
      });
      expect(JSON.parse(text(res)).records[0].id).toBe("rec1");
      const list = seen.find((s) => s.url?.startsWith("/api/table/tbl1/record?"));
      const q = new URL(`http://x${list?.url}`).searchParams;
      expect(q.getAll("projection[]")).toEqual(["Status"]);
      expect(JSON.parse(q.get("filter") ?? "")).toEqual({
        conjunction: "and",
        filterSet: [{ fieldId: "fld1", operator: "is", value: "Open" }],
      });
      expect(q.get("take")).toBe("5");

      seen = [];
      await client.callTool({ name: "teable_delete_records", arguments: { tableId: "tbl1", recordIds: ["rec1"] } });
      expect(seen[0]).toMatchObject({ method: "DELETE", url: "/api/table/tbl1/record?recordIds%5B%5D=rec1" });
    } finally {
      await close();
    }
  }, 60_000);

  it("reports Teable errors as tool errors", async () => {
    const { client, close } = await start();
    try {
      const res = await client.callTool({ name: "teable_get_base", arguments: { baseId: "bse404" } });
      expect(res.isError).toBe(true);
      expect(text(res)).toContain("Teable API 404");
    } finally {
      await close();
    }
  }, 60_000);

  it("drops every write tool when TEABLE_READ_ONLY is set", async () => {
    const { client, close } = await start({ TEABLE_READ_ONLY: "true" });
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain("teable_list_records");
      expect(names).toContain("teable_api_get");
      for (const hidden of ["teable_create_records", "teable_delete_records", "teable_delete_table", "teable_api_request"]) {
        expect(names).not.toContain(hidden);
      }
    } finally {
      await close();
    }
  }, 60_000);

  it("exits with a clear message when no token is configured", () => {
    const run = spawnSync(process.execPath, [entry], { env: { PATH: process.env.PATH ?? "" }, encoding: "utf8", timeout: 20_000 });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("TEABLE_TOKEN is not set");
  });
});
