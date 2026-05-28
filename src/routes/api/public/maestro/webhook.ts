/**
 * Inbound webhook from Maestro Cloud.
 *
 * Auth model (per-project, set via the studio's AI & Env Keys panel):
 *
 *   Each user picks a random secret string and stores it on their PROJECT as
 *   the env var `MAESTRO_WEBHOOK_TOKEN`. They then paste the same value into
 *   their Maestro Cloud project's webhook settings as the Bearer token.
 *
 *   No global env var lives on the studio host. Projects are isolated — one
 *   user's token can't validate another user's webhook.
 *
 * Correlation:
 *
 *   The Maestro payload carries `envVariables.MOBIVABLE_TEST_RUN_ID` (we
 *   wrote this in the GitHub Actions workflow file at trigger time). That id
 *   resolves to a row in `eas_test_runs`, which points at a project, which
 *   points at the project's stored `MAESTRO_WEBHOOK_TOKEN`. The Bearer
 *   header must match that token in constant time.
 *
 * Idempotency:
 *
 *   This row may have already been finalized by a prior delivery; we only
 *   update when current status is non-terminal. Repeated deliveries get 200
 *   so Maestro stops retrying.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface MaestroFlow {
  id?: string;
  name?: string;
  url?: string;
  status?: string;
  failureReason?: string | null;
  startTime?: string;
  endTime?: string;
}

interface MaestroWebhookPayload {
  id?: string;
  name?: string;
  url?: string;
  platform?: string;
  appId?: string;
  startTime?: string;
  endTime?: string;
  envVariables?: Record<string, string>;
  flows?: MaestroFlow[];
}

/** Reduce per-flow statuses to a single test-run status. */
function deriveOverallStatus(flows: MaestroFlow[]): "passed" | "failed" | "cancelled" {
  if (flows.length === 0) return "failed";
  let allCancelled = true;
  let allPassed = true;
  for (const f of flows) {
    const s = (f.status ?? "").toUpperCase();
    if (s !== "CANCELED" && s !== "CANCELLED") allCancelled = false;
    if (s !== "SUCCESS") allPassed = false;
  }
  if (allCancelled) return "cancelled";
  return allPassed ? "passed" : "failed";
}

function buildLogs(payload: MaestroWebhookPayload): string {
  const flows = payload.flows ?? [];
  const lines: string[] = [];
  lines.push(`📋 Maestro Cloud — upload ${payload.id ?? "(unknown)"}`);
  if (payload.url) lines.push(`🔗 ${payload.url}`);
  if (payload.startTime && payload.endTime) {
    lines.push(`⏱  ${payload.startTime} → ${payload.endTime}`);
  }
  lines.push("");
  lines.push("Flows:");
  for (const f of flows) {
    const status = (f.status ?? "UNKNOWN").toUpperCase();
    const icon = status === "SUCCESS" ? "✅" : status.startsWith("CANCEL") ? "⏸" : "❌";
    lines.push(`  ${icon} [${status}] ${f.name ?? f.id ?? "(unnamed)"}`);
    if (f.failureReason) lines.push(`     ↳ ${f.failureReason}`);
    if (f.url) lines.push(`     ↳ ${f.url}`);
  }
  return lines.join("\n");
}

/**
 * Constant-time string compare. Strict `===` short-circuits on mismatch
 * length and content, leaking timing info that lets an attacker probe the
 * token byte-by-byte. This stays constant-time over equal-length inputs.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/maestro/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ── 1. parse ──
        let payload: MaestroWebhookPayload;
        try {
          payload = (await request.json()) as MaestroWebhookPayload;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const testRunId = payload.envVariables?.MOBIVABLE_TEST_RUN_ID;
        if (!testRunId || !UUID_RE.test(testRunId)) {
          // Webhook is real Maestro but unrelated to a Mobivable-triggered
          // run. Ack so they don't retry.
          return new Response("no mobivable_test_run_id — ignored", { status: 200 });
        }

        // ── 2. locate the row + project ──
        const { data: row, error: rowErr } = await supabaseAdmin
          .from("eas_test_runs")
          .select("id, status, project_id, user_id")
          .eq("id", testRunId)
          .maybeSingle();
        if (rowErr) {
          console.error("[maestro-webhook] lookup failed", rowErr.message);
          return new Response("lookup failed", { status: 500 });
        }
        if (!row) {
          // Forged or stale id. Ack so Maestro stops retrying; log so we can
          // investigate replay attempts.
          console.warn("[maestro-webhook] unknown test run id", testRunId);
          return new Response("unknown test run — ignored", { status: 200 });
        }

        // ── 3. authenticate against the project's stored token ──
        // No global env. The token lives in project_env_vars where the user
        // put it via the AI & Env Keys panel. If they never set it, we
        // can't authenticate any webhook for this project — 401.
        const { data: tokRow } = await supabaseAdmin
          .from("project_env_vars")
          .select("value")
          .eq("project_id", row.project_id)
          .eq("user_id", row.user_id)
          .eq("name", "MAESTRO_WEBHOOK_TOKEN")
          .maybeSingle();
        const expected = typeof tokRow?.value === "string" ? tokRow.value.trim() : "";
        if (!expected) {
          console.warn(
            "[maestro-webhook] project has no MAESTRO_WEBHOOK_TOKEN configured",
            { projectId: row.project_id, testRunId },
          );
          return new Response("project has no webhook token configured", {
            status: 401,
          });
        }
        const auth = request.headers.get("authorization") ?? "";
        const match = auth.match(/^Bearer\s+(.+)$/i);
        if (!match || !timingSafeEqual(match[1].trim(), expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // ── 4. idempotency: don't downgrade a terminal status ──
        const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
        if (TERMINAL.has(row.status)) {
          return new Response("already finalized", { status: 200 });
        }

        // ── 5. update ──
        const overall = deriveOverallStatus(payload.flows ?? []);
        const logs = buildLogs(payload);
        // Maestro's webhook body doesn't include screenshot URLs — flow
        // dashboard links are per-flow. Future: fetch per-flow screenshots
        // server-side using a Maestro API key the user stores alongside.
        const screenshots: string[] = [];

        const { error: updErr } = await supabaseAdmin
          .from("eas_test_runs")
          .update({
            status: overall,
            maestro_upload_id: payload.id ?? null,
            logs,
            screenshots,
            finished_at: payload.endTime ?? new Date().toISOString(),
            error_text:
              overall === "passed"
                ? null
                : (payload.flows ?? [])
                    .map((f) => f.failureReason)
                    .filter(Boolean)
                    .join("\n") || null,
          })
          .eq("id", testRunId);
        if (updErr) {
          console.error("[maestro-webhook] update failed", updErr.message);
          return new Response("update failed", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
