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
