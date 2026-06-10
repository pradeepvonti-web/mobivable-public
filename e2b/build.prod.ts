/**
 * Build & publish the Mobivable Expo sandbox template ("mobivable-expo").
 *
 * Run from this folder:   npx tsx build.prod.ts
 *
 * Auth: reads E2B_ACCESS_TOKEN from the project's .env.local (or .env), so you
 * don't have to export it in the shell. Alternatively run `e2b auth login` once.
 *
 * After it publishes, set E2B_TEMPLATE=mobivable-expo on the server that runs
 * the ws_* tools (and as a Cloudflare Worker secret for production).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template";

// ── Load env from the project root (.env.local wins), without dotenv ──
const here = dirname(fileURLToPath(import.meta.url));
for (const rel of ["../.env.local", "../.env"]) {
  try {
    for (const line of readFileSync(join(here, rel), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* file may not exist — fine */
  }
}

const TEMPLATE_NAME = "mobivable-expo";

async function main() {
  if (!process.env.E2B_ACCESS_TOKEN) {
    console.warn(
      "⚠️  E2B_ACCESS_TOKEN not found in env or .env.local. If the build fails to\n" +
        "    authenticate, run `e2b auth login` first (or export E2B_ACCESS_TOKEN).",
    );
  }
  console.log(`→ Building & publishing E2B template "${TEMPLATE_NAME}" (cpu 2 / mem 2048)…\n`);
  // If this fails with a plan-limit error, drop cpuCount/memoryMB (e.g. 1 / 1024).
  await Template.build(template, TEMPLATE_NAME, {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(
    `\n✅ Published "${TEMPLATE_NAME}".\n` +
      `   Next: set E2B_TEMPLATE=${TEMPLATE_NAME} (locally in .env.local + as a\n` +
      `   Cloudflare Worker secret for prod), then restart the server.`,
  );
}

main().catch((e) => {
  console.error("\n❌ Template build failed:", e?.message || e);
  process.exit(1);
});
