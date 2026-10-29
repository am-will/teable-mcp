import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

describe("teable_attach_file_from_url", () => {
  it("posts the url as a form field and lists the files now in the cell", async () => {
    const t = await connectToFakeTeable({
      "POST /api/table/tbl1/record/rec1/fld1/uploadAttachment": {
        id: "rec1",
        // Teable keys the returned record by field id and includes signed links and tokens.
        fields: { fld0: "Alpha", fld1: [{ id: "act1", name: "a.pdf", size: 9, mimetype: "application/pdf", token: "secret", presignedUrl: "/api/x?sig=1" }] },
        autoNumber: 3,
      },
    });
    const res = await t.call("teable_attach_file_from_url", {
      tableId: "tbl1",
      recordId: "rec1",
      fieldId: "fld1",
      fileUrl: "https://files.test/a.pdf",
    });
    expect(t.calls[0]?.body).toEqual({ fileUrl: "https://files.test/a.pdf" });
    expect(JSON.parse(t.text(res))).toEqual({
      id: "rec1",
      attachments: [{ id: "act1", name: "a.pdf", size: 9, mimetype: "application/pdf" }],
    });
    expect(t.text(res)).not.toContain("secret");
  });

  it("falls back to the raw record fields when the cell is not in the response", async () => {
    const t = await connectToFakeTeable({
      "POST /api/table/tbl1/record/rec1/fld1/uploadAttachment": { id: "rec1", fields: { other: 1 } },
    });
    const res = await t.call("teable_attach_file_from_url", { tableId: "tbl1", recordId: "rec1", fieldId: "fld1", fileUrl: "https://files.test/a.pdf" });
    expect(JSON.parse(t.text(res))).toEqual({ id: "rec1", fields: { other: 1 } });
  });

  it("explains a bare 500, which Teable returns when it cannot download the url", async () => {
    const t = await connectToFakeTeable({
      "POST /api/table/tbl1/record/rec1/fld1/uploadAttachment": new Response(JSON.stringify({ message: "Error" }), { status: 500 }),
    });
    const res = await t.call("teable_attach_file_from_url", { tableId: "tbl1", recordId: "rec1", fieldId: "fld1", fileUrl: "https://files.test/a.pdf" });
    expect(res.isError).toBe(true);
    expect(t.text(res)).toContain("Teable could not fetch or store that URL");
    expect(t.text(res)).toContain("Try a different URL");
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
