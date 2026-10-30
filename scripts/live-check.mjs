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
let warnings = 0;

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? "";
  if (res.isError) throw new Error(text.split("\n")[0]);
  return text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : text;
}

// `optional` steps are skipped, not failed, when this Teable version lacks the endpoint (404).
// `scopeOptional` steps only warn when the token lacks the scope for them (403): the rest of the server works without them.
async function run(label, fn, { optional = false, scopeOptional = false } = {}) {
  try {
    const note = await fn();
    console.log(`ok    ${label}${note ? `  (${note})` : ""}`);
  } catch (err) {
    // The tools rewrite a 404 from space search into a friendlier message, so match both.
    if (optional && /Teable API 404|older self-hosted versions lack it/.test(err.message)) return console.log(`skip  ${label}: not available on this Teable version`);
    if (scopeOptional && /Teable API 403/.test(err.message)) {
      warnings++;
      return console.log(`warn  ${label}: this token has no scope for it. Everything else still works; add the scope to the token in Teable if you want it.`);
    }
    failures++;
    console.log(`FAIL  ${label}: ${err.message}`);
  }
}

async function step(label, name, args, check, opts) {
  let value;
  await run(
    label,
    async () => {
      value = await call(name, args);
      return check ? check(value) : "";
    },
    opts,
  );
  return value;
}

const me = await step("whoami", "teable_whoami", {}, (v) => v.name ?? v.id);
const spaces = await step("list spaces", "teable_list_spaces", {}, (v) => `${v.length} spaces`, { scopeOptional: true });
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
  // A filter Teable ignores returns every record with no error, so check that the list agrees with the count
  // and that every returned record really matches. (This is how a field-id/field-name mix-up showed up.)
  await run("filters are honoured (list agrees with count)", async () => {
    const parts = [];
    for (const operator of ["isNotEmpty", "isEmpty"]) {
      const filter = { conjunction: "and", filterSet: [{ field: field.name, operator }] };
      const { rowCount } = await call("teable_count_records", { tableId: table.id, filter });
      const listed = await call("teable_list_records", { tableId: table.id, fields: [field.name], filter, take: 100 });
      const expected = Math.min(rowCount, 100);
      if (listed.returned !== expected) {
        throw new Error(`${operator}: the count says ${rowCount} but the list returned ${listed.returned}. Teable may be ignoring the filter.`);
      }
      const filled = listed.records.filter((r) => r.fields?.[field.name] != null && r.fields[field.name] !== "").length;
      if (filled !== (operator === "isNotEmpty" ? listed.returned : 0)) throw new Error(`${operator}: returned records do not match the filter`);
      parts.push(`${operator}: ${rowCount}`);
    }
    return parts.join(", ");
  });
  await step("sort", "teable_list_records", { tableId: table.id, take: 2, orderBy: [{ field: field.name, order: "asc" }] }, (v) => `${v.returned} returned`);
}
if (spaces?.[0]) {
  await step("search space", "teable_search_space", { spaceId: spaces[0].id, search: table?.name ?? "a" }, undefined, { optional: true, scopeOptional: true });
}
await step("api search", "teable_search_api", { query: "record" }, (v) => `${v.length} endpoints`);
await step("generic GET", "teable_api_get", { path: "/auth/user" });

await client.close();
const warned = warnings ? ` (${warnings} warning${warnings > 1 ? "s" : ""}: the token is missing an optional scope)` : "";
console.log(failures ? `\n${failures} check(s) failed.` : `\nAll checks passed${me ? ` as ${me.name ?? me.id}` : ""}${warned}.`);
process.exit(failures ? 1 : 0);
