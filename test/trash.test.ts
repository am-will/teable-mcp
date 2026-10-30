import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

describe("trash tools", () => {
  it("lists trash items for a table", async () => {
    const t = await connectToFakeTeable({ "GET /api/trash/items": { trashItems: [{ id: "trs1" }], userMap: {}, resourceMap: {} } });
    const res = await t.call("teable_list_trash", { resourceType: "table", resourceId: "tbl1", pageSize: 10 });
    expect(JSON.parse(t.text(res)).trashItems[0].id).toBe("trs1");
    expect(t.calls[0]?.url).toBe("/api/trash/items?resourceType=table&resourceId=tbl1&pageSize=10");
  });

  it("restores an item, passing tableId only when given", async () => {
    const t = await connectToFakeTeable({ "POST /api/trash/restore/trs1": null });
    const plain = await t.call("teable_restore_trash_item", { trashId: "trs1" });
    expect(JSON.parse(t.text(plain))).toEqual({ restored: "trs1" });
    await t.call("teable_restore_trash_item", { trashId: "trs1", tableId: "tbl1" });
    expect(t.calls.map((c) => c.url)).toEqual(["/api/trash/restore/trs1", "/api/trash/restore/trs1?tableId=tbl1"]);
  });

  it("explains the 403 Teable gives tokens for the trash instead of blaming scopes", async () => {
    const forbidden = () => new Response(JSON.stringify({ message: "Forbidden resource" }), { status: 403 });
    const t = await connectToFakeTeable({ "GET /api/trash/items": forbidden(), "POST /api/trash/restore/trs1": forbidden() });
    for (const res of [
      await t.call("teable_list_trash", { resourceType: "base", resourceId: "bse1" }),
      await t.call("teable_restore_trash_item", { trashId: "trs1" }),
    ]) {
      expect(res.isError).toBe(true);
      expect(t.text(res)).toContain("does not let personal access tokens use the trash");
      expect(t.text(res)).toContain("adding scopes will not help");
    }
  });

  it("hides restore in read-only mode but keeps listing", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    const names = (await t.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_list_trash");
    expect(names).not.toContain("teable_restore_trash_item");
  });
});
