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
  const resolve = makeResolver(fields);
  it("accepts ids and names, ignoring case as a fallback", () => {
    expect(resolve("fld2")).toBe("fld2");
    expect(resolve("Status")).toBe("fld1");
    expect(resolve("status")).toBe("fld1");
  });
  it("lists the valid names when a field is unknown", () => {
    expect(() => resolve("Nope")).toThrow('Unknown field "Nope". Fields in this table: Status, Owner');
  });
  it("refuses an ambiguous case-insensitive match", () => {
    const r = makeResolver([
      { id: "a", name: "Name" },
      { id: "b", name: "NAME" },
    ]);
    expect(r("Name")).toBe("a");
    expect(() => r("name")).toThrow(/Unknown field/);
  });
});

describe("buildRecordQuery", () => {
  it("returns nothing and makes no request when there is no filter or sort", async () => {
    const { client, calls } = fakeClient();
    expect(await buildRecordQuery(client, "tbl1", {})).toEqual({ filter: undefined, orderBy: undefined });
    expect(calls).toHaveLength(0);
  });

  it("resolves field names in nested filters to fieldId", async () => {
    const { client, calls } = fakeClient();
    const { filter } = await buildRecordQuery(client, "tbl1", {
      filter: {
        conjunction: "and",
        filterSet: [
          { field: "Status", operator: "is", value: "Open" },
          { conjunction: "or", filterSet: [{ field: "Owner", operator: "isEmpty" }] },
        ],
      },
    });
    expect(calls).toEqual(["/table/tbl1/field"]);
    expect(JSON.parse(filter ?? "")).toEqual({
      conjunction: "and",
      filterSet: [
        { fieldId: "fld1", operator: "is", value: "Open" },
        { conjunction: "or", filterSet: [{ fieldId: "fld2", operator: "isEmpty" }] },
      ],
    });
  });

  it("passes a filter that already uses fieldId through without a lookup", async () => {
    const { client, calls } = fakeClient();
    const filter = { conjunction: "and" as const, filterSet: [{ fieldId: "fld1", operator: "is", value: "x" }] };
    const out = await buildRecordQuery(client, "tbl1", { filter });
    expect(calls).toHaveLength(0);
    expect(JSON.parse(out.filter ?? "")).toEqual(filter);
  });

  it("does not touch a condition's value even if it has a field key", async () => {
    const { client } = fakeClient();
    const out = await buildRecordQuery(client, "tbl1", {
      filter: { conjunction: "and", filterSet: [{ field: "Status", operator: "is", value: { field: "Owner" } }] },
    });
    expect(JSON.parse(out.filter ?? "").filterSet[0].value).toEqual({ field: "Owner" });
  });

  it("builds orderBy as a JSON string of {fieldId, order}", async () => {
    const { client } = fakeClient();
    const { orderBy } = await buildRecordQuery(client, "tbl1", {
      orderBy: [{ field: "Owner", order: "desc" }, { field: "fld1", order: "asc" }],
    });
    expect(orderBy).toBe('[{"fieldId":"fld2","order":"desc"},{"fieldId":"fld1","order":"asc"}]');
  });
});
