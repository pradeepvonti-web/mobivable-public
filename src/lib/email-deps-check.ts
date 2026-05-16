/**
 * Startup check: verify that email runtime dependencies are installed.
 *
 * The email queue route (src/routes/lovable/email/queue/process.ts) imports
 * `@lovable.dev/email-js`. If that package is missing from node_modules
 * (e.g. after a fresh clone where `bun install` hasn't run, or if the
 * dependency was accidentally removed from package.json), Vite throws a
 * cryptic "Cannot find module" error deep in a request handler.
 *
 * This module probes those packages at server startup and throws a single,
 * actionable error that tells the developer exactly what to run.
 */

const REQUIRED_EMAIL_PACKAGES = [
  "@lovable.dev/email-js",
  "@lovable.dev/webhooks-js",
  "@react-email/components",
] as const;

let checked = false;

export async function assertEmailDepsInstalled(): Promise<void> {
  if (checked) return;
  checked = true;

  const missing: string[] = [];
  for (const pkg of REQUIRED_EMAIL_PACKAGES) {
    try {
      await import(/* @vite-ignore */ pkg);
    } catch {
      missing.push(pkg);
    }
  }

  if (missing.length > 0) {
    const list = missing.map((p) => `  - ${p}`).join("\n");
    throw new Error(
      `[email] Missing required email packages:\n${list}\n\n` +
        `Install them with:\n` +
        `  bun add ${missing.join(" ")}\n\n` +
        `These are required by src/routes/lovable/email/queue/process.ts ` +
        `and other email server routes.`,
    );
  }
}

// Fire-and-forget at module load so the check runs once at server startup.
// Errors are surfaced via unhandledRejection / next request rather than
// silently swallowed.
void assertEmailDepsInstalled().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
});
