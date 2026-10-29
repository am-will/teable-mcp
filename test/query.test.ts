import { describe, expect, it } from "vitest";
import type { TeableClient } from "../src/client.js";
import { buildRecordQuery, makeResolver } from "../src/tools/query.js";

const fields = [
  { id: "fld1", name: "Status" },
  { id: "fld2", name: "Owner" },
];

function fakeClient() {
  const calls: string[] = [];
  const client = {
    get: async (p: string) => {
      calls.push(p);
      return fields;
    },
  } as unknown as TeableClient;
  return { client, calls };
}

describe("makeResolver", () => {
  it("writes the canonical name in name mode, whether given an id or a name", () => {
    const resolve = makeResolver(fields, "name");
    expect(resolve("fld2")).toBe("Owner");
    expect(resolve("Status")).toBe("Status");
    expect(resolve("status")).toBe("Status");
  });
  it("writes the id in id mode", () => {
    const resolve = makeResolver(fields, "id");
    expect(resolve("Owner")).toBe("fld2");
    expect(resolve("fld1")).toBe("fld1");
  });
  it("lists the valid names when a field is unknown", () => {
    expect(() => makeResolver(fields, "name")("Nope")).toThrow('Unknown field "Nope". Fields in this table: Status, Owner');
  });
  it("refuses an ambiguous case-insensitive match", () => {
    const r = makeResolver(
      [
        { id: "a", name: "Name" },
        { id: "b", name: "NAME" },
      ],
      "id",
    );
    expect(r("Name")).toBe("a");
    expect(() => r("name")).toThrow(/Unknown field/);
  });
});

describe("buildRecordQuery", () => {
  it("returns nothing and makes no request when there is no filter or sort", async () => {
    const { client, calls } = fakeClient();
    expect(await buildRecordQuery(client, "tbl1", {}, "name")).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it("in name mode writes field names, because Teable ignores an id there", async () => {
    const { client, calls } = fakeClient();
    const { filter } = await buildRecordQuery(
      client,
      "tbl1",
      {
        filter: {
          conjunction: "and",
          filterSet: [
            { field: "Status", operator: "is", value: "Open" },
            { conjunction: "or", filterSet: [{ field: "fld2", operator: "isAnyOf", value: ["a"] }] },
          ],
        },
      },
      "name",
    );
    expect(calls).toEqual(["/table/tbl1/field"]);
    expect(JSON.parse(filter ?? "")).toEqual({
      conjunction: "and",
      filterSet: [
        { fieldId: "Status", operator: "is", value: "Open" },
        { conjunction: "or", filterSet: [{ fieldId: "Owner", operator: "isAnyOf", value: ["a"] }] },
      ],
    });
  });

  it("in id mode writes field ids", async () => {
    const { client } = fakeClient();
    const { filter } = await buildRecordQuery(
      client,
      "tbl1",
      { filter: { conjunction: "and", filterSet: [{ field: "Status", operator: "is", value: "Open" }] } },
      "id",
    );
    expect(JSON.parse(filter ?? "").filterSet[0].fieldId).toBe("fld1");
  });

  it("also corrects a condition that already uses fieldId", async () => {
    const { client } = fakeClient();
    const { filter } = await buildRecordQuery(
      client,
      "tbl1",
      { filter: { conjunction: "and", filterSet: [{ fieldId: "fld1", operator: "is", value: "x" }] } },
      "name",
    );
    expect(JSON.parse(filter ?? "").filterSet[0]).toEqual({ fieldId: "Status", operator: "is", value: "x" });
  });

  it("adds value:null to conditions without one, since Teable rejects them otherwise", async () => {
    const { client } = fakeClient();
    const { filter } = await buildRecordQuery(
      client,
      "tbl1",
      {
        filter: {
          conjunction: "and",
          filterSet: [
            { field: "Owner", operator: "isEmpty" },
            { field: "Status", operator: "isNotEmpty", value: null },
            { field: "Status", operator: "is", value: "" },
          ],
        },
      },
      "name",
    );
    expect(JSON.parse(filter ?? "").filterSet).toEqual([
      { fieldId: "Owner", operator: "isEmpty", value: null },
      { fieldId: "Status", operator: "isNotEmpty", value: null },
      { fieldId: "Status", operator: "is", value: "" },
    ]);
  });

  it("does not touch a condition's value even if it has a field key", async () => {
    const { client } = fakeClient();
    const out = await buildRecordQuery(
      client,
      "tbl1",
      { filter: { conjunction: "and", filterSet: [{ field: "Status", operator: "is", value: { field: "Owner" } }] } },
      "name",
    );
    expect(JSON.parse(out.filter ?? "").filterSet[0].value).toEqual({ field: "Owner" });
  });

  it("builds orderBy as a JSON string of {fieldId, order} in the requested mode", async () => {
    const { client } = fakeClient();
    const sort = [
      { field: "Owner", order: "desc" as const },
      { field: "fld1", order: "asc" as const },
    ];
    expect((await buildRecordQuery(client, "tbl1", { orderBy: sort }, "name")).orderBy).toBe(
      '[{"fieldId":"Owner","order":"desc"},{"fieldId":"Status","order":"asc"}]',
    );
    expect((await buildRecordQuery(client, "tbl1", { orderBy: sort }, "id")).orderBy).toBe(
      '[{"fieldId":"fld2","order":"desc"},{"fieldId":"fld1","order":"asc"}]',
    );
  });
});
