import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TeableClient } from "./client.js";
import type { Config } from "./config.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAttachmentTools } from "./tools/attachments.js";
import { registerCommentTools } from "./tools/comments.js";
import { createRegistrar } from "./tools/define.js";
import { registerFieldTools, registerFieldWriteTools } from "./tools/fields.js";
import { registerRecordReadTools, registerRecordWriteTools } from "./tools/records.js";
import { registerTableTools } from "./tools/tables.js";
import { registerTrashTools } from "./tools/trash.js";
import { registerViewTools, registerViewWriteTools } from "./tools/views.js";
import { registerWorkspaceTools } from "./tools/workspace.js";

export const SERVER_INSTRUCTIONS = `Teable is a no-code database. Data is organized as space (spc...) > base (bse...) > table (tbl...), and a table holds fields (fld...), records (rec...) and views (viw...).
Find ids by listing from the top down rather than guessing them, and check a table's fields (names and types) before writing records.`;

export function createTeableServer(config: Config, client: TeableClient = new TeableClient(config)): McpServer {
  const server = new McpServer({ name: "teable", version: "0.1.0" }, { instructions: SERVER_INSTRUCTIONS });
  const registrar = createRegistrar(server, { client }, { readOnly: config.readOnly });
  registerAccountTools(registrar);
  registerWorkspaceTools(registrar);
  registerTableTools(registrar);
  registerFieldTools(registrar);
  registerFieldWriteTools(registrar);
  registerViewTools(registrar);
  registerViewWriteTools(registrar);
  registerRecordReadTools(registrar);
  registerRecordWriteTools(registrar);
  registerCommentTools(registrar);
  registerTrashTools(registrar);
  registerAttachmentTools(registrar);
  return server;
}
