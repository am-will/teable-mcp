import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

const stored = (id: string, fields: Record<string, unknown>) => ({ id, fields, autoNumber: 1, createdTime: "t" });

describe("record write tools", () => {
  it("creates records, wrapping each field map and keying by name", async () => {
    const t = await connectToFakeTeable({
      "POST /api/table/tbl1/record": { records: [stored("rec1", { Name: "Ada" }), stored("rec2", { Name: "Bo" })] },
    });
    const res = await t.call("teable_create_records", { tableId: "tbl1", records: [{ Name: "Ada" }, { Name: "Bo" }] });
    expect(t.calls[0]?.body).toEqual({
      fieldKeyType: "name",
      typecast: false,
      records: [{ fields: { Name: "Ada" } }, { fields: { Name: "Bo" } }],
    });
    expect(JSON.parse(t.text(res))).toEqual({
      created: 2,
      records: [
        { id: "rec1", fields: { Name: "Ada" } },
        { id: "rec2", fields: { Name: "Bo" } },
      ],
    });
  });

  it("passes typecast through when asked", async () => {
    const t = await connectToFakeTeable({ "POST /api/table/tbl1/record": { records: [] } });
    await t.call("teable_create_records", { tableId: "tbl1", records: [{ Status: "Open" }], typecast: true });
    expect((t.calls[0]?.body as { typecast: boolean }).typecast).toBe(true);
  });

  it("updates only the given fields", async () => {
    const t = await connectToFakeTeable({ "PATCH /api/table/tbl1/record": [stored("rec1", { Status: "Done" })] });
    const res = await t.call("teable_update_records", {
      tableId: "tbl1",
      records: [{ id: "rec1", fields: { Status: "Done" } }],
    });
    expect(t.calls[0]?.body).toEqual({
      fieldKeyType: "name",
      typecast: false,
      records: [{ id: "rec1", fields: { Status: "Done" } }],
    });
    expect(JSON.parse(t.text(res))).toEqual({ updated: 1, records: [{ id: "rec1", fields: { Status: "Done" } }] });
  });

  it("deletes with recordIds[] in the query string", async () => {
    const t = await connectToFakeTeable({ "DELETE /api/table/tbl1/record": null });
    const res = await t.call("teable_delete_records", { tableId: "tbl1", recordIds: ["rec1", "rec2"] });
    expect(t.calls[0]?.url).toBe("/api/table/tbl1/record?recordIds%5B%5D=rec1&recordIds%5B%5D=rec2");
    expect(JSON.parse(t.text(res))).toEqual({ deleted: 2 });
  });

  it("rejects empty and oversized batches before calling the API", async () => {
    const t = await connectToFakeTeable();
    expect((await t.call("teable_create_records", { tableId: "tbl1", records: [] })).isError).toBe(true);
    const many = Array.from({ length: 101 }, () => ({ Name: "x" }));
    expect((await t.call("teable_create_records", { tableId: "tbl1", records: many })).isError).toBe(true);
    expect((await t.call("teable_delete_records", { tableId: "tbl1", recordIds: [] })).isError).toBe(true);
    expect(t.calls).toHaveLength(0);
  });

  it("is hidden in read-only mode", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    const names = (await t.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_list_records");
    for (const hidden of ["teable_create_records", "teable_update_records", "teable_delete_records"]) {
      expect(names).not.toContain(hidden);
    }
  });
});
