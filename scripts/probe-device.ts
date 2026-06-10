/**
 * Diagnose the Expo Go device-preview server in a live sandbox.
 * Connects to an existing sandbox (by id) OR boots a fresh one, starts Metro,
 * and reports: is port 8081 serving? what does the expo-start log say? what URL
 * forms does the manifest advertise?
 *
 * Run:  npx tsx scripts/probe-device.ts [sandboxId]
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
const template = process.env.E2B_TEMPLATE;
const PORT = 8081;

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

  const host = sbx.getHost(PORT);
  console.log("public host for 8081:", host);

  // Try plain `expo start` (hosted host) first.
  console.log("\n=== expo start (hosted host) ===");
  await sbx.commands.run(
    `mkdir -p .jobs && (REACT_NATIVE_PACKAGER_HOSTNAME='${host}' EXPO_NO_TELEMETRY=1 CI=1 nohup bunx expo start --port ${PORT} > .jobs/expo-go.log 2>&1 &)`,
    { cwd: WORKDIR },
  );
  // give Metro time to boot
  await new Promise((r) => setTimeout(r, 35_000));
  const serving = await sbx.commands.run(
    `bun -e "fetch('http://localhost:${PORT}').then(r=>{console.log('status',r.status);process.exit(0)}).catch(e=>{console.log('ERR',e.message);process.exit(1)})"`,
    { cwd: WORKDIR },
  );
  console.log("localhost:8081 →", (serving.stdout + serving.stderr).trim(), "exit=", serving.exitCode);
  const manifest = await sbx.commands.run(`curl -s -i http://localhost:${PORT} | head -30`, { cwd: WORKDIR });
  console.log("manifest head:\n", (manifest.stdout || manifest.stderr).slice(0, 800));
  const log = await sbx.commands.run("tail -40 .jobs/expo-go.log", { cwd: WORKDIR });
  console.log("\nexpo-go.log:\n", (log.stdout || log.stderr).slice(-2000));
} finally {
  await sbx.kill().catch(() => {});
  console.log("\n(killed sandbox)");
}
