# Mobivable → Lovable-grade roadmap

Goal: turn Mobivable from a schema-renderer into a true codegen + live-sandbox
mobile-app platform (Lovable-grade, but for React Native / Expo).

## Phase 1 — Real Expo codegen + Snack live preview  *(scaffolded this turn)*
- Server fn `generateExpoProject(projectId)` — uses Lovable AI Gateway
  (`google/gemini-2.5-pro`) to convert the existing project prompt + schema into
  a real Expo file map: `App.tsx`, `app/screens/*`, `app/components/*`,
  `package.json`. Stored under `project.result.snack = { files, dependencies, hashId }`.
- Server fn `pushToSnack({ files, dependencies })` — POSTs to
  `https://exp.host/--/api/v2/snack/save` and returns `{ id, hashId }`. No API
  key needed for anonymous snacks.
- Route `/projects/$projectId/live` — "Generate live app" button + embedded
  `<iframe src="https://snack.expo.dev/embedded/@snack/{hashId}?platform=web">`.
  Lets users see and interact with the *real* RN app running in the browser.

Why Snack first (not WebContainers): zero install, runs RN web bundles
out-of-the-box, free, mobile QR-code scanning included.

## Phase 2 — Conversational agent loop over the codebase
- New `agent_messages` table per project (role, content, file_diffs jsonb).
- Server fn `chatEditFiles(projectId, instruction)`:
  1. Loads current `snack.files`,
  2. Sends to Gemini with tools `read_file`, `write_file`, `delete_file`
     (AI SDK `tool()` + `stepCountIs(50)`),
  3. Applies returned diffs, re-pushes to Snack,
  4. Streams thoughts + diffs back via `/api/chat`.
- UI: split view — left: chat with diff bubbles + accept/revert, right: live
  Snack iframe that hot-reloads.

## Phase 3 — Project history & restore points
- `project_snapshots` table (project_id, label, files jsonb, created_at).
- Auto-snapshot before every agent edit. UI: timeline with "Restore" button.
- Share links: `/p/{shortId}` read-only preview of any snapshot.

## Phase 4 — Self-hosted WebContainer (escape Snack limits)
- Add `@webcontainer/api` for in-browser Node — runs full Expo bundler client-side
  for projects that outgrow Snack (custom native modules, larger deps, private
  packages). Snack stays the default; WebContainer is opt-in per project.

## Phase 5 — Backend provisioning parity
- Per-project Supabase: button "Add backend" provisions a child Supabase
  project via the management API, injects `EXPO_PUBLIC_SUPABASE_*` into the
  Snack files, generates typed client.
- Per-project secrets vault (already partially built via `secrets` table on
  Lovable Cloud).

## Phase 6 — Deployment dashboard
- One-click EAS Build + Submit (already scaffolded in `eas.functions.ts`).
- Add OTA update channel mgmt, build history, store-listing metadata editor,
  TestFlight/Play-Internal invite UI.

## Phase 7 — Workspaces & collaboration
- `workspaces`, `workspace_members` (with `app_role` enum already exists).
- Realtime cursors on the chat panel using Supabase Realtime.
- Comments anchored to file ranges.

---

### Out of scope (intentional)
- Custom domain hosting — Snack URLs cover preview; EAS covers production.
- Visual drag-and-drop editor — keep chat-first. The existing schema editor stays
  for theme/screen tweaks only.

### Risks
- Snack API is undocumented but stable (used by snack.expo.dev itself).
  Mitigation: WebContainer fallback in Phase 4.
- AI cost: full-codebase regen on every chat is expensive. Mitigation in
  Phase 2: only send changed-file context + diff-based edits.
