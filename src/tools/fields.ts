import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { fieldId, pick, tableId } from "./util.js";

export const FIELD_KEYS = [
  "id",
  "name",
  "type",
  "description",
  "options",
  "isPrimary",
  "isComputed",
  "isLookup",
  "notNull",
  "unique",
  "cellValueType",
  "isMultipleCellValue",
  "hasError",
];

export function registerFieldTools(r: Registrar): void {
  r.tool({
    name: "teable_list_fields",
    title: "List fields",
    description:
      "List a table's fields (columns): id, name, type and options such as select choices, link targets or formula expressions. Call this before reading with filters or writing records, so you use the exact field names, ids and types.",
    access: "read",
    input: { tableId },
    handler: async ({ tableId }, { client }) => pick(await client.get(path`/table/${tableId}/field`), FIELD_KEYS),
  });

  r.tool({
    name: "teable_get_field",
    title: "Get field",
    description: "Get one field's full definition by id.",
    access: "read",
    input: { tableId, fieldId },
    handler: async ({ tableId, fieldId }, { client }) =>
      pick(await client.get(path`/table/${tableId}/field/${fieldId}`), FIELD_KEYS),
  });
}
