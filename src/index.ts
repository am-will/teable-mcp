#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { createTeableServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await createTeableServer(config).connect(new StdioServerTransport());
  // stdout carries the protocol, so all logging goes to stderr.
  console.error(`teable-mcp ready (${config.apiUrl}${config.readOnly ? ", read-only" : ""})`);
}

main().catch((err) => {
  console.error(err instanceof ConfigError ? `teable-mcp: ${err.message}` : err);
  process.exit(1);
});
