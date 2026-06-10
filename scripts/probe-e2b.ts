/**
 * End-to-end smoke test for the agent build runtime.
 *
 * Loads local env (.env + .env.local), then runs the REAL probeWorkspaceRuntime()
 * — the same code path as the `ws_diagnose` MCP tool — which boots a live E2B
 * sandbox from the configured template and verifies create / file write+read /
 * command run / bun present / getHost.
 *
 * Run:  npx tsx scripts/probe-e2b.ts
 * Exit: 0 if every step passed, 1 otherwise.
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

loadEnv(".env");
loadEnv(".env.local");

console.log("E2B_API_KEY set:   ", Boolean(process.env.E2B_API_KEY));
console.log("E2B_TEMPLATE:      ", process.env.E2B_TEMPLATE ?? "(default image)");
console.log("Booting a real E2B sandbox — this can take ~10–30s…\n");

const { probeWorkspaceRuntime } = await import("../src/lib/agent-workspace.server");
const res = await probeWorkspaceRuntime();

for (const s of res.steps) {
  console.log(`${s.ok ? "✅" : "❌"} ${s.name.padEnd(14)} ${s.detail ?? ""}`);
}
console.log("\n" + JSON.stringify({ ok: res.ok, sandboxId: res.sandboxId, host: res.host, error: res.error }, null, 2));

process.exit(res.ok ? 0 : 1);
