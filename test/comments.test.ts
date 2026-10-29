import { describe, expect, it } from "vitest";
import { commentText, toCommentContent } from "../src/tools/comments.js";
import { connectToFakeTeable } from "./helpers.js";

const rich = [
  {
    type: "p",
    children: [
      { type: "span", value: "Hi " },
      { type: "mention", value: "usr1", name: "Ada" },
      { type: "span", value: ", see " },
      { type: "a", url: "https://x.test", title: "the doc" },
    ],
  },
  { type: "p", children: [{ type: "span", value: "Thanks" }] },
  { type: "img", path: "p" },
];

describe("comment text conversion", () => {
  it("flattens rich blocks to text", () => {
    expect(commentText(rich)).toBe("Hi @Ada, see the doc (https://x.test)\nThanks\n[image]");
    expect(commentText(null)).toBe("");
  });
  it("round-trips plain text lines into paragraphs", () => {
    const blocks = toCommentContent("one\ntwo");
    expect(blocks).toEqual([
      { type: "p", children: [{ type: "span", value: "one" }] },
      { type: "p", children: [{ type: "span", value: "two" }] },
    ]);
    expect(commentText(blocks)).toBe("one\ntwo");
  });
});

describe("comment tools", () => {
  it("lists comments as readable text", async () => {
    const t = await connectToFakeTeable({
      "GET /api/comment/tbl1/rec1/list": {
        comments: [{ id: "cmt1", createdBy: "usr1", createdTime: "t", content: rich, reaction: [] }],
        nextCursor: "c2",
      },
    });
    const out = JSON.parse(t.text(await t.call("teable_list_comments", { tableId: "tbl1", recordId: "rec1" })));
    expect(out).toEqual({
      comments: [{ id: "cmt1", createdBy: "usr1", createdTime: "t", text: "Hi @Ada, see the doc (https://x.test)\nThanks\n[image]" }],
      nextCursor: "c2",
    });
    expect(t.calls[0]?.url).toBe("/api/comment/tbl1/rec1/list?take=20");
  });

  it("adds a comment as paragraph blocks", async () => {
    const t = await connectToFakeTeable({ "POST /api/comment/tbl1/rec1/create": { id: "cmt2", content: [] } });
    const res = await t.call("teable_add_comment", { tableId: "tbl1", recordId: "rec1", text: "Looks good" });
    expect(t.calls[0]?.body).toEqual({ content: [{ type: "p", children: [{ type: "span", value: "Looks good" }] }] });
    expect(JSON.parse(t.text(res))).toEqual({ id: "cmt2" });
  });

  it("deletes a comment, and hides writes in read-only mode", async () => {
    const t = await connectToFakeTeable({ "DELETE /api/comment/tbl1/rec1/cmt1": null });
    const res = await t.call("teable_delete_comment", { tableId: "tbl1", recordId: "rec1", commentId: "cmt1" });
    expect(JSON.parse(t.text(res))).toEqual({ deleted: "cmt1" });

    const ro = await connectToFakeTeable({}, { readOnly: true });
    const names = (await ro.client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("teable_list_comments");
    expect(names).not.toContain("teable_add_comment");
    expect(names).not.toContain("teable_delete_comment");
  });
});
