import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { baseId, pick, spaceId } from "./util.js";

const SPACE_KEYS = ["id", "name", "role"];
const BASE_KEYS = ["id", "name", "spaceId", "role", "lastModifiedTime"];

export function registerWorkspaceTools(r: Registrar): void {
  r.tool({
    name: "teable_list_spaces",
    title: "List spaces",
    description:
      "List the Teable spaces (workspaces) the token can see, with your role in each. Spaces contain bases; this is the top of the hierarchy.",
    access: "read",
    input: {},
    handler: async (_args, { client }) => pick(await client.get("/space"), SPACE_KEYS),
  });

  r.tool({
    name: "teable_list_bases",
    title: "List bases",
    description:
      "List bases (databases). Pass spaceId to list the bases in one space; omit it to list every base the token can access across all spaces. A base contains tables.",
    access: "read",
    input: { spaceId: spaceId.optional() },
    handler: async ({ spaceId }, { client }) =>
      pick(await client.get(spaceId ? path`/space/${spaceId}/base` : "/base/access/all"), BASE_KEYS),
  });

  r.tool({
    name: "teable_get_base",
    title: "Get base",
    description: "Get one base by id: its name, space and your role.",
    access: "read",
    input: { baseId },
    handler: async ({ baseId }, { client }) => pick(await client.get(path`/base/${baseId}`), BASE_KEYS),
  });

  r.tool({
    name: "teable_search_space",
    title: "Search a space",
    description:
      "Search a space by name for bases, tables, views, fields, records and more. Use it to find something when you do not know which base or table it is in. Returns a page of hits and a nextCursor when there are more.",
    access: "read",
    input: {
      spaceId,
      search: z.string().min(1).describe("Text to search for"),
      type: z
        .enum(["space", "base", "table", "view", "field", "record", "workflow", "app"])
        .optional()
        .describe("Only return this kind of result"),
      pageSize: z.number().int().min(1).max(100).optional().describe("Results per page"),
      cursor: z.string().optional().describe("nextCursor from a previous search, to get the next page"),
    },
    handler: ({ spaceId, ...query }, { client }) => client.get(path`/space/${spaceId}/search`, query),
  });
}
