import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

const noisyBase = {
  id: "bse1",
  name: "CRM",
  spaceId: "spc1",
  role: "owner",
  icon: "x",
  createdBy: "usr1",
  createdUser: { id: "usr1" },
  v2Status: {},
  lastModifiedTime: "2026-01-01T00:00:00.000Z",
};

describe("workspace tools", () => {
  it("teable_list_spaces trims to id, name and role", async () => {
    const t = await connectToFakeTeable({
      "GET /api/space": [{ id: "spc1", name: "Acme", role: "owner", avatar: "a.png", dataDb: {} }],
    });
    expect(JSON.parse(t.text(await t.call("teable_list_spaces")))).toEqual([{ id: "spc1", name: "Acme", role: "owner" }]);
  });

  it("teable_list_bases lists every accessible base when no space is given", async () => {
    const t = await connectToFakeTeable({ "GET /api/base/access/all": [noisyBase] });
    const out = JSON.parse(t.text(await t.call("teable_list_bases")));
    expect(out).toEqual([
      { id: "bse1", name: "CRM", spaceId: "spc1", role: "owner", lastModifiedTime: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("teable_list_bases scopes to a space when given one", async () => {
    const t = await connectToFakeTeable({ "GET /api/space/spc1/base": [noisyBase] });
    await t.call("teable_list_bases", { spaceId: "spc1" });
    expect(t.calls[0]?.url).toBe("/api/space/spc1/base");
  });

  it("teable_get_base fetches one base", async () => {
    const t = await connectToFakeTeable({ "GET /api/base/bse1": noisyBase });
    expect(JSON.parse(t.text(await t.call("teable_get_base", { baseId: "bse1" })))).toMatchObject({ id: "bse1", name: "CRM" });
  });

  it("teable_search_space forwards the query and omits unset options", async () => {
    const t = await connectToFakeTeable({ "GET /api/space/spc1/search": { list: [], total: 0, nextCursor: "" } });
    await t.call("teable_search_space", { spaceId: "spc1", search: "invoices", type: "table" });
    expect(t.calls[0]?.url).toBe("/api/space/spc1/search?search=invoices&type=table");
  });

  it("rejects an empty id before calling the API", async () => {
    const t = await connectToFakeTeable();
    const res = await t.call("teable_get_base", { baseId: "" });
    expect(res.isError).toBe(true);
    expect(t.calls).toHaveLength(0);
  });
});
