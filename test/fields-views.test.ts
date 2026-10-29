import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

const field = {
  id: "fld1",
  name: "Status",
  type: "singleSelect",
  options: { choices: [{ name: "Open" }] },
  isPrimary: false,
  dbFieldName: "status",
  dbFieldType: "TEXT",
  aiConfig: null,
  recordRead: true,
  cellValueType: "string",
};

const view = {
  id: "viw1",
  name: "Grid",
  type: "grid",
  filter: { conjunction: "and", filterSet: [] },
  columnMeta: { fld1: { order: 0, width: 100 } },
  createdBy: "usr1",
};

describe("field tools", () => {
  it("lists fields keeping options but dropping db internals", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/field": [field], "GET /api/table/tbl1/field/fld1": field });
    const list = JSON.parse(t.text(await t.call("teable_list_fields", { tableId: "tbl1" })));
    expect(list).toEqual([
      {
        id: "fld1",
        name: "Status",
        type: "singleSelect",
        options: { choices: [{ name: "Open" }] },
        isPrimary: false,
        cellValueType: "string",
      },
    ]);
    const one = JSON.parse(t.text(await t.call("teable_get_field", { tableId: "tbl1", fieldId: "fld1" })));
    expect(one.dbFieldName).toBeUndefined();
    expect(one.options.choices).toHaveLength(1);
  });
});

describe("view write tools", () => {
  it("creates, renames and deletes views", async () => {
    const t = await connectToFakeTeable({
      "POST /api/table/tbl1/view": { ...view, id: "viw2", name: "Board", type: "kanban" },
      "PUT /api/table/tbl1/view/viw2/name": null,
      "DELETE /api/table/tbl1/view/viw2": null,
    });
    const created = await t.call("teable_create_view", { tableId: "tbl1", name: "Board", type: "kanban" });
    expect(t.calls[0]?.body).toEqual({ name: "Board", type: "kanban" });
    expect(JSON.parse(t.text(created))).toMatchObject({ id: "viw2", type: "kanban" });
    expect(JSON.parse(t.text(created)).columnMeta).toBeUndefined();

    await t.call("teable_rename_view", { tableId: "tbl1", viewId: "viw2", name: "Pipeline" });
    expect(t.calls[1]?.body).toEqual({ name: "Pipeline" });

    const deleted = await t.call("teable_delete_view", { tableId: "tbl1", viewId: "viw2" });
    expect(JSON.parse(t.text(deleted))).toEqual({ deleted: "viw2" });
  });

  it("defaults to a grid view and hides writes in read-only mode", async () => {
    const t = await connectToFakeTeable({ "POST /api/table/tbl1/view": view });
    await t.call("teable_create_view", { tableId: "tbl1", name: "All" });
    expect(t.calls[0]?.body).toEqual({ name: "All", type: "grid" });

    const ro = await connectToFakeTeable({}, { readOnly: true });
    const names = (await ro.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_list_views");
    expect(names).not.toContain("teable_create_view");
    expect(names).not.toContain("teable_delete_view");
  });
});

describe("view tools", () => {
  it("lists and gets views without the bulky columnMeta", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/view": [view], "GET /api/table/tbl1/view/viw1": view });
    const list = JSON.parse(t.text(await t.call("teable_list_views", { tableId: "tbl1" })));
    expect(list[0]).toEqual({ id: "viw1", name: "Grid", type: "grid", filter: view.filter });
    const one = JSON.parse(t.text(await t.call("teable_get_view", { tableId: "tbl1", viewId: "viw1" })));
    expect(one.columnMeta).toBeUndefined();
  });
});
