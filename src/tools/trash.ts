import { z } from "zod";
import { path, TeableApiError } from "../client.js";
import type { Registrar } from "./define.js";
import { tableId } from "./util.js";

/** Teable answers a bare 403 for the trash to personal access tokens, whatever their scopes, so say so instead of hinting at scopes. */
async function trashRequest<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof TeableApiError && err.status === 403) {
      throw new Error(
        "Teable refused this (HTTP 403). Teable does not let personal access tokens use the trash, whatever scopes the token has, so adding scopes will not help. Restore items from the trash in the Teable app instead.",
      );
    }
    throw err;
  }
}

export function registerTrashTools(r: Registrar): void {
  r.tool({
    name: "teable_list_trash",
    title: "List trash",
    description:
      "List deleted items that can still be restored: tables and other items in a base, or fields and records in a table. Each item has a trash id to pass to teable_restore_trash_item. " +
      "Only works with a browser login: Teable refuses personal access tokens here, so expect an error and send the user to the trash in the Teable app.",
    access: "read",
    input: {
      resourceType: z.enum(["base", "table"]).describe("Whether resourceId is a base or a table"),
      resourceId: z.string().min(1).describe("The base id (bse...) or table id (tbl...) to look in"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Items per page"),
      cursor: z.string().optional().describe("nextCursor from a previous call"),
    },
    handler: ({ resourceType, resourceId, pageSize, cursor }, { client }) =>
      trashRequest(() => client.get("/trash/items", { resourceType, resourceId, pageSize, cursor })),
  });

  r.tool({
    name: "teable_restore_trash_item",
    title: "Restore from trash",
    description:
      "Restore a deleted item (table, field, record and so on) using its trash id from teable_list_trash. For an item that was inside a table, also pass that tableId. " +
      "Like listing, this is refused for personal access tokens, so the user restores from the trash in the Teable app.",
    access: "write",
    idempotent: true,
    input: {
      trashId: z.string().min(1).describe("Trash item id from teable_list_trash"),
      tableId: tableId.optional().describe("The table the item was deleted from, when it was a field or record"),
    },
    handler: async ({ trashId, tableId }, { client }) => {
      const res = await trashRequest(() => client.post(path`/trash/restore/${trashId}`, undefined, { tableId }));
      return res ?? { restored: trashId };
    },
  });
}
