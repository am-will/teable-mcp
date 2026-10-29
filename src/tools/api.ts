import { z } from "zod";
import indexData from "../generated/endpoints.json" with { type: "json" };
import { checkApiRequest, normalizeApiPath } from "./api-policy.js";
import type { Registrar } from "./define.js";

/** One row of the generated index; see scripts/build-endpoint-index.mjs. */
export interface Endpoint {
  m: string;
  p: string;
  t: string;
  s: string;
  sc: string;
  q: string[];
  b: string;
}

const MAX_RESULTS = 40;

export function searchEndpoints(
  index: readonly Endpoint[],
  query: string,
  opts: { tag?: string; method?: string; limit: number },
): Endpoint[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tag = opts.tag?.toLowerCase();
  const method = opts.method?.toUpperCase();

  const scored = index
    .filter((e) => (!tag || e.t.toLowerCase() === tag) && (!method || e.m === method))
    .map((e) => {
      const text = `${e.m} ${e.p} ${e.t} ${e.s}`.toLowerCase();
      return { e, hits: terms.filter((t) => text.includes(t)).length };
    })
    .filter((x) => x.hits > 0 || terms.length === 0);

  const full = scored.filter((x) => x.hits === terms.length);
  const pool = full.length > 0 ? full : scored;
  return pool
    .sort((a, b) => b.hits - a.hits || a.e.p.length - b.e.p.length || a.e.p.localeCompare(b.e.p))
    .slice(0, opts.limit)
    .map((x) => x.e);
}

function describe(e: Endpoint) {
  return {
    method: e.m,
    path: e.p,
    ...(e.s && { summary: e.s }),
    ...(e.sc && { scopes: e.sc }),
    ...(e.q.length > 0 && { query: e.q.join(", ") }),
    ...(e.b && { body: e.b }),
  };
}

const pathParam = z
  .string()
  .describe("Endpoint path with real ids filled in, e.g. /table/tblXXXX/aggregation/row-count. A leading /api is optional.");
const queryParam = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Query parameters. Arrays are sent as key[]=value and objects as JSON strings.");

export function registerApiCallTools(r: Registrar): void {
  r.tool({
    name: "teable_api_get",
    title: "Call a Teable API endpoint (read)",
    description:
      "Make a GET request to any Teable API endpoint that the dedicated tools do not cover. Find the endpoint and its parameters with teable_search_api first. Read-only.",
    access: "read",
    input: { path: pathParam, query: queryParam },
    handler: ({ path, query }, { client }) => {
      const p = normalizeApiPath(path);
      checkApiRequest("GET", p);
      return client.get(p, query);
    },
  });

  r.tool({
    name: "teable_api_request",
    title: "Call a Teable API endpoint (change data)",
    description:
      "Make a POST, PUT, PATCH or DELETE request to any Teable API endpoint that the dedicated tools do not cover. Find the endpoint and its body with teable_search_api first, and confirm with the user before changing or deleting anything. " +
      "Account, token, billing and admin areas, permanent deletion, and sharing or access-control changes are refused.",
    access: "destructive",
    input: {
      method: z.enum(["POST", "PUT", "PATCH", "DELETE"]),
      path: pathParam,
      query: queryParam,
      body: z.record(z.string(), z.unknown()).optional().describe("JSON request body"),
    },
    handler: ({ method, path, query, body }, { client }) => {
      const p = normalizeApiPath(path);
      checkApiRequest(method, p);
      return client.request(method, p, { query, body });
    },
  });
}

export function registerApiSearchTool(r: Registrar): void {
  r.tool({
    name: "teable_search_api",
    title: "Search the Teable API",
    description:
      "Search Teable's REST API for an endpoint when none of the dedicated tools covers what you need (for example view filters and sorting, automations, dashboards, SQL queries, aggregations, exports). " +
      "Each result gives the method, path, summary, the token scopes it needs, its query parameters (* means required) and the shape of its JSON body. " +
      "Then call it with teable_api_get for GET endpoints, or teable_api_request for the rest. Paths use {placeholders} that you fill in with real ids.",
    access: "read",
    input: {
      query: z.string().describe("Keywords, for example 'view filter' or 'aggregation' or 'workflow'"),
      tag: z.string().optional().describe("Only this area, such as record, field, view, table, base, space, comment, automation"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
      limit: z.number().int().min(1).max(MAX_RESULTS).default(15),
    },
    handler: async ({ query, tag, method, limit }) => {
      const found = searchEndpoints(indexData as Endpoint[], query, { tag, method, limit });
      if (found.length === 0) return "No matching endpoints. Try fewer or different keywords, or drop the tag/method filter.";
      return found.map(describe);
    },
  });
}
