import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

const table = { id: "tbl1", name: "Leads", dbTableName: "bse1.leads", description: "d", order: 0, defaultViewId: "viw1" };

describe("table tools", () => {
  it("lists and gets tables, trimming internals", async () => {
    const t = await connectToFakeTeable({ "GET /api/base/bse1/table": [table], "GET /api/base/bse1/table/tbl1": table });
    const list = JSON.parse(t.text(await t.call("teable_list_tables", { baseId: "bse1" })));
    expect(list).toEqual([{ id: "tbl1", name: "Leads", description: "d", defaultViewId: "viw1" }]);
    const one = JSON.parse(t.text(await t.call("teable_get_table", { baseId: "bse1", tableId: "tbl1" })));
    expect(one.dbTableName).toBeUndefined();
  });

  it("creates a table with fields and summarizes the result", async () => {
    const t = await connectToFakeTeable({
      "POST /api/base/bse1/table": {
        ...table,
        fields: [{ id: "fld1", name: "Name", type: "singleLineText", isPrimary: true, dbFieldName: "x", options: {} }],
        views: [{ id: "viw1" }],
        records: [],
      },
    });
    const res = await t.call("teable_create_table", {
      baseId: "bse1",
      name: "Leads",
      fields: [{ name: "Name", type: "singleLineText" }],
    });
    expect(t.calls[0]?.body).toEqual({ name: "Leads", fields: [{ name: "Name", type: "singleLineText" }] });
    expect(JSON.parse(t.text(res))).toEqual({
      id: "tbl1",
      name: "Leads",
      description: "d",
      defaultViewId: "viw1",
      fields: [{ id: "fld1", name: "Name", type: "singleLineText", isPrimary: true }],
    });
  });

  it("renames, describes and duplicates", async () => {
    const t = await connectToFakeTeable({
      "PUT /api/base/bse1/table/tbl1/name": null,
      "PUT /api/base/bse1/table/tbl1/description": null,
      "POST /api/base/bse1/table/tbl1/duplicate": { ...table, id: "tbl2", name: "Copy" },
    });
    await t.call("teable_rename_table", { baseId: "bse1", tableId: "tbl1", name: "Clients" });
    await t.call("teable_set_table_description", { baseId: "bse1", tableId: "tbl1", description: "" });
    const dup = await t.call("teable_duplicate_table", { baseId: "bse1", tableId: "tbl1", name: "Copy" });
    expect(t.calls.map((c) => c.body)).toEqual([{ name: "Clients" }, { description: "" }, { name: "Copy", includeRecords: false }]);
    expect(JSON.parse(t.text(dup)).id).toBe("tbl2");
  });

  it("deletes a table", async () => {
    const t = await connectToFakeTeable({ "DELETE /api/base/bse1/table/tbl1": null });
    const res = await t.call("teable_delete_table", { baseId: "bse1", tableId: "tbl1" });
    expect(res.isError).toBeUndefined();
    expect(t.calls[0]).toMatchObject({ method: "DELETE", url: "/api/base/bse1/table/tbl1" });
  });

  it("hides the writes in read-only mode", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    const names = (await t.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_list_tables");
    expect(names).not.toContain("teable_create_table");
    expect(names).not.toContain("teable_delete_table");
  });
});
