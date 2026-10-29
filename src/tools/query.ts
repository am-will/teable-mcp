import { z } from "zod";
import { path, type TeableClient } from "../client.js";

export const filterParam = z
  .object({
    conjunction: z.enum(["and", "or"]).describe("How the conditions combine"),
    filterSet: z
      .array(z.record(z.string(), z.unknown()))
      .describe(
        "Conditions. Each is {field, operator, value}, where field is a field name or id, or a nested {conjunction, filterSet} group. " +
          "Operators: is, isNot, contains, doesNotContain, isGreater, isGreaterEqual, isLess, isLessEqual, isEmpty and isNotEmpty (no value needed), " +
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

/**
 * How fields are written in a request's filter and sort. Teable reads a condition's `fieldId` according to the
 * request's fieldKeyType: with "name" it must hold the field name, and an id there is silently ignored, so the
 * filter matches every record. Endpoints without a fieldKeyType option (such as row-count) want ids.
 */
export type RefMode = "name" | "id";

type Resolve = (ref: string) => string;

interface FieldInfo {
  id: string;
  name: string;
}

export function makeResolver(fields: FieldInfo[], mode: RefMode): Resolve {
  return (ref) => {
    const loose = fields.filter((f) => f.name.toLowerCase() === ref.toLowerCase());
    const match = fields.find((f) => f.id === ref) ?? fields.find((f) => f.name === ref) ?? (loose.length === 1 ? loose[0] : undefined);
    if (!match) throw new Error(`Unknown field "${ref}". Fields in this table: ${fields.map((f) => f.name).join(", ")}`);
    return mode === "id" ? match.id : match.name;
  };
}

function translateFilter(node: unknown, resolve: Resolve): unknown {
  if (Array.isArray(node)) return node.map((n) => translateFilter(n, resolve));
  if (typeof node !== "object" || node === null) return node;
  const { field, fieldId, ...rest } = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) out[key] = key === "filterSet" ? translateFilter(value, resolve) : value;
  const ref = typeof field === "string" ? field : typeof fieldId === "string" ? fieldId : undefined;
  if (ref !== undefined) out.fieldId = resolve(ref);
  // Teable rejects a condition that has no `value` key, even for isEmpty and isNotEmpty.
  if (!("filterSet" in out) && !("value" in out)) out.value = null;
  return out;
}

export interface RecordQueryInput {
  filter?: z.infer<typeof filterParam>;
  orderBy?: z.infer<typeof orderByParam>;
}

/**
 * Turn model-friendly filter/orderBy (fields by name or id) into the JSON strings Teable's query string expects,
 * with each field written the way `mode` requires. Looks the table's fields up once, only when there is something to resolve.
 */
export async function buildRecordQuery(
  client: TeableClient,
  tableId: string,
  { filter, orderBy }: RecordQueryInput,
  mode: RefMode,
): Promise<{ filter?: string; orderBy?: string }> {
  if (!filter && !orderBy?.length) return {};
  const resolve = makeResolver(await client.get<FieldInfo[]>(path`/table/${tableId}/field`), mode);
  return {
    filter: filter ? JSON.stringify(translateFilter(filter, resolve)) : undefined,
    orderBy: orderBy?.length ? JSON.stringify(orderBy.map((o) => ({ fieldId: resolve(o.field), order: o.order }))) : undefined,
  };
}
