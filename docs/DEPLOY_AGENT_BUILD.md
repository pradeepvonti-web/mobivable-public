# Deploying the agent build engine (Expo + live preview)

End-to-end steps to deploy the autonomous Expo build flow: read mockup → invoke
frontend-design skill → write real files → tsc/lint → live preview. Four moving
parts:

| Part | Where it runs | Deploy with |
|---|---|---|
| Main app + **MCP server** (`/api/public/mcp`) + `ws_*` tools | Cloudflare Worker `tanstack-start-app` | Lovable Publish (or `wrangler deploy`) |
| Database | Supabase | `supabase db push` |
| Build sandbox (node/bun/expo) | E2B | `e2b template build` |
| Agent brain (optional) | Cloud Run `mobivable-adk` | `gcloud builds submit` |

> ⚠️ **Read the "Production caveat" at the bottom first** — on the Cloudflare
> Worker, a real `bun install` + `expo export` will exceed request/CPU limits
> (gaps #2/#3). #1 (this work) makes the tools *exist*; it does not by itself make
> a multi-minute build complete inside one Worker request.

---

## 1. Database (Supabase)

Apply migrations so `projects.attachments`, `project_file_overrides`, and
`mcp_agent_skills` exist:

```bash
supabase db push          # or apply supabase/migrations/* via the dashboard
```

## 2. Build the E2B sandbox image

Prereqs: Docker running, [E2B CLI](https://e2b.dev/docs/cli), `E2B_API_KEY` exported.

```bash
cd e2b
e2b template build        # builds e2b.Dockerfile → template "mobivable-expo"
```

The build self-checks `node`, `bun`, `expo`, `serve` and fails if any is missing.
Note the template name/id it prints.

## 3. Deploy the ADK agent (optional — only if you want the ADK/Gemini brain)

```bash
gcloud builds submit --config adk-agent/cloudbuild-adk.yaml adk-agent/
```

Then set these on the `mobivable-adk` Cloud Run service (Console → Variables, or
add `--set-env-vars` lines to `cloudbuild-adk.yaml`):

| Var | Value |
|---|---|
| `MOBIVABLE_MCP_URL` | `https://<your-worker-domain>/api/public/mcp` |
| `MCP_SERVICE_TOKEN` | a strong random secret — **must equal** the Worker's `MCP_INTERNAL_TOKEN` |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | your GCP project / `us-central1` |

The ADK service calls back into the MCP server for every tool (including `ws_*`),
so the E2B/build work happens on the **Worker**, not in Cloud Run. The ADK box
needs no E2B key.

> The ADK agent runs **Gemini**. The built-in Claude tool-loop is now the
> **default brain** — the ADK path only runs when you set `AGENT_BRAIN=adk` on
> the Worker (and `ADK_AGENT_URL`). For the Opus/Sonnet build, leave
> `AGENT_BRAIN` unset and configure the Anthropic provider (below).

## 4. Configure the Worker (main app)

Set these as Worker secrets/vars (Lovable env settings, or
`wrangler secret put <NAME>` if you deploy directly):

**Required**
| Var | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side `supabaseAdmin` (MCP tools, file mirroring) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | client |
| `E2B_API_KEY` | boots build sandboxes |
| `E2B_TEMPLATE` | **`mobivable-expo`** (or the id from step 2) — without this it uses the default image that has no bun/expo |

**Rollout safety (optional)**
| Var | Purpose |
|---|---|
| `DISABLE_AGENT_WORKSPACE` | set to `1` to force ALL builds onto the schema path (no Expo/E2B) — an instant kill-switch if the workspace misbehaves |

> **Graceful fallback:** if `E2B_API_KEY` is missing (or the kill-switch is on),
> the build automatically uses the legacy **schema path** instead of the Expo
> workspace — builds keep working, they just don't produce a live Expo app.
> So you can deploy this code safely *before* E2B is set up; the new path only
> activates once `E2B_API_KEY` (+ `E2B_TEMPLATE`) are present.

**AI provider — for the Opus/Sonnet build, use Anthropic**
| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude build loop + `read_mockup` vision |
| `AI_PROVIDER=anthropic` | **force Claude** as the provider (else detection favors Lovable/Vertex → Gemini). With this set, the build loop uses **Opus** (planning) + **Sonnet** (execution). |
| `VERTEX_AI_SERVICE_ACCOUNT` / `VERTEX_AI_PROJECT` / `VERTEX_AI_LOCATION` | Vertex (Gemini) |
| `GOOGLE_AI_API_KEY` | Gemini (dev) |

**Only if using the ADK (Gemini) brain**
| Var | Purpose |
|---|---|
| `AGENT_BRAIN=adk` | opt into the ADK path (default is the Claude loop) |
| `ADK_AGENT_URL` | `https://mobivable-adk-xxxxx.run.app` |
| `MCP_INTERNAL_TOKEN` | **must equal** the ADK's `MCP_SERVICE_TOKEN` |

Deploy:

```bash
# Lovable: click Publish.   Direct: 
wrangler deploy
```

## 5. Two-pass wiring (resolve the URL chicken-and-egg)

1. Deploy the Worker → note its domain.
2. Deploy ADK with `MOBIVABLE_MCP_URL` = that domain + `/api/public/mcp`.
3. Set `ADK_AGENT_URL` (+ matching token) on the Worker → redeploy the Worker.

## 6. Verify

- **MCP health:** `curl -H "Authorization: Bearer <MCP_INTERNAL_TOKEN>" https://<worker>/api/public/mcp` → `{ ok: true, tools: N }`.
- **Runtime self-check (do this first — confirms gaps #1 & #3):** call the
  `ws_diagnose` tool on the deployed host. It spins up a throwaway sandbox and
  reports per-step whether `create / files.write / files.read / commands.run /
  bun present / getHost` work **on this server** (e.g. the Cloudflare Worker):

  ```bash
  curl -s -X POST https://<worker>/api/public/mcp \
    -H "Authorization: Bearer <MCP_INTERNAL_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ws_diagnose","arguments":{}}}'
  ```

  Expect every step `ok:true`. If `create` fails → E2B SDK doesn't run on this
  host (see Runtime compatibility below). If `bun present` fails → `E2B_TEMPLATE`
  isn't set or the template lacks bun (step 2).
- **DB:** open a project, run a build, confirm rows appear in `project_file_overrides`.
- **Sandbox tools:** in chat after approving a design, the timeline should show
  🖼️ Reading mockup → 🧩 Invoking skill → 📝 Writing file → ⌨️ Running command.
- **Live preview:** after `ws_start_preview`, the Expo toggle in the device frame
  loads the running app; **Restart** rebuilds it.

---

## Runtime compatibility (gap #3 — E2B on Cloudflare Workers)

Static analysis of the installed SDK (`e2b@2.28.0`) is **encouraging**: for
non-Node runtimes it uses global `fetch` (`if (currentRuntime !== "node") return fetch`),
guards `undici` with a `fetch` fallback, and only dynamic-imports the Node-only
`tar`/`glob` in the *template-build* path (which runs via the E2B CLI, not the
Worker). Sandbox ops go over `@connectrpc/connect-web` + `openapi-fetch` (both
fetch-based). So it **should** work on the Worker with `nodejs_compat`.

It is **not yet confirmed on a live deploy** — run `ws_diagnose` (step 6) to
settle it. If `create`/`commands.run` fail there, host the `ws_*` tools on a
small Node Cloud Run sidecar (point `MOBIVABLE_MCP_URL` at it) — the code is
unchanged; only where the MCP server runs differs.

## Production caveat (must address for real builds)

The `ws_*` tools (and the Expo install/export) run **inside the Cloudflare
Worker** that serves `/api/public/mcp`. Workers cap request CPU/wall-clock well
below the **minutes** a first `bun install` + `expo export` takes, and the
ADK→MCP bridge has a **120s** client timeout. So with the architecture as-is:

- The **schema path** works fine.
- The **real Expo build + live preview will time out** on the first heavy command.

To make it production-real, do **gap #2** next: run long commands in the
background (`commands.run(..., {background:true})`) and poll status via a new
`ws_command_status` tool, and/or host the `ws_*` tools on a long-lived Node
service (e.g. a small Cloud Run sidecar) instead of the Worker, pointing
`MOBIVABLE_MCP_URL` at it. Until then, treat the live Expo build as
staging/demo-gated.
