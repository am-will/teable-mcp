import { z } from "zod";
import { path, type TeableClient } from "../client.js";

export const filterParam = z
  .object({
    conjunction: z.enum(["and", "or"]).describe("How the conditions combine"),
    filterSet: z
      .array(z.record(z.string(), z.unknown()))
      .describe(
        "Conditions. Each is {field, operator, value}, where field is a field name or id, or a nested {conjunction, filterSet} group. " +
          "Operators: is, isNot, contains, doesNotContain, isGreater, isGreaterEqual, isLess, isLessEqual, isEmpty, isNotEmpty (no value), " +
          "isAnyOf, isNoneOf (value is a list), hasAnyOf, hasAllOf, hasNoneOf, isExactly (multi-value fields), " +
          "isWithIn, isBefore, isAfter, isOnOrBefore, isOnOrAfter (dates, whose value is an object as built by https://app.teable.ai/developer/tool/query-builder).",
      ),
  })
  .describe(
    "Only match records that satisfy these conditions, e.g. {conjunction:'and', filterSet:[{field:'Status', operator:'is', value:'Open'}]}",
  );

export const orderByParam = z
  .array(z.object({ field: z.string().describe("Field name or id"), order: z.enum(["asc", "desc"]).default("asc") }))
  .describe("Sort order, applied in sequence");

type Resolve = (ref: string) => string;

interface FieldInfo {
  id: string;
  name: string;
}

export function makeResolver(fields: FieldInfo[]): Resolve {
  return (ref) => {
    const exact = fields.find((f) => f.id === ref) ?? fields.find((f) => f.name === ref);
    if (exact) return exact.id;
    const loose = fields.filter((f) => f.name.toLowerCase() === ref.toLowerCase());
    if (loose.length === 1 && loose[0]) return loose[0].id;
    throw new Error(`Unknown field "${ref}". Fields in this table: ${fields.map((f) => f.name).join(", ")}`);
  };
}

function translateFilter(node: unknown, resolve: Resolve): unknown {
  if (Array.isArray(node)) return node.map((n) => translateFilter(n, resolve));
  if (typeof node !== "object" || node === null) return node;
  const { field, ...rest } = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) out[key] = key === "filterSet" ? translateFilter(value, resolve) : value;
  if (typeof field === "string") out.fieldId = resolve(field);
  return out;
}

function usesFieldNames(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(usesFieldNames);
  if (typeof node !== "object" || node === null) return false;
  const obj = node as Record<string, unknown>;
  return typeof obj.field === "string" || usesFieldNames(obj.filterSet);
}

export interface RecordQueryInput {
  filter?: z.infer<typeof filterParam>;
  orderBy?: z.infer<typeof orderByParam>;
}

/**
 * Turn model-friendly filter/orderBy (fields by name or id) into the JSON strings Teable's query string expects.
 * Looks the table's fields up only when a name needs resolving.
 */
export async function buildRecordQuery(
  client: TeableClient,
  tableId: string,
  { filter, orderBy }: RecordQueryInput,
): Promise<{ filter?: string; orderBy?: string }> {
  let resolve: Resolve = (ref) => ref;
  if (usesFieldNames(filter) || orderBy?.length) {
    resolve = makeResolver(await client.get<FieldInfo[]>(path`/table/${tableId}/field`));
  }
  return {
    filter: filter ? JSON.stringify(translateFilter(filter, resolve)) : undefined,
    orderBy: orderBy?.length ? JSON.stringify(orderBy.map((o) => ({ fieldId: resolve(o.field), order: o.order }))) : undefined,
  };
}
