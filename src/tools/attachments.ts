import { z } from "zod";
import { path } from "../client.js";
import type { Registrar } from "./define.js";
import { fieldId, pick, recordId, tableId } from "./util.js";

export function registerAttachmentTools(r: Registrar): void {
  r.tool({
    name: "teable_attach_file_from_url",
    title: "Attach a file from a URL",
    description:
      "Add a file to a record's attachment field by giving Teable a URL to fetch it from, which must be reachable from the internet. The file is appended to what is already in the cell. " +
      "Uploading files from this computer is not supported. To read existing attachments, list the record: attachment cells include file names and links.",
    access: "write",
    input: {
      tableId,
      recordId,
      fieldId: fieldId.describe("The attachment field's id (fld...), from teable_list_fields"),
      fileUrl: z.url({ protocol: /^https?$/ }).describe("http(s) URL of the file"),
    },
    handler: async ({ tableId, recordId, fieldId, fileUrl }, { client }) => {
      const form = new FormData();
      form.set("fileUrl", fileUrl);
      const res = await client.postForm(path`/table/${tableId}/record/${recordId}/${fieldId}/uploadAttachment`, form);
      return pick(res, ["id", "fields"]);
    },
  });
}
