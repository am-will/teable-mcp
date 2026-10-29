#!/usr/bin/env node
// Condenses Teable's OpenAPI document into src/generated/endpoints.json, the index behind teable_search_api.
//
//   node scripts/build-endpoint-index.mjs [path-or-url]     (default: https://help.teable.ai/swagger.json)
//
// Leaves out every endpoint the connector's policy (src/tools/api-policy.ts) would refuse, so the search never
// advertises a call that cannot be made. It uses the compiled policy, so run `npm run build` first
// (`npm run build:index` does both).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { checkApiRequest } = await import("../dist/tools/api-policy.js").catch(() => {
  console.error("dist/ is missing. Run `npm run build` first, or use `npm run build:index`.");
  process.exit(1);
});

const SOURCE = process.argv[2] ?? "https://help.teable.ai/swagger.json";
const OUT = fileURLToPath(new URL("../src/generated/endpoints.json", import.meta.url));
const METHODS = ["get", "post", "put", "patch", "delete"];

function allowed(method, path) {
  try {
    checkApiRequest(method, path);
    return true;
  } catch {
    return false;
  }
}

const text = /^https?:\/\//.test(SOURCE) ? await (await fetch(SOURCE)).text() : await readFile(SOURCE, "utf8");
const spec = JSON.parse(text);
const schemas = spec.components?.schemas ?? {};

function deref(s) {
  for (let i = 0; s && s.$ref && i < 8; i++) s = schemas[s.$ref.split("/").pop()];
  return s ?? {};
}

function typeOf(schema, depth = 0) {
  const s = deref(schema);
  for (const key of ["anyOf", "oneOf"]) if (s[key]) return [...new Set(s[key].slice(0, 4).map((x) => typeOf(x, depth)))].join("|");
  if (s.enum) return `enum(${s.enum.slice(0, 10).join(",")})`;
  const t = s.type ?? (s.properties ? "object" : "any");
  if (t === "array") return `[${typeOf(s.items ?? {}, depth)}]`;
  if (t === "object" && s.properties && depth < 1) {
    const required = new Set(s.required ?? []);
    return `{${Object.entries(s.properties)
      .slice(0, 25)
      .map(([k, v]) => `${k}${required.has(k) ? "*" : ""}:${typeOf(v, depth + 1)}`)
      .join(", ")}}`;
  }
  return t;
}

const clip = (str, n) => (str.length > n ? `${str.slice(0, n - 1)}…` : str);

const endpoints = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    if (!allowed(method, path)) continue;

    const description = op.description ?? "";
    const scopes = description.match(/Required token scopes: `([^`]+)`/)?.[1] ?? "";
    const firstLine = description.split("\n").find((l) => l.trim() && !l.startsWith("Required token scopes")) ?? "";
    const content = op.requestBody?.content ?? {};
    const json = content["application/json"]?.schema;
    const form = content["multipart/form-data"]?.schema;

    endpoints.push({
      m: method.toUpperCase(),
      p: path,
      t: op.tags?.[0] ?? "",
      s: clip((op.summary ?? firstLine).trim(), 140),
      sc: scopes,
      q: (op.parameters ?? []).filter((x) => x.in === "query").map((x) => `${x.name}${x.required ? "*" : ""}`),
      b: json ? clip(typeOf(json), 500) : form ? clip(`multipart/form-data ${typeOf(form)}`, 500) : "",
    });
  }
}

endpoints.sort((a, b) => a.p.localeCompare(b.p) || a.m.localeCompare(b.m));
await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
await writeFile(OUT, `${JSON.stringify(endpoints)}\n`);
console.error(`${endpoints.length} endpoints from ${SOURCE} -> ${OUT}`);
