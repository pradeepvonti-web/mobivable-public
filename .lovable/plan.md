
# Goal

Make each project a real, shippable mobile app: schema → runnable Expo/React Native code → wired to its **own Supabase project** with auth, CRUD, push, native APIs, and payments. Staged rollout, starting with **Real Backend Integration**.

# Milestone 1 — Real Backend Integration (this phase)

Every generated app gets its own Supabase project, automatically provisioned, with schema derived from the app's data model, RLS, auth, and a typed client baked into the export.

## What we build

### 1. Data model in the app schema
Extend `MobileAppSchema` with a new top-level `backend` block:
```ts
backend: {
  tables: [{ name, columns: [{ name, type, nullable, default }], rls: "owner"|"public_read"|"none" }],
  auth: { providers: ["email","google","apple"], requireEmailConfirm: boolean },
  storage: [{ bucket, public }],
  push: boolean,
}
```
AI generator (`generateProject`) is updated to emit this block alongside `screens`. The schema validator gains `validateBackend()` with auto-fix.

### 2. Per-project Supabase provisioning
- New table `project_backends` (project_id, supabase_project_ref, supabase_url, anon_key, service_role_key encrypted, region, status, created_at). Already partially exists as `project_integrations` — we extend it.
- New server fn `provisionProjectBackend({ projectId })`:
  - Calls Supabase Management API with the user's PAT to create a new project.
  - Polls until `ACTIVE_HEALTHY`.
  - Runs migrations derived from `backend.tables` (CREATE TABLE + RLS policies + `has_role` pattern for auth-gated rows).
  - Configures auth providers, storage buckets.
  - Stores keys in `project_backends`, encrypted at rest with a project-scoped key.
- Required secret: `SUPABASE_MANAGEMENT_TOKEN` (user-supplied PAT). We'll prompt for it.

### 3. Backend panel in the project UI
New tab next to PixLab/CodeExport: **Backend**.
- Shows provisioning status, region selector, Supabase project ref, dashboard deep-link.
- Lists tables generated from schema, lets user add/edit columns and RLS mode (writes back into `backend.tables` and re-runs migrations).
- Auth providers toggle.
- "Re-sync schema" button: diffs current Supabase schema vs `backend.tables`, generates migration, applies.

### 4. Code export wired to the real backend
`generateMobileCode` is updated so the emitted React Native project:
- Includes `@supabase/supabase-js` and a generated `lib/supabase.ts` with the project's URL + anon key.
- Generates typed model files per table (`models/{Table}.ts`) with CRUD helpers.
- Wires `signInWithPassword` / Google OAuth / Apple to the screens flagged as auth screens.
- Generates a `useAuthSession` hook + protected-route wrapper.
- Includes example list/detail screens that actually read from the user's tables.

### 5. Preview that hits the real backend
The web preview (`MobileAppRenderer`) gains a "Live data" toggle. When on, list/detail components fetch from the project's Supabase using the anon key (RLS-scoped to whoever is signed in via a test-user flow). Off = mock data (current behavior).

## Tech specifics (technical section)

- **Encryption**: keys stored in `project_backends` are AES-GCM encrypted with a per-row IV; master key in `PROJECT_BACKEND_KMS_KEY` secret. Decrypt only inside server fns that need to mint short-lived tokens.
- **Migrations**: each schema change generates a versioned SQL file stored in `project_migrations` (project_id, version, sql, applied_at). Server fn `applyPendingMigrations(projectId)` runs them in order via Management API SQL endpoint.
- **Concurrency**: provisioning is async; UI subscribes via Supabase Realtime to `project_backends.status`.
- **Validation**: column types limited to `text|int|float|bool|timestamp|jsonb|uuid` to keep generators tractable.
- **RLS templates**: `owner` → `auth.uid() = user_id`; `public_read` → SELECT to anon, write to owner; `none` → admin-only.
- **Cost guard**: free-tier users limited to 1 backend; show plan-gate when they hit it.

# Milestone 2 — End-to-end Expo export (next)
Full Expo project zip with all screens, navigation (React Navigation), theme tokens, generated CRUD wired to M1's backend, auth screens, env file pre-filled with the project's keys. Downloadable from the existing CodeExportPanel.

# Milestone 3 — EAS Cloud Builds
Add "Build APK / IPA" button. Calls Expo EAS Build API with the generated repo, polls build status, shows installable artifact link. Requires user's EAS token.

# Milestone 4 — Native capabilities scaffolding
Push (Expo Notifications + Supabase Edge Function sender), camera/location/storage permission scaffolds, payments (Stripe/Paddle templates with webhook → Supabase).

# Milestone 5 — Multi-framework expansion
Flutter, SwiftUI, Jetpack Compose generators that consume the same `backend` block and target the same Supabase project (using each ecosystem's Supabase SDK).

# What I need from you to start M1
1. Approve this plan.
2. A **Supabase Management API personal access token** (PAT) — I'll prompt for it as a secret after approval. Get one at https://supabase.com/dashboard/account/tokens.
3. Confirm region default (suggest `us-east-1`).

After approval I'll implement M1 in this order: schema extension → DB tables + provisioning server fn → Backend panel UI → secret prompt → first end-to-end test → wire preview to live data.
