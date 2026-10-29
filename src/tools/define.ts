import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { TeableApiError, type TeableClient } from "../client.js";

export const MAX_RESULT_CHARS = 80_000;
const MAX_ERROR_DETAIL_CHARS = 2_000;

/** `read` tools are always registered; `write` and `destructive` tools are dropped in read-only mode. */
export type Access = "read" | "write" | "destructive";

export interface ToolContext {
  client: TeableClient;
}

export interface ToolDef<S extends z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  access: Access;
  /** Only meaningful for write tools: repeating the call has no further effect. */
  idempotent?: boolean;
  input: S;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
}

export interface Registrar {
  tool<S extends z.ZodRawShape>(def: ToolDef<S>): void;
}

export function formatResult(value: unknown): string {
  const text = value === undefined || value === null ? "OK" : typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return (
    `${text.slice(0, MAX_RESULT_CHARS)}\n\n[Output truncated: showing ${MAX_RESULT_CHARS} of ${text.length} characters. ` +
    `Request less data: a smaller take, a projection of fewer fields, or a filter.]`
  );
}

export function formatError(err: unknown): string {
  if (!(err instanceof TeableApiError)) return err instanceof Error ? err.message : String(err);
  const body = err.body;
  if (typeof body !== "object" || body === null) return err.message;
  const { message: _m, status: _s, code: _c, ...rest } = body as Record<string, unknown>;
  if (Object.keys(rest).length === 0) return err.message;
  return `${err.message}\nDetails: ${JSON.stringify(rest).slice(0, MAX_ERROR_DETAIL_CHARS)}`;
}

function annotationsFor(def: Pick<ToolDef<z.ZodRawShape>, "title" | "access" | "idempotent">): ToolAnnotations {
  return {
    title: def.title,
    readOnlyHint: def.access === "read",
    ...(def.access === "read"
      ? { idempotentHint: true }
      : { destructiveHint: def.access === "destructive", idempotentHint: def.idempotent ?? false }),
    openWorldHint: false,
  };
}

export function createRegistrar(server: McpServer, ctx: ToolContext, options: { readOnly: boolean }): Registrar {
  return {
    tool(def) {
      if (options.readOnly && def.access !== "read") return;
      // The SDK validates args against `input` before calling us, so erasing the generics here is safe.
      const input: z.ZodRawShape = def.input;
      const handler = def.handler as (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
      server.registerTool(
        def.name,
        { title: def.title, description: def.description, inputSchema: input, annotations: annotationsFor(def) },
        async (args): Promise<CallToolResult> => {
          try {
            const result = await handler(args, ctx);
            return { content: [{ type: "text", text: formatResult(result) }] };
          } catch (err) {
            return { content: [{ type: "text", text: formatError(err) }], isError: true };
          }
        },
      );
    },
  };
}
