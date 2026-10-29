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
      const query = await buildRecordQuery(client, tableId, { filter, orderBy });
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
      const query = await buildRecordQuery(client, tableId, { filter });
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
