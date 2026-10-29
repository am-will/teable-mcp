import { describe, expect, it } from "vitest";
import indexData from "../src/generated/endpoints.json" with { type: "json" };
import { checkApiRequest } from "../src/tools/api-policy.js";
import { type Endpoint, searchEndpoints } from "../src/tools/api.js";
import { connectToFakeTeable } from "./helpers.js";

const index = indexData as Endpoint[];
const ep = (m: string, p: string, t: string, s: string): Endpoint => ({ m, p, t, s, sc: "", q: [], b: "" });

describe("generated index", () => {
  it("is a reasonably complete, current-looking index", () => {
    expect(index.length).toBeGreaterThan(300);
    expect(index.some((e) => e.m === "GET" && e.p === "/table/{tableId}/record")).toBe(true);
    expect(index.some((e) => e.m === "POST" && e.p === "/base/{baseId}/sql-query")).toBe(true);
  });

  it("only lists endpoints the policy allows, so regenerate it after changing the policy", () => {
    const refused = index.filter((e) => {
      try {
        checkApiRequest(e.m, e.p);
        return false;
      } catch {
        return true;
      }
    });
    expect(refused.map((e) => `${e.m} ${e.p}`)).toEqual([]);
  });
});

describe("searchEndpoints", () => {
  const small = [
    ep("GET", "/table/{tableId}/record", "record", "List records"),
    ep("POST", "/table/{tableId}/record", "record", "Create records"),
    ep("PUT", "/table/{tableId}/view/{viewId}/filter", "view", "Update view filter"),
    ep("GET", "/table/{tableId}/view", "view", "Get view list"),
  ];

  it("requires every term when something matches them all", () => {
    expect(searchEndpoints(small, "view filter", { limit: 10 }).map((e) => e.p)).toEqual(["/table/{tableId}/view/{viewId}/filter"]);
  });

  it("falls back to any term when nothing matches them all", () => {
    const found = searchEndpoints(small, "records banana", { limit: 10 });
    expect(found.map((e) => e.s)).toEqual(["List records", "Create records"]);
  });

  it("filters by tag and method, case-insensitively", () => {
    expect(searchEndpoints(small, "table", { tag: "VIEW", limit: 10 })).toHaveLength(2);
    expect(searchEndpoints(small, "table", { method: "post", limit: 10 }).map((e) => e.s)).toEqual(["Create records"]);
  });

  it("respects the limit and returns nothing for gibberish", () => {
    expect(searchEndpoints(small, "table", { limit: 2 })).toHaveLength(2);
    expect(searchEndpoints(small, "zzzz", { limit: 5 })).toEqual([]);
  });
});

describe("teable_search_api", () => {
  it("finds the SQL endpoint and describes it compactly", async () => {
    const t = await connectToFakeTeable();
    const out = JSON.parse(t.text(await t.call("teable_search_api", { query: "sql query" })));
    expect(out[0]).toMatchObject({ method: "POST", path: "/base/{baseId}/sql-query" });
    expect(out[0].body).toBeTruthy();
    expect(t.calls).toHaveLength(0);
  });

  it("says so when nothing matches", async () => {
    const t = await connectToFakeTeable();
    expect(t.text(await t.call("teable_search_api", { query: "qqqqqqq" }))).toContain("No matching endpoints");
  });

  it("stays available in read-only mode", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    expect((await t.client.listTools()).tools.map((x) => x.name)).toContain("teable_search_api");
  });
});
