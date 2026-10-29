import { describe, expect, it } from "vitest";
import { connectToFakeTeable, type RecordedCall } from "./helpers.js";

const query = (call: RecordedCall | undefined) => new URL(`https://x${call?.url}`).searchParams;
const fieldsRoute = { "GET /api/table/tbl1/field": [{ id: "fld1", name: "Status" }] };
const rec = (id: string) => ({ id, fields: { Status: "Open" }, createdTime: "t1", lastModifiedTime: "t2", autoNumber: 1, createdBy: "usr1" });

describe("teable_list_records", () => {
  it("reads records keyed by name and trims system columns", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/record": { records: [rec("rec1")] } });
    const out = JSON.parse(t.text(await t.call("teable_list_records", { tableId: "tbl1" })));
    expect(out).toEqual({
      records: [{ id: "rec1", fields: { Status: "Open" }, createdTime: "t1", lastModifiedTime: "t2" }],
      returned: 1,
      skip: 0,
    });
    const q = query(t.calls[0]);
    expect(q.get("take")).toBe("50");
    expect(q.get("skip")).toBe("0");
    expect(q.get("fieldKeyType")).toBe("name");
    expect(q.has("filter")).toBe(false);
  });

  it("sends projection, a resolved filter and a resolved sort", async () => {
    const t = await connectToFakeTeable({ ...fieldsRoute, "GET /api/table/tbl1/record": { records: [] } });
    await t.call("teable_list_records", {
      tableId: "tbl1",
      viewId: "viw1",
      fields: ["Status", "Owner"],
      filter: { conjunction: "and", filterSet: [{ field: "Status", operator: "is", value: "Open" }] },
      orderBy: [{ field: "Status", order: "desc" }],
    });
    const q = query(t.calls[1]);
    expect(q.get("viewId")).toBe("viw1");
    expect(q.getAll("projection[]")).toEqual(["Status", "Owner"]);
    // Records are keyed by name, and Teable ignores an id in a filter's fieldId in that mode, so names go out.
    expect(JSON.parse(q.get("filter") ?? "")).toEqual({
      conjunction: "and",
      filterSet: [{ fieldId: "Status", operator: "is", value: "Open" }],
    });
    expect(q.get("orderBy")).toBe('[{"fieldId":"Status","order":"desc"}]');
  });

  it("offers nextSkip only when a full page came back", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/record": { records: [rec("rec1"), rec("rec2")] } });
    const full = JSON.parse(t.text(await t.call("teable_list_records", { tableId: "tbl1", take: 2, skip: 10 })));
    expect(full.nextSkip).toBe(12);
    const partial = JSON.parse(t.text(await t.call("teable_list_records", { tableId: "tbl1", take: 5 })));
    expect(partial.nextSkip).toBeUndefined();
  });

  it("rejects take above the API limit", async () => {
    const t = await connectToFakeTeable();
    expect((await t.call("teable_list_records", { tableId: "tbl1", take: 101 })).isError).toBe(true);
    expect(t.calls).toHaveLength(0);
  });

  it("tells the model which fields exist when a filter names a bad one", async () => {
    const t = await connectToFakeTeable(fieldsRoute);
    const res = await t.call("teable_list_records", {
      tableId: "tbl1",
      filter: { conjunction: "and", filterSet: [{ field: "Nope", operator: "is", value: 1 }] },
    });
    expect(res.isError).toBe(true);
    expect(t.text(res)).toContain("Fields in this table: Status");
  });
});

describe("other record reads", () => {
  it("teable_get_record", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/record/rec1": rec("rec1") });
    const out = JSON.parse(t.text(await t.call("teable_get_record", { tableId: "tbl1", recordId: "rec1", fields: ["Status"] })));
    expect(out.id).toBe("rec1");
    expect(out.autoNumber).toBeUndefined();
    expect(query(t.calls[0]).getAll("projection[]")).toEqual(["Status"]);
  });

  it("teable_count_records applies a filter", async () => {
    const t = await connectToFakeTeable({ ...fieldsRoute, "GET /api/table/tbl1/aggregation/row-count": { rowCount: 7 } });
    const res = await t.call("teable_count_records", {
      tableId: "tbl1",
      filter: { conjunction: "and", filterSet: [{ field: "Status", operator: "is", value: "Open" }] },
    });
    expect(JSON.parse(t.text(res))).toEqual({ rowCount: 7 });
    // The count endpoint has no fieldKeyType, so its filter uses field ids.
    expect(JSON.parse(query(t.calls[1]).get("filter") ?? "").filterSet[0].fieldId).toBe("fld1");
  });

  it("teable_get_record_history passes the cursor", async () => {
    const t = await connectToFakeTeable({ "GET /api/table/tbl1/record/rec1/history": { historyList: [], userMap: {} } });
    await t.call("teable_get_record_history", { tableId: "tbl1", recordId: "rec1", cursor: "c1" });
    expect(t.calls[0]?.url).toBe("/api/table/tbl1/record/rec1/history?cursor=c1");
  });
});
