/**
 * Verify the EAS native-build pipeline with the real EXPO_TOKEN, end to end:
 * scaffold → install → whoami (token auth) → init (register project) → build
 * --no-wait (queue a cloud APK build). Confirms the token can authenticate,
 * create a project, and enqueue a build — without waiting ~15 min for it.
 *
 * Run:  npx tsx scripts/probe-eas.ts
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
const apiKey = process.env.E2B_API_KEY!;
const token = process.env.EXPO_TOKEN;
const template = process.env.E2B_TEMPLATE;

if (!token) { console.log("❌ EXPO_TOKEN not set."); process.exit(1); }

console.log(`Booting ${template ?? "default"} sandbox…`);
const sbx = template
  ? await Sandbox.create(template, { apiKey, timeoutMs: 600_000 })
  : await Sandbox.create({ apiKey, timeoutMs: 600_000 });
console.log("sandbox:", sbx.sandboxId);

const env = `EXPO_TOKEN='${token}' EXPO_NO_TELEMETRY=1`;
const run = (cmd: string, timeoutMs = 300_000) =>
  sbx.commands.run(`${env} ${cmd}`, { cwd: WORKDIR, timeoutMs }).catch((e) => ({ exitCode: 1, stdout: "", stderr: String(e) }) as any);

try {
  await sbx.commands.run(`sudo mkdir -p ${WORKDIR} && sudo chown -R "$(id -un):$(id -gn)" ${WORKDIR}`);
  const files = expoScaffold("Budgeteye");
  for (const [rel, content] of Object.entries(files)) await sbx.files.write(`${WORKDIR}/${rel}`, content);
  console.log("seeded; bun install…");
  const install = await sbx.commands.run("bun install", { cwd: WORKDIR, timeoutMs: 420_000 });
  console.log("bun install exit=", install.exitCode);

  console.log("\n→ eas whoami (token auth):");
  const who = await run("bunx eas-cli whoami", 60_000);
  console.log(`  exit=${who.exitCode}: ${(who.stdout || who.stderr).trim().split("\n").slice(-2).join(" | ")}`);

  console.log("\n→ eas init --non-interactive (register project):");
  const init = await run("bunx eas-cli init --non-interactive --force", 120_000);
  console.log(`  exit=${init.exitCode}`);
  console.log("  " + (init.stdout + "\n" + init.stderr).trim().split("\n").slice(-8).join("\n  "));

  console.log("\n→ eas build -p android --profile preview --non-interactive --no-wait (EAS_NO_VCS=1):");
  // Redirect to a file + capture exit code so we see the REAL error even on
  // non-zero exit (E2B's commands.run throws and loses stdout otherwise).
  await sbx.commands
    .run(
      `EXPO_TOKEN='${token}' EXPO_NO_TELEMETRY=1 EAS_NO_VCS=1 bunx eas-cli build ` +
        `--platform android --profile preview --non-interactive --no-wait > eas-build.log 2>&1 ; echo $? > eas-build.exit`,
      { cwd: WORKDIR, timeoutMs: 300_000 },
    )
    .catch(() => {});
  const logR = await sbx.commands.run("cat eas-build.log; echo '---exit---'; cat eas-build.exit", { cwd: WORKDIR }).catch(() => ({ stdout: "" }) as any);
  const out = (logR.stdout || "").trim();
  console.log("  " + out.split("\n").slice(-22).join("\n  "));

  const buildUrl = (out.match(/https:\/\/expo\.dev\/[^\s]+/g) || []).pop() || null;
  const queued = build.exitCode === 0 || /Build queued|in progress|Waiting/i.test(out);
  console.log("\nbuild URL:", buildUrl);
  console.log(queued ? "✅ EAS build queued — token + init + build all work." : "❌ EAS build did not queue (see log above).");
  process.exit(queued ? 0 : 1);
} finally {
  await sbx.kill().catch(() => {});
  console.log("(killed sandbox)");
}
