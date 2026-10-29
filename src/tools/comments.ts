import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { pick, recordId, tableId } from "./util.js";

interface Node {
  type?: string;
  value?: unknown;
  name?: string;
  title?: string;
  url?: string;
  children?: Node[];
}

function inlineText(node: Node): string {
  switch (node.type) {
    case "span":
      return String(node.value ?? "");
    case "mention":
      return `@${node.name ?? node.value ?? ""}`;
    case "a":
      return node.title && node.title !== node.url ? `${node.title} (${node.url})` : String(node.url ?? "");
    default:
      return "";
  }
}

/** Flatten Teable's rich comment blocks to plain text. */
export function commentText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return (content as Node[])
    .map((block) => (block.type === "p" ? (block.children ?? []).map(inlineText).join("") : block.type === "img" ? "[image]" : ""))
    .join("\n");
}

/** One paragraph per line, as plain text spans. */
export function toCommentContent(text: string) {
  return text.split("\n").map((line) => ({ type: "p", children: [{ type: "span", value: line }] }));
}

const COMMENT_KEYS = ["id", "createdBy", "createdTime", "lastModifiedTime", "quoteId"];
const MAX_COMMENTS = 100;

export function registerCommentTools(r: Registrar): void {
  r.tool({
    name: "teable_list_comments",
    title: "List record comments",
    description: "Read the comments on a record as plain text, newest first by default. Returns nextCursor when there are more.",
    access: "read",
    input: {
      tableId,
      recordId,
      take: z.number().int().min(1).max(MAX_COMMENTS).default(20).describe("How many comments to return"),
      cursor: z.string().optional().describe("nextCursor from a previous call"),
    },
    handler: async ({ tableId, recordId, take, cursor }, { client }) => {
      const res = await client.get<{ comments: Array<{ content?: unknown }>; nextCursor?: string }>(
        path`/comment/${tableId}/${recordId}/list`,
        { take, cursor },
      );
      return {
        comments: res.comments.map((c) => ({ ...(pick(c, COMMENT_KEYS) as object), text: commentText(c.content) })),
        nextCursor: res.nextCursor ?? undefined,
      };
    },
  });

  r.tool({
    name: "teable_add_comment",
    title: "Add record comment",
    description:
      "Post a comment on a record, visible to everyone with access to the table. Plain text; separate paragraphs with a newline. Only post what the user asked you to say.",
    access: "write",
    input: { tableId, recordId, text: z.string().min(1).describe("The comment text") },
    handler: async ({ tableId, recordId, text }, { client }) =>
      pick(await client.post(path`/comment/${tableId}/${recordId}/create`, { content: toCommentContent(text) }), COMMENT_KEYS),
  });

  r.tool({
    name: "teable_delete_comment",
    title: "Delete record comment",
    description: "Delete one comment from a record. Confirm with the user first.",
    access: "destructive",
    input: { tableId, recordId, commentId: z.string().min(1).describe("Comment id") },
    handler: async ({ tableId, recordId, commentId }, { client }) => {
      await client.delete(path`/comment/${tableId}/${recordId}/${commentId}`);
      return { deleted: commentId };
    },
  });
}
