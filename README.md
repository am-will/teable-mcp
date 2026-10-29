# teable-mcp

An [MCP](https://modelcontextprotocol.io) server that lets Claude work with your team's [Teable](https://teable.ai): browse spaces, bases, tables, fields and views, read and edit records, comment, restore from trash, and reach the rest of the Teable API through a guarded generic tool.

It runs on your own machine over stdio. Each teammate uses their own Teable token, so Claude sees and changes exactly what that person can.

> **Status:** built from Teable's OpenAPI spec and docs, and tested against a mock Teable (unit tests, an in-memory MCP client, and a real stdio process). It has not yet been run against a live Teable. Run `npm run live-check` with your token (below) to confirm it works with your instance before relying on it.

## Set up

You need Node 20.10 or newer.

```bash
git clone https://github.com/am-will/teable-mcp.git
cd teable-mcp
npm install
npm run build
```

### 1. Create a Teable token

Create a personal access token in Teable ([how](https://help.teable.ai/en/api-doc/token)). Limit it to the bases Claude should reach, and grant only the scopes you need:

- **Read only:** `space|read`, `base|read`, `table|read`, `field|read`, `view|read`, `record|read` (and `table_record_history|read` for record history)
- **Editing:** add the matching create, update and delete scopes, plus `record|comment` for comments

A call that the token's scopes don't allow returns a 403 with a hint. `teable_search_api` lists the scopes each endpoint needs.

### 2. Check it works

```bash
TEABLE_TOKEN=your-token npm run live-check
```

This calls only read tools, in read-only mode, and prints counts and structure names, never record contents.

### 3. Add it to Claude

**Claude Code**

```bash
claude mcp add teable --scope user -e TEABLE_TOKEN=your-token -- node /absolute/path/to/teable-mcp/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "teable": {
      "command": "node",
      "args": ["/absolute/path/to/teable-mcp/dist/index.js"],
      "env": { "TEABLE_TOKEN": "your-token" }
    }
  }
}
```

Then ask Claude something like "list my Teable bases" or "how many open leads are there?".

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `TEABLE_TOKEN` | yes | Teable personal access token (`TEABLE_API_KEY` also works) |
| `TEABLE_BASE_URL` | no | Defaults to `https://app.teable.ai`. Set it for a self-hosted Teable. Must be `https`, except for `localhost`. |
| `TEABLE_READ_ONLY` | no | `true` removes every tool that changes data, so Claude cannot write even if asked |

## Tools

39 tools. Every tool is marked read-only, write or destructive, so Claude clients can ask before running the risky ones.

| | Tools |
| --- | --- |
| **Read** (19) | `whoami`, `list_spaces`, `list_bases`, `get_base`, `search_space`, `list_tables`, `get_table`, `list_fields`, `get_field`, `list_views`, `get_view`, `list_records`, `get_record`, `count_records`, `get_record_history`, `list_comments`, `list_trash`, `search_api`, `api_get` |
| **Write** (13) | `create_table`, `rename_table`, `set_table_description`, `duplicate_table`, `create_field`, `update_field`, `create_view`, `rename_view`, `create_records`, `update_records`, `add_comment`, `restore_trash_item`, `attach_file_from_url` |
| **Destructive** (7) | `delete_table`, `convert_field`, `delete_fields`, `delete_view`, `delete_records`, `delete_comment`, `api_request` |

All names are prefixed with `teable_`.

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

- Editing a view's filter, sort or grouping has no dedicated tool yet; use the generic tools. The spec's request shapes for these are ambiguous, so they are worth confirming against a live Teable first.
- `search` inside `teable_list_records` is not exposed; use a `contains` filter, or `teable_search_space`.
- Query encoding (`projection[]=...`, JSON `filter` and `orderBy`) follows Teable's docs. `npm run live-check` exercises each of them.

## Development

```bash
npm test            # unit, in-memory MCP and stdio end-to-end tests (the e2e tests build the server themselves)
npm run typecheck
npm run build:index # regenerate src/generated/endpoints.json from Teable's swagger.json
```

Layout: `src/client.ts` (HTTP, retries, errors), `src/config.ts`, `src/server.ts` (wiring and instructions), `src/tools/*` (one file per area; `define.ts` is the registrar that applies annotations and read-only mode, `api-policy.ts` guards the generic tools), `test/helpers.ts` (runs the real server against a fake Teable).
