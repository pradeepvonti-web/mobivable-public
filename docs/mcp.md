# Mobivable MCP server

Drive your Mobivable projects from any MCP-aware AI client — Cursor,
Claude Code, Claude Desktop, Zed, Continue.

The studio exposes a single JSON-RPC endpoint at:

```
POST https://<your-studio-host>/api/public/mcp
Authorization: Bearer mvbl_pat_…
```

## 1. Generate an access token

1. Sign in to your Mobivable studio.
2. Go to **Settings** → **MCP access tokens**.
3. Give the token a name (e.g. _“Cursor laptop”_) and click **Generate
   token**.
4. **Copy the `mvbl_pat_…` value immediately.** The studio never stores
   the plaintext — once you leave that page it's gone, and you have to
   revoke + reissue.

Tokens are scoped to your user. Each token can be revoked individually
from the same settings page; revoked tokens stop authenticating on the
next request.

You can issue up to 10 active tokens at once. Revoke unused ones before
adding more.

## 2. Wire it into your client

### Cursor

Open **Settings → Cursor Settings → MCP** and add:

```json
{
  "mcpServers": {
    "mobivable": {
      "type": "http",
      "url": "https://studio.mobivable.ai/api/public/mcp",
      "headers": { "Authorization": "Bearer mvbl_pat_REPLACE_ME" }
    }
  }
}
```

Restart Cursor. The Mobivable tools appear in the tool picker.

### Claude Code (CLI)

```bash
claude mcp add mobivable \
  --transport http \
  --url https://studio.mobivable.ai/api/public/mcp \
  --header "Authorization: Bearer mvbl_pat_REPLACE_ME"
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and
add the same `mcpServers` block as Cursor above. Restart Claude
Desktop.

### Zed / Continue / other

Any client that speaks the MCP HTTP transport will work. Point it at
the URL above and add the Bearer token header.

## 3. What the agent can do

The MCP server exposes **14 tools** today, split into _read_ and _write_:

### Read

| Tool                  | What it does                                                       |
| --------------------- | ------------------------------------------------------------------ |
| `list_projects`       | List your Mobivable projects (newest first).                       |
| `get_project`         | Get one project's full schema, model, theme, status.               |
| `list_screens`        | Lightweight per-screen summary (id, title, element count).         |
| `get_screen`          | Full element list for one screen.                                  |
| `get_chat_history`    | Recent agent-crew chat turns for a project.                        |
| `list_test_runs`      | Recent Maestro Cloud test runs.                                    |
| `list_builds`         | Recent EAS builds.                                                 |
| `list_knowledge_items`| PRDs, design notes, ingested URLs in your knowledge base.          |

### Write

| Tool                    | What it does                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| `create_project`        | Start a new Mobivable project from a one-paragraph idea.           |
| `update_project_prompt` | Replace a project's seed prompt.                                   |
| `delete_project`        | Hard-delete one of your projects (irreversible).                   |
| `send_chat_message`     | Queue a user-side chat turn the studio picks up on next render.    |
| `add_knowledge_item`    | Save a text snippet to your knowledge base.                        |
| `ingest_url`            | Fetch a public URL and store its text as a knowledge item.         |

Each tool's input schema is published via `tools/list` — the client's
tool picker will surface the right argument shape automatically.

## 4. Smoke-test from the command line

A health probe (no JSON-RPC) — handy when wiring things up:

```bash
curl -sS https://studio.mobivable.ai/api/public/mcp \
  -H "Authorization: Bearer mvbl_pat_REPLACE_ME"
# → {"ok":true,"server":{...},"protocolVersion":"2024-11-05","tools":14}
```

A real `tools/list` call:

```bash
curl -sS https://studio.mobivable.ai/api/public/mcp \
  -H "Authorization: Bearer mvbl_pat_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A `tools/call` for `list_projects`:

```bash
curl -sS https://studio.mobivable.ai/api/public/mcp \
  -H "Authorization: Bearer mvbl_pat_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{"name":"list_projects","arguments":{"limit":5}}
  }'
```

## 5. Security model

- **Hash-only storage.** The plaintext `mvbl_pat_…` never lives on
  disk. We store a SHA-256 hex digest and the 16-char display prefix
  (`mvbl_pat_a1b2c3d4…`).
- **Per-user scope.** Tokens authenticate as the user who issued them.
  All tool calls run with that user's row-level ownership checks; the
  server refuses any cross-user access.
- **Revoke-first, rotate-fast.** If a token leaks, revoke it from the
  settings page — the next request fails with 401. Issue a new one and
  paste it into your client.
- **No token in URL.** Always send via the `Authorization` header so
  the secret never ends up in proxy logs or browser histories.

## 6. Known limitations

- **Long-running studio actions are not yet exposed** (Expo zip export,
  backend provisioning to your Supabase, Maestro Cloud dispatch). Those
  TanStack server fns authenticate via Supabase JWT and need an impl
  extraction before MCP can call them safely. For now drive those from
  the studio UI; we'll add them as soon as the inner handlers are
  factored.
- **`send_chat_message` is queue-only.** It writes the turn to
  `project_messages`; the agent crew runs when someone opens the
  project. Direct cloud trigger is on the roadmap.
- **No streaming yet.** Every tool call is request → JSON response. MCP
  streaming responses are easy to add once a tool actually benefits.
