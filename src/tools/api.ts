import { z } from "zod";
import indexData from "../generated/endpoints.json" with { type: "json" };
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
