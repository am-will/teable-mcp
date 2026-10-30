import { describe, expect, it } from "vitest";
import {
  TOKEN_SCOPES,
  browserOpenCommand,
  claudeAddArgs,
  desktopConfigPath,
  interpretDeleteProbe,
  mergeDesktopConfig,
  parseFolderList,
  parseInstallChoice,
  quoteForCmd,
  serverEntry,
} from "../src/setup.js";

const entry = serverEntry("/usr/bin/node", "/apps/teable-mcp/dist/index.js", "teable_acc123.abc", "https://teable.example.com");

describe("setup helpers", () => {
  it("builds the claude mcp add arguments", () => {
    expect(claudeAddArgs(entry)).toEqual([
      "mcp", "add", "teable", "--scope", "user",
      "-e", "TEABLE_TOKEN=teable_acc123.abc",
      "-e", "TEABLE_BASE_URL=https://teable.example.com",
      "--", "/usr/bin/node", "/apps/teable-mcp/dist/index.js",
    ]);
  });

  it("can register for one folder only (local scope) instead of every project", () => {
    expect(claudeAddArgs(entry, "local").slice(0, 5)).toEqual(["mcp", "add", "teable", "--scope", "local"]);
    expect(claudeAddArgs(entry).slice(3, 5)).toEqual(["--scope", "user"]);
  });

  describe("parseFolderList", () => {
    it("splits on commas and tidies each path", () => {
      expect(parseFolderList("/a/ads, /b/news ", "/Users/pat")).toEqual(["/a/ads", "/b/news"]);
      expect(parseFolderList("", "/Users/pat")).toEqual([]);
      expect(parseFolderList(" , ,", "/Users/pat")).toEqual([]);
    });

    it("understands a dragged-in folder, quotes and ~", () => {
      expect(parseFolderList("/Users/pat/My\\ Ads\\ Folder ", "/Users/pat")).toEqual(["/Users/pat/My Ads Folder"]);
      expect(parseFolderList('"C:\\Users\\Pat\\Ads Folder"', "C:\\Users\\Pat")).toEqual(["C:\\Users\\Pat\\Ads Folder"]);
      expect(parseFolderList("'/x/y'", "/h")).toEqual(["/x/y"]);
      expect(parseFolderList("~/Applications/ads, ~", "/Users/pat")).toEqual(["/Users/pat/Applications/ads", "/Users/pat"]);
    });
  });

  describe("quoteForCmd", () => {
    it("leaves plain arguments alone and quotes ones with spaces", () => {
      expect(quoteForCmd("TEABLE_TOKEN=teable_acc123.abc")).toBe("TEABLE_TOKEN=teable_acc123.abc");
      expect(quoteForCmd("https://teable.example.com")).toBe("https://teable.example.com");
      expect(quoteForCmd("C:\\Program Files\\nodejs\\node.exe")).toBe('"C:\\Program Files\\nodejs\\node.exe"');
      expect(quoteForCmd("C:\\Users\\Pat Lee\\teable-mcp\\dist\\index.js")).toBe('"C:\\Users\\Pat Lee\\teable-mcp\\dist\\index.js"');
    });

    it("refuses characters cmd.exe cannot be trusted with, without echoing the value", () => {
      expect(() => quoteForCmd('TEABLE_TOKEN=a"b')).toThrow(/cmd\.exe/);
      expect(() => quoteForCmd("TEABLE_TOKEN=a%PATH%b")).toThrow(/cmd\.exe/);
      expect(() => quoteForCmd("TEABLE_TOKEN=secretvalue%")).toThrow(/^(?!.*secretvalue)/s);
    });
  });

  describe("desktopConfigPath", () => {
    it("finds the file for each operating system", () => {
      expect(desktopConfigPath("darwin", {}, "/Users/pat")).toBe("/Users/pat/Library/Application Support/Claude/claude_desktop_config.json");
      expect(desktopConfigPath("win32", { APPDATA: "C:\\Users\\Pat\\AppData\\Roaming" }, "C:\\Users\\Pat")).toBe(
        "C:\\Users\\Pat\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
      );
      expect(desktopConfigPath("win32", {}, "C:\\Users\\Pat")).toBe("C:\\Users\\Pat\\AppData\\Roaming\\Claude\\claude_desktop_config.json");
      expect(desktopConfigPath("linux", {}, "/home/pat")).toBe("/home/pat/.config/Claude/claude_desktop_config.json");
      expect(desktopConfigPath("linux", { XDG_CONFIG_HOME: "/x" }, "/home/pat")).toBe("/x/Claude/claude_desktop_config.json");
    });
  });

  describe("mergeDesktopConfig", () => {
    it("creates a config when there is none", () => {
      for (const existing of [undefined, "", "  \n"]) {
        expect(JSON.parse(mergeDesktopConfig(existing, entry))).toEqual({ mcpServers: { teable: entry } });
      }
    });

    it("keeps every other setting and server, and puts the file back with a final newline", () => {
      const existing = JSON.stringify({ theme: "dark", mcpServers: { slack: { command: "x", env: { SLACK_TOKEN: "keep-me" } } } });
      const out = mergeDesktopConfig(existing, entry);
      expect(JSON.parse(out)).toEqual({
        theme: "dark",
        mcpServers: { slack: { command: "x", env: { SLACK_TOKEN: "keep-me" } }, teable: entry },
      });
      expect(out.endsWith("}\n")).toBe(true);
    });

    it("replaces an old teable entry instead of duplicating it", () => {
      const old = JSON.stringify({ mcpServers: { teable: { command: "old" } } });
      expect(JSON.parse(mergeDesktopConfig(old, entry)).mcpServers).toEqual({ teable: entry });
    });

    it("refuses to touch a file it cannot understand", () => {
      expect(() => mergeDesktopConfig("{ not json", entry)).toThrow(/not valid JSON/);
      expect(() => mergeDesktopConfig("[]", entry)).toThrow(/not a JSON object/);
      expect(() => mergeDesktopConfig('{"mcpServers": []}', entry)).toThrow(/not an object/);
    });
  });

  describe("token checklist", () => {
    it("lists exactly the 10 scopes the README tells people to tick, none of them deleting", () => {
      const all = TOKEN_SCOPES.flatMap(([, scopes]) => scopes.split(", "));
      expect(all).toHaveLength(10);
      expect(all.join(" ")).not.toMatch(/delete|share|invite|query|trash/i);
    });
  });

  describe("interpretDeleteProbe", () => {
    it.each([
      [403, "blocked"],
      [401, "invalid-token"],
      [200, "allowed"],
      [204, "allowed"],
      [400, "allowed"],
      [404, "allowed"],
      [429, "unknown"],
      [500, "unknown"],
      [502, "unknown"],
      [undefined, "unknown"],
    ])("status %s means %s", (status, expected) => {
      expect(interpretDeleteProbe(status)).toBe(expected);
    });
  });

  describe("parseInstallChoice", () => {
    it.each([
      ["", "both"],
      ["  ", "both"],
      ["3", "both"],
      ["Both", "both"],
      ["yes", "both"],
      ["1", "code"],
      ["Claude Code", "code"],
      ["2", "desktop"],
      ["the Claude desktop app.", "desktop"],
      ["no", "none"],
      ["No!", "none"],
      ["cancel", "none"],
      ["banana", undefined],
      ["4", undefined],
      ["1 and 2", undefined],
    ])("%j means %s", (answer, expected) => {
      expect(parseInstallChoice(answer)).toBe(expected);
    });
  });

  describe("browserOpenCommand", () => {
    it("uses each operating system's own opener", () => {
      expect(browserOpenCommand("darwin", "https://t.example/x")).toEqual({ command: "open", args: ["https://t.example/x"] });
      expect(browserOpenCommand("win32", "https://t.example/x")).toEqual({ command: "cmd", args: ["/c", "start", "", "https://t.example/x"] });
      expect(browserOpenCommand("linux", "https://t.example/x")).toEqual({ command: "xdg-open", args: ["https://t.example/x"] });
    });
  });
});
