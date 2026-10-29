import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TeableApiError, type TeableClient } from "../src/client.js";
import { createRegistrar, formatError, formatResult, MAX_RESULT_CHARS } from "../src/tools/define.js";

async function connect(readOnly: boolean, register: (r: ReturnType<typeof createRegistrar>) => void) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  register(createRegistrar(server, { client: {} as TeableClient }, { readOnly }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const text = (res: Awaited<ReturnType<Client["callTool"]>>) => (res.content as { text: string }[])[0]?.text;

describe("formatResult", () => {
  it("passes strings through, serializes objects and reports empty results", () => {
    expect(formatResult("hi")).toBe("hi");
    expect(formatResult({ a: 1 })).toBe('{"a":1}');
    expect(formatResult(null)).toBe("OK");
    expect(formatResult(undefined)).toBe("OK");
  });

  it("truncates very large output and says so", () => {
    const out = formatResult("x".repeat(MAX_RESULT_CHARS + 50));
    expect(out.startsWith("x".repeat(MAX_RESULT_CHARS))).toBe(true);
    expect(out).toContain(`showing ${MAX_RESULT_CHARS} of ${MAX_RESULT_CHARS + 50}`);
  });
});

describe("formatError", () => {
  it("adds structured details from the API body", () => {
    const err = new TeableApiError(400, "Teable API 400: bad", "validation", { message: "bad", code: "validation", data: [1] });
    expect(formatError(err)).toBe('Teable API 400: bad\nDetails: {"data":[1]}');
  });
  it("handles plain errors and non-errors", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
    expect(formatError("odd")).toBe("odd");
  });
});

describe("createRegistrar", () => {
  const register = (r: ReturnType<typeof createRegistrar>) => {
    r.tool({
      name: "read_it",
      title: "Read it",
      description: "reads",
      access: "read",
      input: { id: z.string() },
      handler: async ({ id }) => ({ id }),
    });
    r.tool({ name: "write_it", title: "Write it", description: "writes", access: "write", input: {}, handler: async () => null });
    r.tool({
      name: "delete_it",
      title: "Delete it",
      description: "deletes",
      access: "destructive",
      input: {},
      handler: async () => {
        throw new TeableApiError(404, "Teable API 404: gone");
      },
    });
  };

  it("registers everything with matching annotations when writable", async () => {
    const client = await connect(false, register);
    const { tools } = await client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(Object.keys(by).sort()).toEqual(["delete_it", "read_it", "write_it"]);
    expect(by.read_it).toMatchObject({ readOnlyHint: true });
    expect(by.write_it).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(by.delete_it).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("only registers read tools in read-only mode", async () => {
    const client = await connect(true, register);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["read_it"]);
  });

  it("returns handler output as text and validates input", async () => {
    const client = await connect(false, register);
    expect(text(await client.callTool({ name: "read_it", arguments: { id: "spc1" } }))).toBe('{"id":"spc1"}');
    expect(text(await client.callTool({ name: "write_it", arguments: {} }))).toBe("OK");
    const bad = await client.callTool({ name: "read_it", arguments: {} });
    expect(bad.isError).toBe(true);
  });

  it("turns thrown errors into isError results instead of failing the protocol", async () => {
    const client = await connect(false, register);
    const res = await client.callTool({ name: "delete_it", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe("Teable API 404: gone");
  });
});
