import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

describe("teable_attach_file_from_url", () => {
  it("posts the url as a form field and returns the updated record", async () => {
    const t = await connectToFakeTeable({
      "POST /api/table/tbl1/record/rec1/fld1/uploadAttachment": { id: "rec1", fields: { Files: [{ name: "a.pdf" }] }, autoNumber: 3 },
    });
    const res = await t.call("teable_attach_file_from_url", {
      tableId: "tbl1",
      recordId: "rec1",
      fieldId: "fld1",
      fileUrl: "https://files.test/a.pdf",
    });
    expect(t.calls[0]?.body).toEqual({ fileUrl: "https://files.test/a.pdf" });
    expect(JSON.parse(t.text(res))).toEqual({ id: "rec1", fields: { Files: [{ name: "a.pdf" }] } });
  });

  it("only accepts http(s) urls", async () => {
    const t = await connectToFakeTeable();
    for (const fileUrl of ["file:///etc/passwd", "javascript:alert(1)", "not a url"]) {
      const res = await t.call("teable_attach_file_from_url", { tableId: "tbl1", recordId: "rec1", fieldId: "fld1", fileUrl });
      expect(res.isError).toBe(true);
    }
    expect(t.calls).toHaveLength(0);
  });

  it("is hidden in read-only mode", async () => {
    const t = await connectToFakeTeable({}, { readOnly: true });
    expect((await t.client.listTools()).tools.map((x) => x.name)).not.toContain("teable_attach_file_from_url");
  });
});
