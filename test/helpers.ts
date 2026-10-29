import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TeableClient } from "../src/client.js";
import type { Config } from "../src/config.js";
import { createTeableServer } from "../src/server.js";

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
}

type Reply = unknown | ((call: RecordedCall) => unknown);

/**
 * Runs the real server against a fake Teable: `routes` maps "METHOD /api/path?query" to a JSON reply
 * (or a function returning one). Unmatched requests answer 404 so missing routes show up in tests.
 */
export async function connectToFakeTeable(routes: Record<string, Reply> = {}, config: Partial<Config> = {}) {
  const calls: RecordedCall[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const call: RecordedCall = {
      method: init?.method ?? "GET",
      url: url.pathname + url.search,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const key = `${call.method} ${call.url}`;
    const reply = key in routes ? routes[key] : `${call.method} ${url.pathname}` in routes ? routes[`${call.method} ${url.pathname}`] : undefined;
    if (reply === undefined) return new Response(JSON.stringify({ message: `no fake route for ${key}` }), { status: 404 });
    const value = typeof reply === "function" ? (reply as (c: RecordedCall) => unknown)(call) : reply;
    return value === null ? new Response(null, { status: 204 }) : Response.json(value);
  };

  const full: Config = { token: "test-token", apiUrl: "https://teable.test/api", readOnly: false, ...config };
  const server = createTeableServer(full, new TeableClient(full, { fetch: fakeFetch, sleep: async () => {} }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);

  return {
    client,
    calls,
    call: (name: string, args: Record<string, unknown> = {}) =>
      client.callTool({ name, arguments: args }) as Promise<CallToolResult>,
    text: (res: CallToolResult) => (res.content[0] as { text: string }).text,
  };
}
