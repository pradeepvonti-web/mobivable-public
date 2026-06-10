# Native device preview + EAS deploy

Two capabilities that make generated apps *true native*, beyond the in-browser
Expo-web preview:

1. **Expo Go real-device preview** — open the app on a physical phone via QR, so
   camera/location/notifications/secure-store and real 60fps behaviour work.
2. **EAS cloud builds** — produce real `IPA` / `APK` / `AAB` binaries and submit
   to the App Store / Google Play.

Both run inside the per-project E2B sandbox; this doc covers what they need.

---

## 1. Expo Go real-device preview

- UI: the device frame's **Real Device** button → `startExpoGo` server fn →
  `startExpoGoServer()` runs `bunx expo start` (Metro) in the sandbox on port
  `8081`, exposed via the sandbox's public host.
- It sets `REACT_NATIVE_PACKAGER_HOSTNAME` to that public host so the served
  manifest advertises a reachable URL, and returns:
  - `expUrl` — `exp://8081-<id>.e2b.app` (encode as the QR for Expo Go)
  - `devServerUrl` — `https://8081-<id>.e2b.app` (the manifest)
- On the phone: install **Expo Go**, scan the QR (or paste `expUrl`).

**Caveats**
- Pure Expo Go works for JS-only + bundled Expo modules. An app using custom
  native code needs a **dev build** (`eas build --profile development`).
- Some networks block the `exp://` hosted-Metro path; if a device can't connect,
  fall back to a dev build or `expo start --tunnel` (ngrok).
- No extra secrets required — uses the existing `E2B_API_KEY`.

---

## 2. EAS cloud builds (real binaries)

- UI/agent → `startEasBuild` server fn → `triggerEasBuild()` runs
  `bunx eas-cli build --platform <p> --profile <preview|production> --non-interactive --no-wait`
  in the sandbox. The binary builds on **Expo's** infrastructure; the artifact +
  install QR appear in the Expo dashboard.
- Build profiles live in the scaffold's **`eas.json`**:
  - `development` — dev client (for the device preview of native-code apps)
  - `preview` — internal distribution; Android emits an installable **APK**
  - `production` — store-ready **AAB** (Android) / **IPA** (iOS)

### Required configuration (prod)

| Secret | Purpose |
|---|---|
| **`EXPO_TOKEN`** | Expo access token — authenticates `eas-cli`. Without it, `triggerEasBuild` returns `ok:false` with guidance and the UI keeps the action disabled. Create at https://expo.dev/settings/access-tokens |
| EAS project link | First build links the project (or set `extra.eas.projectId` in `app.json`). |

### Build profiles in the Publish modal

The Publish modal exposes the three `eas.json` profiles:
- **Preview** → installable **APK** (internal testing).
- **Production** → store-ready **AAB** (Android) / **IPA** (iOS).
- **Dev Client** → a development build for apps that use native modules **not**
  bundled in Expo Go (the scaffold's modules — camera/location/etc. — already
  work in Expo Go, so this is only for custom native code).

### Store submission (`eas submit`) — automated, additional credentials

Once a build exists, the Publish modal shows **Submit to Google Play / App
Store** → `startEasSubmit` → `eas submit --platform <p> --latest`. It needs
store credentials in `eas.json`'s `submit` profile; without them the job exits
non-zero and the UI surfaces a clear "store credentials needed" message.

- **iOS**: Apple Developer account, App Store Connect API key, bundle id.
- **Android**: Google Play service-account JSON, package name.
- These are **not** auto-provisioned — submission is a deliberate, credentialed
  step. Configure under `submit.production` in `eas.json`.

### Gating

`isEasConfigured()` returns `Boolean(process.env.EXPO_TOKEN)`. The `easAvailable`
server fn surfaces this so the UI only enables native-build actions when the
token is present.
