/**
 * Startup probe for email queue runtime dependencies.
 *
 * The email queue route (src/routes/lovable/email/queue/process.ts) and the
 * transactional/auth email server routes import several npm packages. If any
 * are missing, Vite throws a cryptic "Cannot find module" deep inside a
 * request handler and the preview goes blank.
 *
 * This module imports each required package at server startup and logs the
 * result — so a quick glance at the server logs tells you exactly which
 * dependency is missing.
 */

const REQUIRED_EMAIL_PACKAGES = [
  "@lovable.dev/email-js",
  "@lovable.dev/webhooks-js",
  "@react-email/components",
  "@supabase/supabase-js",
] as const;

type ProbeResult = { pkg: string; ok: boolean; error?: string };

let checkPromise: Promise<ProbeResult[]> | null = null;

export function assertEmailDepsInstalled(): Promise<ProbeResult[]> {
  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    const results: ProbeResult[] = [];
    console.log("[email-deps] Probing email queue module imports...");

    for (const pkg of REQUIRED_EMAIL_PACKAGES) {
      try {
        await import(/* @vite-ignore */ pkg);
        console.log(`[email-deps] ✓ ${pkg}`);
        results.push({ pkg, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[email-deps] ✗ ${pkg} — ${message}`);
        results.push({ pkg, ok: false, error: message });
      }
    }

    const missing = results.filter((r) => !r.ok);
    if (missing.length > 0) {
      const list = missing.map((r) => `  - ${r.pkg}: ${r.error}`).join("\n");
      const installCmd = `bun add ${missing.map((r) => r.pkg).join(" ")}`;
      console.error(
        `\n[email-deps] ${missing.length} email package(s) failed to import:\n${list}\n\n` +
          `Fix:\n  ${installCmd}\n\n` +
          `Then restart the dev server (it should auto-restart when package.json changes).\n`,
      );
    } else {
      console.log(`[email-deps] All ${results.length} email packages loaded successfully.`);
    }

    return results;
  })();

  return checkPromise;
}

// Fire at module load so the probe runs once at server startup.
// Skip on the client — these are Node packages that cannot be resolved in the
// browser, and the probe would otherwise spam the console on every page load.
if (typeof window === "undefined") {
  void assertEmailDepsInstalled().catch((err) => {
    console.error("[email-deps] Probe crashed:", err);
  });
}
