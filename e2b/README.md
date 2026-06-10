# Mobivable agent-build E2B template

The autonomous Expo build runs inside an E2B sandbox (`src/lib/agent-workspace.server.ts`).
The **default** `@e2b/code-interpreter` image has no `bun` or `expo`, so builds fail on it.
This directory defines a custom template that has Node 20 + bun + Expo CLI + `serve`.

## Build & publish (v2 build system)

E2B retired the v1 `e2b template build` flow. Templates are now defined in SDK
code and built by running a script:

- `template.ts` — parses `e2b.Dockerfile` via `Template().fromDockerfile(...)`.
- `build.prod.ts` — calls `Template.build(template, "mobivable-expo", { cpu, mem })`.
- `e2b.Dockerfile` — still the image source of truth (Node 20 + bun + expo + serve).
- `e2b.toml` — **legacy/vestigial** (v1 only). Resources now live in `build.prod.ts`.

Prereqs: Docker running, the [E2B CLI](https://e2b.dev/docs/cli) installed
(`npm i -g @e2b/cli@latest`), and the `e2b` SDK + `tsx` available
(`npm i -D e2b tsx` at the repo root — `e2b` is already a transitive dep).

```bash
cd e2b
e2b auth login              # or rely on E2B_ACCESS_TOKEN (build.prod.ts reads .env.local)
npx tsx build.prod.ts       # builds e2b.Dockerfile, publishes "mobivable-expo"
```

The build runs the sanity check at the end of the Dockerfile (`node`, `bun`,
`expo`, `serve` versions); if any tool is missing the build fails — that's intended.
If it fails with a plan-limit error, lower `cpuCount`/`memoryMB` in `build.prod.ts`.

## Turn it on

The code only uses the custom template when `E2B_TEMPLATE` is set — otherwise it
falls back to the default image (current behavior). After building, set on the
server/host that runs the `ws_*` MCP tools (and in `adk-agent` if the ADK service
runs them):

```
E2B_TEMPLATE=mobivable-expo     # or the template id the build prints
E2B_API_KEY=...                 # already required
```

Restart the server. New build sandboxes will boot from the image that has bun/expo.

## Notes

- `template_name`/`resources` live in `e2b.toml`. Bump `memory_mb` if `expo export`
  OOMs on large apps.
- This does **not** pre-install per-project npm deps — the agent still runs
  `bun install` per project (gap #2 tracks making long installs non-blocking).
- Keep the base on `e2bdev/code-interpreter` so the SDK's `runCode` path keeps
  working for the legacy sandbox panel.
