import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { buildRecordQuery, filterParam, orderByParam } from "./query.js";
import { pick, recordId, tableId, viewId } from "./util.js";

const RECORD_KEYS = ["id", "fields", "createdTime", "lastModifiedTime"];
const MAX_TAKE = 100;

const fieldsParam = z
  .array(z.string())
  .optional()
  .describe("Only return these fields, by name. Default: all visible fields. Use it to keep large tables small.");

const MAX_BATCH = 100;

const VALUE_FORMATS =
  "Value formats by field type: text -> string; number and rating -> number; checkbox -> boolean; date -> ISO 8601 string; " +
  "single select -> option name; multiple select -> array of option names; link -> {id: 'recXXX'} (an array of those if the field allows several); " +
  "user -> {id, title} (array if several). Attachments are not set here. Computed fields (formula, lookup, rollup, auto number, " +
  "created/modified time and by) are read-only: check isComputed in teable_list_fields.";

const typecastParam = z
  .boolean()
  .default(false)
  .describe("Let Teable convert values to the field's type, such as text to a select option or linked record. Off by default so mistakes fail loudly.");

const fieldValues = z.record(z.string(), z.unknown());

export function registerRecordWriteTools(r: Registrar): void {
  r.tool({
    name: "teable_create_records",
    title: "Create records",
    description:
      `Add new records to a table. Each item in records maps field names to values, e.g. {"Name": "Ada", "Status": "Open"}; fields you leave out stay empty. Up to ${MAX_BATCH} per call. ` +
      VALUE_FORMATS,
    access: "write",
    input: {
      tableId,
      records: z.array(fieldValues).min(1).max(MAX_BATCH).describe("The records to create, each a map of field name to value"),
      typecast: typecastParam,
    },
    handler: async ({ tableId, records, typecast }, { client }) => {
      const res = await client.post<{ records: unknown[] }>(path`/table/${tableId}/record`, {
        fieldKeyType: "name",
        typecast,
        records: records.map((fields) => ({ fields })),
      });
      return { created: res.records.length, records: pick(res.records, ["id", "fields"]) };
    },
  });

  r.tool({
    name: "teable_update_records",
    title: "Update records",
    description:
      `Change fields on existing records. Only the fields you give are changed; others keep their values. Up to ${MAX_BATCH} records per call. ` +
      VALUE_FORMATS,
    access: "write",
    idempotent: true,
    input: {
      tableId,
      records: z
        .array(z.object({ id: recordId, fields: fieldValues.describe("Field name to new value, only for fields to change") }))
        .min(1)
        .max(MAX_BATCH)
        .describe("The records to update"),
      typecast: typecastParam,
    },
    handler: async ({ tableId, records, typecast }, { client }) => {
      const res = await client.patch<unknown[]>(path`/table/${tableId}/record`, { fieldKeyType: "name", typecast, records });
      return { updated: res.length, records: pick(res, ["id", "fields"]) };
    },
  });

  r.tool({
    name: "teable_delete_records",
    title: "Delete records",
    description:
      `Delete records by id, up to ${MAX_BATCH} per call. Deleted records may not be recoverable, so confirm with the user which records will go before calling this.`,
    access: "destructive",
    input: { tableId, recordIds: z.array(recordId).min(1).max(MAX_BATCH).describe("Ids of the records to delete") },
    handler: async ({ tableId, recordIds }, { client }) => {
      await client.delete(path`/table/${tableId}/record`, { recordIds });
      return { deleted: recordIds.length };
    },
  });
}

export function registerRecordReadTools(r: Registrar): void {
  r.tool({
    name: "teable_list_records",
    title: "List records",
    description:
      "Read records (rows) from a table, optionally filtered, sorted and limited to some fields. Values are keyed by field name. " +
      `Returns up to ${MAX_TAKE} records per call; when more may exist the result includes nextSkip, which you pass as skip to get the next page. ` +
      "Call teable_list_fields first so filter conditions use real field names and valid values.",
    access: "read",
    input: {
      tableId,
      viewId: viewId.optional().describe("Read as this view shows the data (its saved filter, sort and hidden fields)"),
      fields: fieldsParam,
      filter: filterParam.optional(),
      orderBy: orderByParam.optional(),
      take: z.number().int().min(1).max(MAX_TAKE).default(50).describe("How many records to return"),
      skip: z.number().int().min(0).default(0).describe("How many records to skip, for paging"),
    },
    handler: async ({ tableId, viewId, fields, filter, orderBy, take, skip }, { client }) => {
      const query = await buildRecordQuery(client, tableId, { filter, orderBy }, "name");
      const res = await client.get<{ records: unknown[] }>(path`/table/${tableId}/record`, {
        viewId,
        projection: fields,
        filter: query.filter,
        orderBy: query.orderBy,
        take,
        skip,
        fieldKeyType: "name",
        cellFormat: "json",
      });
      const records = res.records.map((rec) => pick(rec, RECORD_KEYS));
      return { records, returned: records.length, skip, nextSkip: records.length === take ? skip + take : undefined };
    },
  });

  r.tool({
    name: "teable_get_record",
    title: "Get record",
    description: "Read one record by id. Values are keyed by field name.",
    access: "read",
    input: { tableId, recordId, fields: fieldsParam },
    handler: async ({ tableId, recordId, fields }, { client }) =>
      pick(
        await client.get(path`/table/${tableId}/record/${recordId}`, { projection: fields, fieldKeyType: "name", cellFormat: "json" }),
        RECORD_KEYS,
      ),
  });

  r.tool({
    name: "teable_count_records",
    title: "Count records",
    description: "Count the records in a table, optionally only those matching a filter or visible in a view. Cheaper than listing them.",
    access: "read",
    input: { tableId, viewId: viewId.optional(), filter: filterParam.optional() },
    handler: async ({ tableId, viewId, filter }, { client }) => {
      // row-count has no fieldKeyType option, so its filter is written with field ids.
      const query = await buildRecordQuery(client, tableId, { filter }, "id");
      return client.get(path`/table/${tableId}/aggregation/row-count`, { viewId, filter: query.filter });
    },
  });

  r.tool({
    name: "teable_get_record_history",
    title: "Get record history",
    description: "Show a record's change history: who changed which fields, when, and the before and after values.",
    access: "read",
    input: {
      tableId,
      recordId,
      cursor: z.string().optional().describe("nextCursor from a previous call, to get older changes"),
    },
    handler: ({ tableId, recordId, cursor }, { client }) =>
      client.get(path`/table/${tableId}/record/${recordId}/history`, { cursor }),
  });
}
