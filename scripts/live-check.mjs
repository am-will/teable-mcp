#!/usr/bin/env node
// Read-only smoke test of the built server against a real Teable. Needs TEABLE_TOKEN (and TEABLE_BASE_URL for
// self-hosted). Run `npm run build` first, or just `npm run live-check`.
//
// It only calls read tools, and prints counts and structure names, never record contents.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

if (!process.env.TEABLE_TOKEN) {
  console.error("Set TEABLE_TOKEN to a Teable personal access token first.");
  process.exit(2);
}

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  env: {
    PATH: process.env.PATH ?? "",
    TEABLE_TOKEN: process.env.TEABLE_TOKEN,
    ...(process.env.TEABLE_BASE_URL && { TEABLE_BASE_URL: process.env.TEABLE_BASE_URL }),
    TEABLE_READ_ONLY: "true",
  },
  stderr: "ignore",
});
const client = new Client({ name: "live-check", version: "0.0.0" });
await client.connect(transport);

let failures = 0;
async function step(label, name, args, check) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? "";
    if (res.isError) throw new Error(text.split("\n")[0]);
    const value = text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text;
    const note = check ? check(value) : "";
    console.log(`ok    ${label}${note ? `  (${note})` : ""}`);
    return value;
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label}: ${err.message}`);
    return undefined;
  }
}

const me = await step("whoami", "teable_whoami", {}, (v) => v.name ?? v.id);
const spaces = await step("list spaces", "teable_list_spaces", {}, (v) => `${v.length} spaces`);
const bases = await step("list bases", "teable_list_bases", {}, (v) => `${v.length} bases`);
const base = bases?.[0];
const tables = base && (await step("list tables", "teable_list_tables", { baseId: base.id }, (v) => `${v.length} tables in "${base.name}"`));
const table = tables?.[0];
const fields = table && (await step("list fields", "teable_list_fields", { tableId: table.id }, (v) => `${v.length} fields in "${table.name}"`));
const field = fields?.find((f) => !f.isComputed) ?? fields?.[0];

if (table && field) {
  await step("list views", "teable_list_views", { tableId: table.id }, (v) => `${v.length} views`);
  await step("count records", "teable_count_records", { tableId: table.id }, (v) => `${v.rowCount} rows`);
  await step("list records", "teable_list_records", { tableId: table.id, take: 2 }, (v) => `${v.returned} returned`);
  await step("projection with one field", "teable_list_records", { tableId: table.id, take: 2, fields: [field.name] }, (v) => {
    const extra = v.records.flatMap((r) => Object.keys(r.fields ?? {})).filter((k) => k !== field.name);
    if (extra.length) throw new Error(`projection ignored, also got: ${[...new Set(extra)].join(", ")}`);
    return `only "${field.name}"`;
  });
  await step("filter (isNotEmpty)", "teable_list_records", {
    tableId: table.id,
    take: 2,
    filter: { conjunction: "and", filterSet: [{ field: field.name, operator: "isNotEmpty" }] },
  }, (v) => `${v.returned} returned`);
  await step("sort", "teable_list_records", { tableId: table.id, take: 2, orderBy: [{ field: field.name, order: "asc" }] }, (v) => `${v.returned} returned`);
  await step("count with filter", "teable_count_records", {
    tableId: table.id,
    filter: { conjunction: "and", filterSet: [{ field: field.name, operator: "isNotEmpty" }] },
  }, (v) => `${v.rowCount} rows`);
}
if (spaces?.[0]) await step("search space", "teable_search_space", { spaceId: spaces[0].id, search: table?.name ?? "a" });
await step("api search", "teable_search_api", { query: "record" }, (v) => `${v.length} endpoints`);
await step("generic GET", "teable_api_get", { path: "/auth/user" });

await client.close();
console.log(failures ? `\n${failures} check(s) failed.` : `\nAll checks passed${me ? ` as ${me.name ?? me.id}` : ""}.`);
process.exit(failures ? 1 : 0);
