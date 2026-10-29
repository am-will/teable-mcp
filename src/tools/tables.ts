import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { baseId, pick, tableId } from "./util.js";

const TABLE_KEYS = ["id", "name", "description", "icon", "defaultViewId", "lastModifiedTime"];
const FIELD_SUMMARY_KEYS = ["id", "name", "type", "isPrimary"];

export function registerTableTools(r: Registrar): void {
  r.tool({
    name: "teable_list_tables",
    title: "List tables",
    description: "List the tables in a base, with their ids, names and descriptions.",
    access: "read",
    input: { baseId },
    handler: async ({ baseId }, { client }) => pick(await client.get(path`/base/${baseId}/table`), TABLE_KEYS),
  });

  r.tool({
    name: "teable_get_table",
    title: "Get table",
    description: "Get one table's details: name, description and default view id. Use teable_list_fields for its columns.",
    access: "read",
    input: { baseId, tableId },
    handler: async ({ baseId, tableId }, { client }) =>
      pick(await client.get(path`/base/${baseId}/table/${tableId}`), TABLE_KEYS),
  });

  r.tool({
    name: "teable_create_table",
    title: "Create table",
    description:
      "Create a table in a base. Optionally pass fields to define the schema up front, each as {name, type, options?} using the same shape as teable_create_field. Returns the new table with its fields.",
    access: "write",
    input: {
      baseId,
      name: z.string().min(1).describe("Table name"),
      description: z.string().optional().describe("What the table is for"),
      fields: z
        .array(z.record(z.string(), z.unknown()))
        .optional()
        .describe("Field definitions, e.g. [{ name: 'Email', type: 'singleLineText' }]. The first one becomes the primary field."),
    },
    handler: async ({ baseId, ...body }, { client }) => {
      const table = (await client.post(path`/base/${baseId}/table`, body)) as Record<string, unknown>;
      return { ...(pick(table, TABLE_KEYS) as object), fields: pick(table.fields, FIELD_SUMMARY_KEYS) };
    },
  });

  r.tool({
    name: "teable_rename_table",
    title: "Rename table",
    description: "Change a table's name.",
    access: "write",
    idempotent: true,
    input: { baseId, tableId, name: z.string().min(1).describe("New table name") },
    handler: ({ baseId, tableId, name }, { client }) =>
      client.put(path`/base/${baseId}/table/${tableId}/name`, { name }),
  });

  r.tool({
    name: "teable_set_table_description",
    title: "Set table description",
    description: "Set or replace a table's description. Pass an empty string to clear it.",
    access: "write",
    idempotent: true,
    input: { baseId, tableId, description: z.string().describe("New description") },
    handler: ({ baseId, tableId, description }, { client }) =>
      client.put(path`/base/${baseId}/table/${tableId}/description`, { description }),
  });

  r.tool({
    name: "teable_duplicate_table",
    title: "Duplicate table",
    description: "Copy a table within its base, optionally including its records.",
    access: "write",
    input: {
      baseId,
      tableId,
      name: z.string().min(1).describe("Name for the copy"),
      includeRecords: z.boolean().default(false).describe("Also copy the records, not just the structure"),
    },
    handler: async ({ baseId, tableId, name, includeRecords }, { client }) =>
      pick(await client.post(path`/base/${baseId}/table/${tableId}/duplicate`, { name, includeRecords }), TABLE_KEYS),
  });

  r.tool({
    name: "teable_delete_table",
    title: "Delete table",
    description:
      "Delete a table and all of its records. Teable moves it to the trash first, so it can be restored from there until it is permanently deleted. Confirm with the user before calling this.",
    access: "destructive",
    input: { baseId, tableId },
    handler: ({ baseId, tableId }, { client }) => client.delete(path`/base/${baseId}/table/${tableId}`),
  });
}
