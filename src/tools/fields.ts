import { z } from "zod";
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

export const FIELD_TYPES = [
  "singleLineText",
  "longText",
  "number",
  "rating",
  "checkbox",
  "date",
  "singleSelect",
  "multipleSelect",
  "user",
  "attachment",
  "link",
  "formula",
  "rollup",
  "conditionalRollup",
  "autoNumber",
  "createdTime",
  "lastModifiedTime",
  "createdBy",
  "lastModifiedBy",
  "button",
] as const;

const OPTIONS_HELP =
  "Type-specific settings. Examples: select -> {choices:[{name:'Open'},{name:'Done'}]}; " +
  "link -> {relationship:'manyOne'|'oneMany'|'manyMany'|'oneOne', foreignTableId:'tbl...'}; " +
  "formula -> {expression:'{fld...} * 2'} (fields referenced by id in braces); number -> {formatting:{type:'decimal', precision:2}}. " +
  "Omit for plain text, checkbox and similar.";

const typeParam = z.enum(FIELD_TYPES).describe("Field type");
const optionsParam = z.record(z.string(), z.unknown()).optional().describe(OPTIONS_HELP);

export function registerFieldWriteTools(r: Registrar): void {
  r.tool({
    name: "teable_create_field",
    title: "Create field",
    description: "Add a field (column) to a table. Returns the new field including its id.",
    access: "write",
    input: {
      tableId,
      name: z.string().min(1).describe("Field name, unique within the table"),
      type: typeParam,
      description: z.string().optional(),
      options: optionsParam,
      notNull: z.boolean().optional().describe("Require a value"),
      unique: z.boolean().optional().describe("Require values to be unique"),
    },
    handler: async ({ tableId, ...body }, { client }) =>
      pick(await client.post(path`/table/${tableId}/field`, body), FIELD_KEYS),
  });

  r.tool({
    name: "teable_update_field",
    title: "Update field",
    description: "Rename a field or change its description. To change its type or options use teable_convert_field.",
    access: "write",
    idempotent: true,
    input: {
      tableId,
      fieldId,
      name: z.string().min(1).optional().describe("New name"),
      description: z.string().optional().describe("New description"),
    },
    handler: async ({ tableId, fieldId, name, description }, { client }) => {
      if (name === undefined && description === undefined) throw new Error("Provide a new name and/or description.");
      return pick(await client.patch(path`/table/${tableId}/field/${fieldId}`, { name, description }), FIELD_KEYS);
    },
  });

  r.tool({
    name: "teable_convert_field",
    title: "Convert field type",
    description:
      "Change a field's type and/or options, for example text to single select or adding a choice to a select. " +
      "Existing values are converted where possible and can be lost or changed, so confirm with the user first. " +
      "When changing only options, pass the field's current type along with the full new options.",
    access: "destructive",
    input: { tableId, fieldId, type: typeParam, options: optionsParam, name: z.string().min(1).optional().describe("Also rename") },
    handler: async ({ tableId, fieldId, type, options, name }, { client }) => {
      const current = await client.get<Record<string, unknown>>(path`/table/${tableId}/field/${fieldId}`);
      const body = {
        ...pick(current, ["description", "notNull", "unique"]) as object,
        name: name ?? current.name,
        type,
        options,
      };
      return pick(await client.put(path`/table/${tableId}/field/${fieldId}/convert`, body), FIELD_KEYS);
    },
  });

  r.tool({
    name: "teable_delete_fields",
    title: "Delete fields",
    description:
      "Delete fields (columns) and the data in them. Teable may keep them in the trash for a while, but confirm with the user before calling this. Fields that other fields depend on (formulas, lookups) can break.",
    access: "destructive",
    input: { tableId, fieldIds: z.array(fieldId).min(1).max(20).describe("Ids of the fields to delete") },
    handler: async ({ tableId, fieldIds }, { client }) => {
      await client.delete(path`/table/${tableId}/field`, { fieldIds });
      return { deleted: fieldIds.length };
    },
  });
}

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
