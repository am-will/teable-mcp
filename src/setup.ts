import { posix, win32 } from "node:path";

// Pure helpers behind `npm run setup` (scripts/setup.mjs does the prompting and file/process work), kept here so they
// can be tested on any operating system.

export interface McpEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function serverEntry(nodePath: string, entryPath: string, token: string, baseUrl: string): McpEntry {
  return { command: nodePath, args: [entryPath], env: { TEABLE_TOKEN: token, TEABLE_BASE_URL: baseUrl } };
}

/**
 * Everything after `claude` in `claude mcp add`. Scope "local" (the default for setup) makes the server available only in
 * the folder `claude` is run from, private to this user; "user" makes it available in every project.
 */
export function claudeAddArgs(entry: McpEntry, scope: "local" | "user" = "user"): string[] {
  return [
    "mcp",
    "add",
    "teable",
    "--scope",
    scope,
    ...Object.entries(entry.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    "--",
    entry.command,
    ...entry.args,
  ];
}

/**
 * Windows runs `claude` through cmd.exe, which takes one command string. Quote anything that is not plainly safe, and
 * refuse the two characters (a double quote and a percent sign) that cannot be quoted reliably there.
 */
export function quoteForCmd(arg: string): string {
  if (/["%]/.test(arg)) throw new Error(`Cannot pass an argument containing " or % through cmd.exe: ${arg.replace(/=.*/, "=…")}`);
  return /^[\w@+=:,./\\-]+$/.test(arg) ? arg : `"${arg}"`;
}

export function desktopConfigPath(platform: NodeJS.Platform, env: Record<string, string | undefined>, home: string): string {
  if (platform === "win32") {
    return win32.join(env.APPDATA ?? win32.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  if (platform === "darwin") return posix.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  return posix.join(env.XDG_CONFIG_HOME ?? posix.join(home, ".config"), "Claude", "claude_desktop_config.json");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Add (or replace) the `teable` server in Claude Desktop's config text, keeping every other setting and server.
 * `existing` is the current file content, or undefined when there is no file yet.
 */
export function mergeDesktopConfig(existing: string | undefined, entry: McpEntry): string {
  let config: Record<string, unknown> = {};
  if (existing?.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      throw new Error("The Claude Desktop config file is not valid JSON, so it was left alone. Fix or remove it, then run setup again.");
    }
    if (!isObject(parsed)) throw new Error("The Claude Desktop config file is not a JSON object, so it was left alone.");
    config = parsed;
  }
  if (config.mcpServers !== undefined && !isObject(config.mcpServers)) {
    throw new Error('The "mcpServers" entry in the Claude Desktop config is not an object, so the file was left alone.');
  }
  return `${JSON.stringify({ ...config, mcpServers: { ...(config.mcpServers as object | undefined), teable: entry } }, null, 2)}\n`;
}

/** The only scopes the team token needs. Nothing here can delete anything. */
export const TOKEN_SCOPES: ReadonlyArray<readonly [section: string, scopes: string]> = [
  ["Record", "Create record, Read record, Update record"],
  ["Field", "Create field, Read field"],
  ["Table", "Read table"],
  ["View", "Read view"],
  ["Base", "Read base, Read all bases"],
  ["Space", "Read space"],
];

export type DeleteProbe = "blocked" | "allowed" | "invalid-token" | "unknown";

/**
 * What a delete aimed at a made-up id says about the token. Teable checks the delete scope on the parent (a real base
 * or table) before it looks for the id, so a token without the scope gets a 403 and one with it gets anything else.
 */
export function interpretDeleteProbe(status: number | undefined): DeleteProbe {
  if (status === 403) return "blocked";
  if (status === 401) return "invalid-token";
  if (status === undefined || status === 429 || status >= 500) return "unknown";
  return "allowed";
}

/**
 * Turns what someone typed or dragged into the terminal into folder paths: comma separated, with quotes, a trailing
 * space or backslash-escaped spaces (what dragging a folder in produces on a Mac) and a leading ~ all tidied up.
 */
export function parseFolderList(answer: string, home: string): string[] {
  return answer
    .split(",")
    .map((part) => part.trim().replace(/^(["'])(.*)\1$/, "$2").replace(/\\ /g, " ").trim())
    .filter((part) => part !== "")
    .map((part) => (part === "~" ? home : /^~[\\/]/.test(part) ? `${home}${part.slice(1)}` : part));
}

export type InstallChoice = "code" | "desktop" | "both" | "none";

/**
 * Reads the answer to "where should Teable be added?". People type a number, a word, or just press Enter, and a plain
 * "no" means they changed their mind, so all of those are understood. Anything else is undefined (ask again).
 */
export function parseInstallChoice(answer: string): InstallChoice | undefined {
  const text = answer.trim().toLowerCase().replace(/[.!\s]+$/, "");
  if (["", "3", "both", "all", "yes", "y"].includes(text)) return "both";
  if (["1", "code", "claude code", "cli", "terminal"].includes(text)) return "code";
  if (["2", "desktop", "app", "claude desktop", "desktop app", "the claude desktop app"].includes(text)) return "desktop";
  if (["n", "no", "none", "nothing", "cancel", "quit", "exit", "q", "skip"].includes(text)) return "none";
  return undefined;
}

/** The program and arguments that open a web page in the user's default browser. */
export function browserOpenCommand(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}
