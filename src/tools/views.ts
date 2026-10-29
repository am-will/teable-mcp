import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { pick, tableId, viewId } from "./util.js";

export const VIEW_KEYS = [
  "id",
  "name",
  "type",
  "description",
  "filter",
  "sort",
  "group",
  "options",
  "isLocked",
  "enableShare",
  "shareId",
];

export function registerViewWriteTools(r: Registrar): void {
  r.tool({
    name: "teable_create_view",
    title: "Create view",
    description:
      "Create a view on a table. Returns the new view's id. To set its filter or sort afterwards, use teable_api_request (see teable_search_api).",
    access: "write",
    input: {
      tableId,
      name: z.string().min(1).describe("View name"),
      type: z.enum(["grid", "kanban", "calendar", "form", "gallery"]).default("grid").describe("View type"),
    },
    handler: async ({ tableId, name, type }, { client }) =>
      pick(await client.post(path`/table/${tableId}/view`, { name, type }), VIEW_KEYS),
  });

  r.tool({
    name: "teable_rename_view",
    title: "Rename view",
    description: "Change a view's name.",
    access: "write",
    idempotent: true,
    input: { tableId, viewId, name: z.string().min(1).describe("New view name") },
    handler: ({ tableId, viewId, name }, { client }) => client.put(path`/table/${tableId}/view/${viewId}/name`, { name }),
  });

  r.tool({
    name: "teable_delete_view",
    title: "Delete view",
    description: "Delete a view. The records and fields stay; only this saved way of looking at them goes. Confirm with the user first.",
    access: "destructive",
    input: { tableId, viewId },
    handler: async ({ tableId, viewId }, { client }) => {
      await client.delete(path`/table/${tableId}/view/${viewId}`);
      return { deleted: viewId };
    },
  });
}

export function registerViewTools(r: Registrar): void {
  r.tool({
    name: "teable_list_views",
    title: "List views",
    description:
      "List a table's views (grid, kanban, calendar, form, gallery) with their saved filter, sort and grouping. Pass a view id to teable_list_records to read records the way that view shows them.",
    access: "read",
    input: { tableId },
    handler: async ({ tableId }, { client }) => pick(await client.get(path`/table/${tableId}/view`), VIEW_KEYS),
  });

  r.tool({
    name: "teable_get_view",
    title: "Get view",
    description: "Get one view's saved filter, sort, grouping and options by id.",
    access: "read",
    input: { tableId, viewId },
    handler: async ({ tableId, viewId }, { client }) =>
      pick(await client.get(path`/table/${tableId}/view/${viewId}`), VIEW_KEYS),
  });
}
