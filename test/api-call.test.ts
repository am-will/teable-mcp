import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

describe("teable_api_get", () => {
  it("calls the endpoint with query parameters", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/aggregation/row-count": { rowCount: 3 } });
    const res = await t.call("teable_api_get", { path: "/table/tbl1/aggregation/row-count", query: { viewId: "viw1" } });
    expect(JSON.parse(t.text(res))).toEqual({ rowCount: 3 });
    expect(t.calls[0]?.url).toBe("/api/table/tbl1/aggregation/row-count?viewId=viw1");
  });

  it("accepts a leading /api", async () => {
    const t = await connectToFakeTeable({ "GET /api/space": [] });
    await t.call("teable_api_get", { path: "/api/space" });
    expect(t.calls[0]?.url).toBe("/api/space");
  });

  it.each(["/access-token", "/admin/user", "/billing/x", "/auth/signin", "/table/../admin/x", "https://evil.test/x", "/table/x?y=1"])(
    "refuses %s without calling Teable",
    async (path) => {
      const t = await connectToFakeTeable();
      const res = await t.call("teable_api_get", { path });
      expect(res.isError).toBe(true);
      expect(t.calls).toHaveLength(0);
    },
  );

  it("still allows reading who you are", async () => {
    const t = await connectToFakeTeable({ "GET /api/auth/user": { id: "usr1" } });
    expect((await t.call("teable_api_get", { path: "/auth/user" })).isError).toBeUndefined();
  });
});

describe("teable_api_request", () => {
  it("sends a body with the chosen method", async () => {
    const t = await connectToFakeTeable({ "POST /api/base/bse1/sql-query": { rows: [] } });
    const res = await t.call("teable_api_request", { method: "POST", path: "/base/bse1/sql-query", body: { query: "select 1" } });
    expect(res.isError).toBeUndefined();
    expect(t.calls[0]).toMatchObject({ method: "POST", url: "/api/base/bse1/sql-query", body: { query: "select 1" } });
  });

  it.each([
    ["DELETE", "/base/bse1/permanent", /Permanent deletion/],
    ["DELETE", "/trash/trs1", /Permanent deletion/],
    ["DELETE", "/auth/user", /not available/],
    ["POST", "/access-token", /not available/],
    ["POST", "/base/bse1/collaborator", /sharing, collaborators/],
    ["POST", "/table/tbl1/view/viw1/enable-share", /sharing, collaborators/],
  ])("refuses %s %s", async (method, path, message) => {
    const t = await connectToFakeTeable();
    const res = await t.call("teable_api_request", { method, path });
    expect(res.isError).toBe(true);
    expect(t.text(res)).toMatch(message);
    expect(t.calls).toHaveLength(0);
  });

  it("does not accept GET, which belongs to teable_api_get", async () => {
    const t = await connectToFakeTeable();
    expect((await t.call("teable_api_request", { method: "GET", path: "/space" })).isError).toBe(true);
  });

  it("is hidden in read-only mode while teable_api_get stays", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    const names = (await t.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_api_get");
    expect(names).toContain("teable_search_api");
    expect(names).not.toContain("teable_api_request");
  });
});
