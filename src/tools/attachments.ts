import { z } from "zod";
import { path, TeableApiError } from "../client.js";
import type { Registrar } from "./define.js";
import { fieldId, pick, recordId, tableId } from "./util.js";

/** Teable answers with the whole record keyed by field id. Return just the cell that was changed, without signed links or tokens. */
function summarizeUpload(res: unknown, attachmentFieldId: string): unknown {
  const record = res as { id?: string; fields?: Record<string, unknown> } | null;
  const cell = record?.fields?.[attachmentFieldId];
  if (!Array.isArray(cell)) return pick(res, ["id", "fields"]);
  return { id: record?.id, attachments: pick(cell, ["id", "name", "size", "mimetype"]) };
}

export function registerAttachmentTools(r: Registrar): void {
  r.tool({
    name: "teable_attach_file_from_url",
    title: "Attach a file from a URL",
    description:
      "Add a file to a record's attachment field by giving Teable a URL to fetch it from, which must be reachable from the internet. The file is appended to what is already in the cell, and the result lists every file now in it. " +
      "Teable downloads the file itself, so a host that refuses server-side downloads makes it fail with a bare HTTP 500; try another source. " +
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
      try {
        const res = await client.postForm(path`/table/${tableId}/record/${recordId}/${fieldId}/uploadAttachment`, form);
        return summarizeUpload(res, fieldId);
      } catch (err) {
        if (err instanceof TeableApiError && err.status === 500) {
          throw new Error(
            `${err.message}. Teable could not fetch or store that URL. It must be a public http(s) file; some hosts block downloads from servers (upload.wikimedia.org did on ours). Try a different URL.`,
          );
        }
        throw err;
      }
    },
  });
}
