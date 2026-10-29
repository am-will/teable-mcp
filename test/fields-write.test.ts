import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

const created = { id: "fld9", name: "Priority", type: "singleSelect", options: { choices: [] }, dbFieldName: "p", dbFieldType: "TEXT" };

describe("field write tools", () => {
  it("creates a field and trims the result", async () => {
    const t = await connectToFakeTeable({ "POST /api/table/tbl1/field": created });
    const res = await t.call("teable_create_field", {
      tableId: "tbl1",
      name: "Priority",
      type: "singleSelect",
      options: { choices: [{ name: "High" }] },
    });
    expect(t.calls[0]?.body).toEqual({ name: "Priority", type: "singleSelect", options: { choices: [{ name: "High" }] } });
    expect(JSON.parse(t.text(res))).toEqual({ id: "fld9", name: "Priority", type: "singleSelect", options: { choices: [] } });
  });

  it("rejects an unknown field type", async () => {
    const t = await connectToFakeTeable();
    const res = await t.call("teable_create_field", { tableId: "tbl1", name: "X", type: "banana" });
    expect(res.isError).toBe(true);
    expect(t.calls).toHaveLength(0);
  });

  it("updates name and description, and needs at least one", async () => {
    const t = await connectToFakeTeable({
      // Teable's PATCH answers with an empty body; the tool reads the field back.
      "PATCH /api/table/tbl1/field/fld1": null,
      "GET /api/table/tbl1/field/fld1": { ...created, id: "fld1", name: "Prio" },
    });
    const res = await t.call("teable_update_field", { tableId: "tbl1", fieldId: "fld1", name: "Prio" });
    expect(t.calls[0]?.body).toEqual({ name: "Prio" });
    expect(JSON.parse(t.text(res))).toMatchObject({ id: "fld1", name: "Prio" });
    const empty = await t.call("teable_update_field", { tableId: "tbl1", fieldId: "fld1" });
    expect(empty.isError).toBe(true);
    expect(t.text(empty)).toContain("name and/or description");
    expect(t.calls).toHaveLength(2); // the PATCH and its read-back; the empty request made none
  });

  it("converts a field while keeping its name, description and constraints", async () => {
    const t = await connectToFakeTeable({
      "GET /api/table/tbl1/field/fld1": { id: "fld1", name: "Status", description: "d", notNull: true, unique: false, type: "singleLineText" },
      "PUT /api/table/tbl1/field/fld1/convert": created,
    });
    await t.call("teable_convert_field", {
      tableId: "tbl1",
      fieldId: "fld1",
      type: "singleSelect",
      options: { choices: [{ name: "A" }] },
    });
    expect(t.calls[1]?.body).toEqual({
      description: "d",
      notNull: true,
      unique: false,
      name: "Status",
      type: "singleSelect",
      options: { choices: [{ name: "A" }] },
    });
  });

  it("deletes fields via fieldIds[]", async () => {
    const t = await connectToFakeTeable({ "DELETE /api/table/tbl1/field": null });
    const res = await t.call("teable_delete_fields", { tableId: "tbl1", fieldIds: ["fld1", "fld2"] });
    expect(t.calls[0]?.url).toBe("/api/table/tbl1/field?fieldIds%5B%5D=fld1&fieldIds%5B%5D=fld2");
    expect(JSON.parse(t.text(res))).toEqual({ deleted: 2 });
  });

  it("hides every field write in read-only mode", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    const names = (await t.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_list_fields");
    for (const hidden of ["teable_create_field", "teable_update_field", "teable_convert_field", "teable_delete_fields"]) {
      expect(names).not.toContain(hidden);
    }
  });
});
