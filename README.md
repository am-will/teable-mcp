# teable-mcp

An [MCP](https://modelcontextprotocol.io) server that lets Claude work with your team's [Teable](https://teable.ai): browse spaces, bases, tables, fields and views, read and edit records, comment, restore from trash, and reach the rest of the Teable API through a guarded generic tool.

It runs on your own machine over stdio. Each teammate uses their own Teable token, so Claude sees and changes exactly what that person can.

> **Where it stands:** every tool has been run against our real Teable, on throwaway tables that were deleted afterwards, and it all worked. It has also been checked with a real personal access token. With the 10 scopes below, reading works, updating is allowed, and deleting is refused (Teable answers 403).

## Get it running

You need Node 20.10 or newer, and access to this repo on GitHub. It takes about five minutes.

### 1. Make a token in Teable

Go to <https://teable.modemobiledaily.com/setting/personal-access-token> and hit **Create new token**.

- Name it something like `claude`.
- Under **Scopes**, tick **only these 10** and leave everything else unticked:

  | Section | Tick |
  | --- | --- |
  | Record | Create record, Read record, Update record |
  | Field | Create field, Read field |
  | Table | Read table |
  | View | Read view |
  | Base | Read base, Read all bases |
  | Space | Read space |

  That lets Claude read everything, add records, change values (like marking an ad scheduled or sent) and add fields. It **cannot delete anything** (records, fields, tables, views, bases or spaces), change sharing, invite people or run queries.
- Don't tick any **Delete** scope, **Share view** (it can publish a view to the internet), **Reset table trash** (permanent delete), **Query base**, **Connect to database**, the **Invite** and **Grant role** ones, or **Automation**.
- Under **Access** you can limit the token to just the base it needs. If you do, the check may warn about "list spaces", which is fine.
- Copy the token when it shows up. Treat it like a password: don't paste it in Slack, don't commit it.

Everyone makes their own token. That way Claude can only do what you can do.

Need more later? Edit the token and tick extras: **Comment on record** (comments), **Update field** (rename fields), **Create table**, **Create view**, **Update table / view**, **Read record history**. The table under [Tools](#tools) shows which scope unlocks which tool.

### 2. Install it

```bash
git clone https://github.com/am-will/teable-mcp.git
cd teable-mcp
npm install
npm run build
```

### 3. Check the token works

```bash
TEABLE_TOKEN=your-token TEABLE_BASE_URL=https://teable.modemobiledaily.com npm run live-check
```

This only reads. It prints counts and names, never what's inside your records. A `401` means the token is wrong. A `403` means it's missing a scope. A `warn` line is fine, it just means one optional call was refused.

### 4. Plug it into Claude

**Claude Code**

```bash
claude mcp add teable --scope user -e TEABLE_TOKEN=your-token -e TEABLE_BASE_URL=https://teable.modemobiledaily.com -- node /absolute/path/to/teable-mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "teable": {
      "command": "node",
      "args": ["/absolute/path/to/teable-mcp/dist/index.js"],
      "env": {
        "TEABLE_TOKEN": "your-token",
        "TEABLE_BASE_URL": "https://teable.modemobiledaily.com"
      }
    }
  }
}
```

Restart Claude, then ask it "list my Teable bases". If you only want Claude to look, add `TEABLE_READ_ONLY=true` next to the other two settings. Then it can't change anything, even if you ask.

### Updating later

```bash
git pull && npm install && npm run build
```

Then restart Claude.

## Give this to your agent

Don't want to do the steps yourself? Paste this into Claude Code (or any coding agent) and let it do them:

```text
Set up the Teable MCP server for me so Claude can use our Teable.

Repo: https://github.com/am-will/teable-mcp (it's private, so use my GitHub login, e.g. `gh repo clone am-will/teable-mcp`)
Our Teable: https://teable.modemobiledaily.com

1. Check Node is 20.10 or newer. If it isn't, tell me and stop.
2. Clone the repo somewhere permanent (like ~/code/teable-mcp), then run `npm install` and `npm run build`.
3. Ask me for my Teable personal access token. I make it at https://teable.modemobiledaily.com/setting/personal-access-token (Create new token). Tell me to tick ONLY these 10 scopes and nothing else: Create record, Read record, Update record, Create field, Read field, Read table, Read view, Read base, Read all bases, Read space. No Delete scopes, no Share view, no Query base. Never print the token back to me, never write it into a file in the repo, and never commit it.
4. Ask me if I want read-only mode (it adds TEABLE_READ_ONLY=true).
5. Run `TEABLE_TOKEN=<token> TEABLE_BASE_URL=https://teable.modemobiledaily.com npm run live-check` and show me the result. If it fails, explain it in plain words (401 = bad token, 403 = missing scope) and stop.
6. Add it to Claude with `claude mcp add teable --scope user -e TEABLE_TOKEN=<token> -e TEABLE_BASE_URL=https://teable.modemobiledaily.com -- node <absolute path to the clone>/dist/index.js` (plus `-e TEABLE_READ_ONLY=true` if I said yes). If I use Claude Desktop instead, add the same thing under mcpServers in claude_desktop_config.json.
7. Tell me to restart Claude, then to ask it "list my Teable bases" to test it.

Ask me before doing anything that isn't on this list.
```

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `TEABLE_TOKEN` | yes | Teable personal access token (`TEABLE_API_KEY` also works) |
| `TEABLE_BASE_URL` | for us | Our server is `https://teable.modemobiledaily.com`. Defaults to Teable Cloud, `https://app.teable.ai`, if unset. Must be `https`, except for `localhost`. |
| `TEABLE_READ_ONLY` | no | `true` removes every tool that changes data, so Claude cannot write even if asked |

## Tools

39 tools. Every tool is marked read-only, write or destructive, so Claude clients can ask before running the risky ones.

| | Tools |
| --- | --- |
| **Read** (19) | `whoami`, `list_spaces`, `list_bases`, `get_base`, `search_space`, `list_tables`, `get_table`, `list_fields`, `get_field`, `list_views`, `get_view`, `list_records`, `get_record`, `count_records`, `get_record_history`, `list_comments`, `list_trash`, `search_api`, `api_get` |
| **Write** (13) | `create_table`, `rename_table`, `set_table_description`, `duplicate_table`, `create_field`, `update_field`, `create_view`, `rename_view`, `create_records`, `update_records`, `add_comment`, `restore_trash_item`, `attach_file_from_url` |
| **Destructive** (7) | `delete_table`, `convert_field`, `delete_fields`, `delete_view`, `delete_records`, `delete_comment`, `api_request` |

All names are prefixed with `teable_`.

### Which token scope unlocks which tool

| Scope (as Teable's form words it) | Tools |
| --- | --- |
| Read record | `list_records`, `get_record`, `count_records`, `list_comments` |
| Create record | `create_records` |
| Update record | `update_records`, `attach_file_from_url` |
| Create field | `create_field` |
| Read field / Read table / Read view | `list_fields` `get_field` / `list_tables` `get_table` / `list_views` `get_view` |
| Read base + Read all bases | `list_bases`, `get_base` |
| Read space | `list_spaces`, `search_space` |
| *Extra:* Comment on record | `add_comment`, `delete_comment` |
| *Extra:* Update field | `update_field`, `convert_field` |
| *Extra:* Create table / Update table | `create_table`, `duplicate_table` / `rename_table`, `set_table_description` |
| *Extra:* Create view / Update view | `create_view` / `rename_view` |
| *Extra:* Read record history | `get_record_history` |
| *Delete scopes* (leave off) | `delete_records`, `delete_fields`, `delete_table`, `delete_view` |
| *Not available to tokens* | `list_trash`, `restore_trash_item`: Teable refuses tokens here, whatever the scopes. Use the trash in the Teable app. |

`whoami`, `search_api` and the generic API tools need no scope of their own, though `api_get` and `api_request` need whatever the endpoint they call needs.

Records are keyed by **field name**. Filters and sorts accept field names or ids and are resolved for you:

```json
{ "conjunction": "and", "filterSet": [{ "field": "Status", "operator": "is", "value": "Open" }] }
```

Listing returns up to 100 records per call and gives `nextSkip` when there may be more.

### Reaching the rest of the API

Teable has hundreds of endpoints (automations, dashboards, SQL queries, aggregations, view filters and more). `teable_search_api` searches a bundled index of them, then `teable_api_get` or `teable_api_request` calls the one Claude picks. Regenerate the index when Teable's API changes with `npm run build:index`.

## Safety

- **Your token is the boundary.** Claude can do what that token allows, nothing more. Scope it to specific bases.
- **Read-only mode** (`TEABLE_READ_ONLY=true`) removes write and destructive tools entirely.
- **The generic tools refuse** account, token, OAuth, billing and admin areas; permanent deletion (trash, archive, `/permanent`); and changes to sharing, collaborators, invitations or access settings. Do those in the Teable app. Paths cannot escape `/api` or point at another host.
- **Tool descriptions tell Claude to confirm** before deleting, converting fields or bulk editing.
- **Files:** attachments can be added from a URL only. Uploading from your computer is deliberately not offered.
- The token is sent only to your Teable host and is never logged or included in error messages. Logs go to stderr, never stdout.
- **Treat record contents as untrusted.** Anyone who can write to a table can put text in it that tries to instruct Claude. Prefer read-only mode, or a token limited to the needed bases, wherever that matters.

## Known gaps

- **Token scopes.** Checked live with the 10-scope token from step 1: reads work, `update_records` passes the permission check, and `delete_table` / `delete_records` are refused with a 403. Creating records and fields with that exact token has not been run, though the same tools worked with a browser login. A 403 from a tool usually means a missing scope; `teable_search_api` lists what each endpoint needs.
- **The trash does not work with tokens.** Teable refuses personal access tokens there even with every scope ticked, so `teable_list_trash` and `teable_restore_trash_item` return an explanation. Use the trash in the Teable app.
- **Possibly older server version.** Our server lacks at least one newer endpoint (`teable_search_space` returns 404), so others may be missing too. The bundled endpoint index follows the current Teable API, so a result from `teable_search_api` may not exist on our server.
- Editing a view's filter, sort or grouping has no dedicated tool. Use `teable_api_request` with the shapes below, which were checked live.
- `search` inside `teable_list_records` is not exposed; use a `contains` filter.
- A base shared directly with you may not appear under its space. `teable_list_bases` without a space lists everything you can reach.

### Quirks of Teable the server already handles

Found by testing against our live server, and worth knowing if you call the API yourself:

- A filter's `fieldId` is read according to `fieldKeyType`. With names (what this server uses) it must hold the field **name**; an id there is **silently ignored** and every record comes back. The row-count endpoint has no `fieldKeyType` and wants ids. The server resolves this for you, and `npm run live-check` fails if a filter is ever ignored.
- `isEmpty` and `isNotEmpty` conditions are rejected (HTTP 400) unless they carry `"value": null`.
- Arrays in a query string work as `projection[]=a&projection[]=b`; filters and sorts are JSON strings.
- Listing returns at most 100 records per call. Our server accepted 101 in testing, but Teable Cloud's newer keys are capped at 100, so the tool stays at 100.
- Teable adds three blank rows to a new table unless the create request carries a `records` list. `teable_create_table` always sends one (empty unless you pass rows), so new tables start empty.
- Attachment uploads answer with the whole record keyed by **field id**, including signed links; `teable_attach_file_from_url` returns just the file list. Teable downloads the URL itself, so a host that blocks server downloads (`upload.wikimedia.org` did) gives a bare HTTP 500.
- `PATCH` on a field answers with an empty body, so `teable_update_field` reads the field back.
- View filter, sort and group are separate `PUT` endpoints. Each wraps its value in a key, and they use field **ids**:
  - `PUT /table/{tableId}/view/{viewId}/filter` with `{ "filter": { "conjunction": "and", "filterSet": [{ "fieldId": "fld...", "operator": "is", "value": "Open" }] } }`
  - `PUT /table/{tableId}/view/{viewId}/sort` with `{ "sort": { "sortObjs": [{ "fieldId": "fld...", "order": "desc" }], "manualSort": false } }`
  - `PUT /table/{tableId}/view/{viewId}/group` with `{ "group": [{ "fieldId": "fld...", "order": "asc" }] }`

  After that, `teable_list_records` with a `viewId` applies the saved filter and sort.

## Development

```bash
npm test            # unit, in-memory MCP and stdio end-to-end tests (the e2e tests build the server themselves)
npm run typecheck
npm run build:index # regenerate src/generated/endpoints.json from Teable's swagger.json
```

Layout: `src/client.ts` (HTTP, retries, errors), `src/config.ts`, `src/server.ts` (wiring and instructions), `src/tools/*` (one file per area; `define.ts` is the registrar that applies annotations and read-only mode, `api-policy.ts` guards the generic tools), `test/helpers.ts` (runs the real server against a fake Teable).
