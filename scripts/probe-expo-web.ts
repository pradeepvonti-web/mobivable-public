/**
 * Verifies the Expo-web preview path on the CURRENT scaffold: seed → bun install
 * → `bunx expo export -p web`. This is what the live preview runs, and it's the
 * step most likely to break on an SDK bump (e.g. SDK 54 + React 19 web export).
 *
 * Run:  npx tsx scripts/probe-expo-web.ts
 */
import { readFileSync } from "node:fs";

function loadEnv(file: string) {
  let txt: string;
  try {
    txt = readFileSync(file, "utf8");
  } catch {
    return;
  }
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

console.log(`Booting ${template ?? "default"} sandbox…`);
const sbx = template
  ? await Sandbox.create(template, { apiKey, timeoutMs: 600_000 })
  : await Sandbox.create({ apiKey, timeoutMs: 600_000 });
console.log("sandbox:", sbx.sandboxId);

try {
  await sbx.commands.run(`sudo mkdir -p ${WORKDIR} && sudo chown -R "$(id -un):$(id -gn)" ${WORKDIR}`);
  const files = expoScaffold("Budgeteye");
  for (const [rel, content] of Object.entries(files)) {
    await sbx.files.write(`${WORKDIR}/${rel}`, content);
  }
  console.log(`seeded ${Object.keys(files).length} files`);

  console.log("→ node --version:");
  const node = await sbx.commands.run("node --version");
  console.log("  node", node.stdout.trim());

  console.log("→ bun install…");
  const install = await sbx.commands.run("bun install", { cwd: WORKDIR, timeoutMs: 420_000 });
  console.log(`bun install exit=${install.exitCode}`);

  console.log("→ bunx expo export -p web (the live-preview build)…");
  const exp = await sbx.commands.run("bunx expo export -p web", { cwd: WORKDIR, timeoutMs: 420_000 });
  console.log(`expo export exit=${exp.exitCode}`);
  const out = (exp.stdout + "\n" + exp.stderr).trim();
  console.log(out.split("\n").slice(-25).join("\n"), "\n");

  // Confirm a web bundle landed in dist/.
  const dist = await sbx.commands.run("ls -la dist 2>/dev/null && echo '---' && ls dist/_expo/static/js/web 2>/dev/null | head", { cwd: WORKDIR });
  console.log("dist/:\n" + (dist.stdout || "(no dist)"));

  const ok = install.exitCode === 0 && exp.exitCode === 0;
  console.log(ok ? "✅ SDK 54 web export succeeded." : "❌ Web export failed.");
  process.exit(ok ? 0 : 1);
} finally {
  await sbx.kill().catch(() => {});
}
