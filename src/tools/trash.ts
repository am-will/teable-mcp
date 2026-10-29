import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { tableId } from "./util.js";

export function registerTrashTools(r: Registrar): void {
  r.tool({
    name: "teable_list_trash",
    title: "List trash",
    description:
      "List deleted items that can still be restored: tables and other items in a base, or fields and records in a table. Each item has a trash id to pass to teable_restore_trash_item.",
    access: "read",
    input: {
      resourceType: z.enum(["base", "table"]).describe("Whether resourceId is a base or a table"),
      resourceId: z.string().min(1).describe("The base id (bse...) or table id (tbl...) to look in"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Items per page"),
      cursor: z.string().optional().describe("nextCursor from a previous call"),
    },
    handler: ({ resourceType, resourceId, pageSize, cursor }, { client }) =>
      client.get("/trash/items", { resourceType, resourceId, pageSize, cursor }),
  });

  r.tool({
    name: "teable_restore_trash_item",
    title: "Restore from trash",
    description:
      "Restore a deleted item (table, field, record and so on) using its trash id from teable_list_trash. For an item that was inside a table, also pass that tableId.",
    access: "write",
    idempotent: true,
    input: {
      trashId: z.string().min(1).describe("Trash item id from teable_list_trash"),
      tableId: tableId.optional().describe("The table the item was deleted from, when it was a field or record"),
    },
    handler: async ({ trashId, tableId }, { client }) => {
      const res = await client.post(path`/trash/restore/${trashId}`, undefined, { tableId });
      return res ?? { restored: trashId };
    },
  });
}
