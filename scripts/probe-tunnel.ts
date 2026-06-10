/**
 * Verify the Expo Go TUNNEL path end-to-end (minus the phone): seed → bun
 * install → `expo start --tunnel` → parse the *.exp.direct URL from the log →
 * curl the tunnel host to confirm it's publicly reachable and serving a
 * manifest. This is what makes "Real Device" work from any network.
 *
 * Run:  npx tsx scripts/probe-tunnel.ts
 */
import { readFileSync } from "node:fs";
function loadEnv(file: string) {
  let txt: string;
  try { txt = readFileSync(file, "utf8"); } catch { return; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const { expoScaffold } = await import("../src/lib/expo-scaffold");
const { Sandbox } = await import("@e2b/code-interpreter");
const WORKDIR = "/workspace";
const PORT = 8081;
const apiKey = process.env.E2B_API_KEY!;
const template = process.env.E2B_TEMPLATE;

console.log(`Booting ${template ?? "default"} sandbox…`);
const sbx = template
  ? await Sandbox.create(template, { apiKey, timeoutMs: 600_000 })
  : await Sandbox.create({ apiKey, timeoutMs: 600_000 });
console.log("sandbox:", sbx.sandboxId);

try {
  await sbx.commands.run(`sudo mkdir -p ${WORKDIR} && sudo chown -R "$(id -un):$(id -gn)" ${WORKDIR}`);
  const files = expoScaffold("Budgeteye");
  for (const [rel, content] of Object.entries(files)) await sbx.files.write(`${WORKDIR}/${rel}`, content);
  console.log("seeded; bun install…");
  const install = await sbx.commands.run("bun install", { cwd: WORKDIR, timeoutMs: 420_000 });
  console.log("bun install exit=", install.exitCode);

  console.log("→ expo start --tunnel (background)…");
  await sbx.commands.run(
    `mkdir -p .jobs && (EXPO_NO_TELEMETRY=1 CI=1 nohup bunx expo start --tunnel --port ${PORT} > .jobs/expo-go.log 2>&1 &)`,
    { cwd: WORKDIR },
  );

  // Wait for "Tunnel ready", then extract the tunnel host. In CI mode the exp://
  // URL isn't printed, so try several sources: (a) the log, (b) the manifest
  // (hostUri / launchAsset.url advertise the tunnel host), (c) .expo state.
  let host: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const log = (await sbx.commands.run("cat .jobs/expo-go.log 2>/dev/null", { cwd: WORKDIR })).stdout || "";
    const clean = log.replace(/\[[0-9;]*m/g, "");
    const direct = clean.match(/[a-z0-9.-]+\.exp\.direct/i);
    if (direct) { host = direct[0]; console.log(`found in log: ${host}`); break; }

    if (/Tunnel ready/i.test(clean)) {
      // Ask the dev server for its manifest and sniff the tunnel host.
      const man = await sbx.commands.run(
        `curl -s -H "expo-platform: ios" -H "expo-dev-client-id: probe" http://localhost:${PORT} ` +
          `| tr ',' '\\n' | grep -oE "[a-z0-9.-]+\\.exp\\.direct" | head -1`,
        { cwd: WORKDIR },
      );
      const h = (man.stdout || "").trim();
      if (h) { host = h; console.log(`found in manifest: ${host}`); break; }
      // Fallback: grep the on-disk dev-server state.
      const st = await sbx.commands.run(
        `grep -rhoE "[a-z0-9.-]+\\.exp\\.direct" .expo 2>/dev/null | head -1`,
        { cwd: WORKDIR },
      );
      const h2 = (st.stdout || "").trim();
      if (h2) { host = h2; console.log(`found in .expo state: ${host}`); break; }
    }
  }

  if (!host) {
    const log = await sbx.commands.run("tail -40 .jobs/expo-go.log", { cwd: WORKDIR });
    console.log("❌ No tunnel host found. Log:\n", log.stdout);
    process.exit(1);
  }
  const url = `exp://${host}`;
  console.log("tunnel URL:", url);

  // Confirm the tunnel host is publicly reachable + serving (curl over https).
  const httpsHost = url.replace(/^exp:\/\//, "https://");
  const curl = await sbx.commands.run(`curl -s -o /dev/null -w "%{http_code}" -m 20 ${httpsHost}`, { cwd: WORKDIR });
  console.log(`curl ${httpsHost} → HTTP ${curl.stdout.trim()}`);

  const ok = /^(200|30\d)$/.test(curl.stdout.trim());
  console.log(ok ? "✅ Tunnel is up and publicly reachable — Expo Go can connect." : "⚠️ Tunnel URL found but host not reachable yet.");
  process.exit(ok ? 0 : 1);
} finally {
  await sbx.kill().catch(() => {});
  console.log("(killed sandbox)");
}
