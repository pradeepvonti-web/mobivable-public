# Pivot to GitHub-triggered EAS Builds

## The flow

```
Lovable                    GitHub                   Expo (EAS)
-------                    ------                   ----------
1. Push Expo scaffold  →   New repo created
   (multi-file commit)     `lovable-<slug>`

2. User clicks         →   (one-time)          →    Install Expo GitHub App
   "Connect to Expo"        Install app on repo     on selected repo

3. Server links EAS app                         →   setGitHubRepositoryOnEasApp
   to that repo

4. Build button        →                        →   createGitHubBuildAsync
                                                     (EAS pulls from GitHub,
                                                      runs `eas build`,
                                                      handles all schema)

5. Poll status         ←                        ←   builds.byId
   Download APK / logs
```

## What changes

**1. Push multi-file commit to GitHub** (extend `pushCodeToGithub`)
- Current: PUTs a single file via Contents API
- New: use Git Data API (createTree + createCommit + updateRef) to commit
  the whole Expo scaffold (package.json, app.json, eas.json, App.js,
  index.js, assets/*, babel.config.js, .gitignore, eas-hook README) in
  one commit. Reuse `scaffoldExpoProject()` from `eas.server.ts`.

**2. New `eas_apps` columns** (migration)
- `github_repo_owner text`
- `github_repo_name text`
- `github_repo_installed boolean default false`  (whether Expo GitHub app
  is installed on this repo — we detect via EAS API)

**3. New server functions in `eas.functions.ts`**
- `pushExpoScaffoldToGithub({ projectId })` — creates repo + commits
  scaffold + records repo in `eas_apps`.
- `linkEasAppToGithub({ projectId })` — calls EAS
  `setGitHubRepositoryAndBaseDirectory` mutation; returns
  `{ ok, needsAppInstall, installUrl }` if the Expo GitHub App isn't
  installed yet.
- Rewrite `startEasBuild` to use `createGitHubBuildAsync` (or current
  equivalent) — no more tarball upload, no more `AndroidJobInput`.

**4. UI changes in `DeploymentsPanel`**
- Three-step gate before the Build button:
  1. ✓ Expo connected
  2. ✓ GitHub connected (link to `/settings` if not)
  3. ✓ Repo created & linked (button: "Push to GitHub & link to EAS")
     - If Expo GitHub App not installed → show clear CTA with
       `https://github.com/apps/expo/installations/new` link.
- Once all three green: enable "Build APK on EAS".

**5. Drop the tarball path**
- Remove `makeTarGz`, `uploadProjectArchive`, `archive_url` writes.
  Keep `scaffoldExpoProject` (still used for the GitHub commit content).

## Manual step the user must do once

Install **Expo's GitHub App** on the repo:
- We surface a deep link directly to the install page in the UI
- Takes ~10 seconds; only required first time per repo

After that, every rebuild is one click — EAS pulls latest `main` from
GitHub and runs `eas build` natively. No more reverse-engineering EAS's
private GraphQL shape.

## What we keep
- EXPO_TOKEN, `easGraphql()` client, `eas_builds` table, polling, status UI.
- `scaffoldExpoProject()` (used to generate files for the GitHub commit).
- All RLS, all secret handling.

## Tradeoffs
- One-time manual GitHub-App install per repo (clear UI link).
- We commit a working Expo project to the user's GitHub — they can also
  clone & build locally if they want (a nice bonus).
- ~1 build cycle to verify the EAS GraphQL mutation name is current
  (the EAS schema for GitHub builds is public-stable, unlike `AndroidJobInput`).