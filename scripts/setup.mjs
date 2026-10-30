#!/usr/bin/env node
// Interactive setup: asks for your Teable token (hidden), checks it read-only, then adds the server to Claude Code
// and/or Claude Desktop. Plain Node, so it runs the same on Windows, macOS and Linux, with no bash and no WSL.
//
//   npm run setup
//
// Options: --project <folder>        add Teable to Claude Code in this folder only (repeat for more; setup asks if none given)
//          --global                  add Teable to Claude Code for every project instead of chosen folders
//          --desktop-config <path>   use this Claude Desktop config file instead of the default location
//          --allow-delete            accept a token that is allowed to delete (setup refuses these by default)
// Env:     TEABLE_BASE_URL           Teable address (default below)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { cleanToken } from "../dist/config.js";
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
} from "../dist/setup.js";

const entryPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const liveCheck = fileURLToPath(new URL("./live-check.mjs", import.meta.url));
const baseUrl = (process.env.TEABLE_BASE_URL || "https://teable.modemobiledaily.com").replace(/\/+$/, "");
const desktopFlag = process.argv.indexOf("--desktop-config");
const desktopOverride = desktopFlag > 0 ? process.argv[desktopFlag + 1] : undefined;
const allowDelete = process.argv.includes("--allow-delete");
const useGlobal = process.argv.includes("--global");
const projectArgs = process.argv.flatMap((arg, i, all) => (arg === "--project" && all[i + 1] ? [all[i + 1]] : []));
const claudeFolders = [];

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function readAll(stream) {
  return new Promise((resolve) => {
    let data = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (data += chunk));
    stream.on("end", () => resolve(data));
  });
}

/** Reads answers from the terminal, or line by line from piped input (which is how the tests drive it). */
function createPrompter() {
  const { stdin, stdout } = process;
  let piped;
  const nextPipedLine = async () => {
    piped ??= (await readAll(stdin)).split(/\r?\n/);
    return piped.shift() ?? "";
  };

  async function ask(question) {
    stdout.write(question);
    if (!stdin.isTTY) {
      const line = await nextPipedLine();
      stdout.write("\n");
      return line.trim();
    }
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    rl.setPrompt("");
    return new Promise((resolve) => rl.once("line", (line) => (rl.close(), resolve(line.trim()))));
  }

  // The token is read in raw mode so nothing is echoed. An Enter inside a pasted chunk is ignored (a wrapped token
  // would otherwise be cut short); an Enter on its own ends the input.
  async function secret(question) {
    if (!stdin.isTTY) return ask(question);
    // Switch echo off before the prompt appears, so a fast paste can never show up on screen.
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(question);
    return new Promise((resolve) => {
      let typed = "";
      const finish = (value) => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
      };
      const onData = (chunk) => {
        const text = String(chunk);
        for (const ch of text) {
          if (ch === "\u0003") {
            stdin.setRawMode(false);
            stdout.write("\n");
            process.exit(130);
          }
          if (ch === "\r" || ch === "\n") continue;
          if (ch === "\u007f" || ch === "\b") typed = typed.slice(0, -1);
          else typed += ch;
        }
        if (/[\r\n]$/.test(text)) finish(typed);
      };
      stdin.on("data", onData);
    });
  }

  return { ask, secret };
}

function runClaude(args, stdio, cwd) {
  // On Windows `claude` may be a .cmd shim, which only cmd.exe can start, so go through it with quoted arguments.
  if (process.platform === "win32") return spawnSync(["claude", ...args].map(quoteForCmd).join(" "), { shell: true, stdio, cwd });
  return spawnSync("claude", args, { stdio, cwd });
}

function showTokenChecklist() {
  console.log("In Teable:");
  console.log('  1. Click "Create new token" and name it Claude.');
  console.log("  2. Under Scopes, tick ONLY these 10 boxes. Leave everything else unticked, especially anything that says Delete:");
  for (const [section, scopes] of TOKEN_SCOPES) console.log(`       ${`${section}:`.padEnd(8)}${scopes}`);
  console.log("  3. Scroll down, click Submit, then copy the token Teable shows you.\n");
}

async function offerToOpenTokenPage(prompt, url) {
  const answer = await prompt.ask("Open the Teable token page in your browser now? (Y/n): ");
  if (answer.toLowerCase().startsWith("n")) return;
  const { command, args } = browserOpenCommand(process.platform, url);
  const opened = spawnSync(command, args, { stdio: "ignore" });
  if (opened.error || opened.status !== 0) console.log(`Could not open a browser. Go to ${url} yourself.`);
}

async function request(path, token, method = "GET") {
  try {
    return await fetch(`${baseUrl}/api${path}`, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  } catch {
    return undefined;
  }
}

/** Returns the kinds of delete this token is allowed to do (empty is what we want), using made-up ids so nothing is deleted. */
async function findDeletePermissions(token) {
  const getJson = async (path) => {
    const res = await request(path, token);
    return res?.ok ? res.json().catch(() => undefined) : undefined;
  };
  const base = (await getJson("/base/access/all"))?.[0];
  const table = base && (await getJson(`/base/${base.id}/table`))?.[0];
  if (!base || !table) return undefined;
  const probes = [
    ["tables", `/base/${base.id}/table/tblSetupSafetyCheck00000`],
    ["records", `/table/${table.id}/record?${encodeURIComponent("recordIds[]")}=recSetupSafetyCheck00000`],
    ["fields", `/table/${table.id}/field?${encodeURIComponent("fieldIds[]")}=fldSetupSafetyCheck00000`],
    ["views", `/table/${table.id}/view/viwSetupSafetyCheck00000`],
  ];
  const allowed = [];
  for (const [name, path] of probes) {
    if (interpretDeleteProbe((await request(path, token, "DELETE"))?.status) === "allowed") allowed.push(name);
  }
  return allowed;
}

/** The existing folders Claude Code should get Teable in: from --project, or typed (or dragged in) at a prompt. */
async function chooseClaudeFolders(prompt) {
  let wanted = projectArgs;
  if (wanted.length === 0) {
    console.log("\nTeable will work in Claude Code only in the folders you choose now, not in every project.");
    wanted = parseFolderList(await prompt.ask("Paste or drag in the folder(s), separated by commas: "), homedir());
  }
  const folders = [];
  for (const raw of wanted) {
    const folder = resolve(raw);
    if (existsSync(folder) && statSync(folder).isDirectory()) folders.push(folder);
    else console.log(`Skipped ${folder}: that folder does not exist.`);
  }
  return folders;
}

async function addToClaudeCode(entry, prompt) {
  const probe = runClaude(["--version"], "ignore");
  if (probe.error || probe.status !== 0) {
    console.log("\nClaude Code (the `claude` command) was not found on this computer, so I skipped it. If you use the Claude desktop app's chat, choose 2 instead.");
    return false;
  }
  const removeEverywhere = () => runClaude(["mcp", "remove", "teable", "--scope", "user"], "ignore").status === 0;

  if (useGlobal) {
    removeEverywhere();
    console.log("\nAdding Teable to Claude Code for every project...");
    const result = runClaude(claudeAddArgs(entry, "user"), "inherit");
    if (result.status !== 0) console.log("Claude Code did not accept it (see the message above).");
    return result.status === 0;
  }

  const folders = await chooseClaudeFolders(prompt);
  if (folders.length === 0) {
    console.log("\nNo folder chosen, so Claude Code was skipped. To add Teable to every project instead, run: npm run setup -- --global");
    return false;
  }
  if (removeEverywhere()) console.log("\nRemoved the older Teable entry that applied to every project.");
  for (const folder of folders) {
    runClaude(["mcp", "remove", "teable", "--scope", "local"], "ignore", folder);
    console.log(`\nAdding Teable to Claude Code in ${folder}...`);
    if (runClaude(claudeAddArgs(entry, "local"), "inherit", folder).status === 0) claudeFolders.push(folder);
    else console.log("Claude Code did not accept it (see the message above).");
  }
  return claudeFolders.length > 0;
}

async function addToClaudeDesktop(entry, prompt) {
  const file = desktopOverride ?? desktopConfigPath(process.platform, process.env, homedir());
  console.log(`\nClaude Desktop reads its servers from:\n  ${file}`);
  const answer = await prompt.ask('Add a "teable" entry there? Your other settings are kept and a backup copy is saved first. (y/N): ');
  if (!answer.toLowerCase().startsWith("y")) {
    console.log("Skipped Claude Desktop.");
    return false;
  }
  const existing = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const merged = mergeDesktopConfig(existing, entry);
  mkdirSync(dirname(file), { recursive: true });
  if (existing !== undefined) {
    const backup = `${file}.teable-mcp-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(file, backup);
    console.log(`Backup saved: ${backup}`);
  }
  writeFileSync(file, merged);
  console.log("Added to Claude Desktop.");
  return true;
}

/** Asks where to add Teable. An unclear answer is asked again (twice at most), so a typo does not waste the token. */
async function askInstallChoice(prompt) {
  let question = "\nAdd Teable to: (1) Claude Code  (2) the Claude desktop app  (3) both. Press Enter for both: ";
  for (let attempt = 0; attempt < 3; attempt++) {
    const choice = parseInstallChoice(await prompt.ask(question));
    if (choice) return choice;
    question = "Sorry, I did not get that. Type 1, 2 or 3, or press Enter for both: ";
  }
  fail("Could not tell which one you meant, so nothing was added. Run setup again; keep the same token copied and paste it again.");
}

async function main() {
  if (!existsSync(entryPath)) fail("The server has not been built yet. Run: npm run build");
  const prompt = createPrompter();

  const tokenPage = `${baseUrl}/setting/personal-access-token`;
  console.log(`Teable setup for ${baseUrl}\n`);
  console.log(`First you need a personal access token from ${tokenPage}\n`);
  showTokenChecklist();
  await offerToOpenTokenPage(prompt, tokenPage);
  console.log("");

  const { token, removed } = cleanToken(await prompt.secret("Paste your Teable token (it stays hidden), then press Enter: "));
  if (!token) fail("No token entered, so nothing was changed.");
  if (removed > 0) console.log(`Note: removed ${removed} hidden character${removed > 1 ? "s" : ""} that came along with the paste.`);

  console.log("\nChecking the token (read-only)...");
  const check = spawnSync(process.execPath, [liveCheck], { env: { ...process.env, TEABLE_TOKEN: token, TEABLE_BASE_URL: baseUrl }, stdio: "inherit" });
  if (check.status !== 0) {
    fail("The check failed, so nothing was added to Claude. A 401 means the token is wrong; a 403 means it is missing a scope.");
  }

  console.log("\nChecking that the token cannot delete anything (this uses made-up ids, so nothing is deleted)...");
  const deletable = await findDeletePermissions(token);
  if (deletable === undefined) {
    console.log("Could not find a table to test against, so this check was skipped.");
  } else if (deletable.length > 0 && !allowDelete) {
    fail(
      `This token is allowed to delete ${deletable.join(", ")}, so nothing was added to Claude.\n` +
        `In Teable, open the token (Settings > Personal access tokens), untick every box that says Delete, and save. Or make a new token with only the 10 boxes above. Then run setup again.`,
    );
  } else if (deletable.length > 0) {
    console.log(`Warning: this token is allowed to delete ${deletable.join(", ")}. Continuing because of --allow-delete.`);
  } else {
    console.log("Good: it cannot delete tables, records, fields or views.");
  }

  const choice = await askInstallChoice(prompt);
  if (choice === "none") {
    console.log("\nOkay, nothing was added to Claude. Your token was not saved anywhere, so paste it again the next time you run setup.");
    return;
  }

  const entry = serverEntry(process.execPath, entryPath, token, baseUrl);
  const added = [];
  const attempt = async (name, step) => {
    try {
      if (await step()) added.push(name);
    } catch (err) {
      console.log(`\nCould not add it to ${name}: ${err instanceof Error ? err.message : err}`);
    }
  };
  if (choice === "code" || choice === "both") await attempt("Claude Code", () => addToClaudeCode(entry, prompt));
  if (choice === "desktop" || choice === "both") await attempt("Claude Desktop", () => addToClaudeDesktop(entry, prompt));

  if (added.length === 0) fail("Nothing was added to Claude.");
  console.log(`\nDone: added to ${added.join(" and ")}.`);
  if (claudeFolders.length > 0) console.log(`Claude Code can use Teable only when you start it in:\n${claudeFolders.map((f) => `  ${f}`).join("\n")}`);
  console.log("Start a new Claude Code session there (or quit and reopen Claude Desktop), then ask: list my Teable bases");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
