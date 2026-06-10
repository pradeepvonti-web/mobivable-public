/**
 * Deep end-to-end test of the autonomous build FLOOR: seed the exact Expo
 * scaffold the engine uses, then `bun install` + `bunx tsc --noEmit` inside a
 * real E2B sandbox to prove the scaffold actually installs and type-checks.
 *
 * This is the heart of the build engine minus the LLM loop + Supabase mirror.
 *
 * Run:  npx tsx scripts/probe-expo-build.ts
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
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

console.log(`Booting ${template ?? "default"} sandbox (10 min budget)…`);
const sbx = template
  ? await Sandbox.create(template, { apiKey, timeoutMs: 600_000 })
  : await Sandbox.create({ apiKey, timeoutMs: 600_000 });
console.log("sandbox:", sbx.sandboxId);

try {
  // Mirror the runtime fix: make /workspace writable by the non-root `user`
  // (template creates it as root → bun install would EACCES on node_modules).
  await sbx.commands.run(`sudo mkdir -p ${WORKDIR} && sudo chown -R "$(id -un):$(id -gn)" ${WORKDIR}`);
  const files = expoScaffold("Budgeteye");
  for (const [rel, content] of Object.entries(files)) {
    await sbx.files.write(`${WORKDIR}/${rel}`, content);
  }
  console.log(`seeded ${Object.keys(files).length} scaffold files\n`);

  console.log("→ bun install (this is the slow step)…");
  const install = await sbx.commands.run("bun install", { cwd: WORKDIR, timeoutMs: 420_000 });
  console.log(`bun install exit=${install.exitCode}`);
  console.log((install.stdout || install.stderr).trim().split("\n").slice(-6).join("\n"), "\n");

  console.log("→ bunx tsc --noEmit…");
  const tsc = await sbx.commands.run("bunx tsc --noEmit", { cwd: WORKDIR, timeoutMs: 180_000 });
  console.log(`tsc exit=${tsc.exitCode}`);
  const tscOut = (tsc.stdout || tsc.stderr).trim();
  console.log(tscOut ? tscOut.split("\n").slice(0, 20).join("\n") : "(no output — clean)", "\n");

  const ok = install.exitCode === 0 && tsc.exitCode === 0;
  console.log(ok ? "✅ Scaffold installs and type-checks in the real sandbox." : "❌ Build floor failed.");
  process.exit(ok ? 0 : 1);
} finally {
  await sbx.kill().catch(() => {});
}
