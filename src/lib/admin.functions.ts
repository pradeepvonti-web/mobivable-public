import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getProviderStatuses, getActiveProviderName } from "./ai-provider";
import { createClient } from "@supabase/supabase-js";

/** Claim admin role — only works if zero admins exist (first-time setup). */
export const claimInitialAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Check if any admin already exists
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: false as const, error: "An admin already exists." };
    }
    // Try service-role client first (bypasses RLS)
    try {
      const svcUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (svcUrl && svcKey) {
        const svc = createClient(svcUrl, svcKey, { auth: { persistSession: false } });
        const { error } = await svc.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (!error) return { ok: true as const };
      }
    } catch { /* continue to fallback */ }
    // Fallback: try user's client (may work if RLS allows self-insert)
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (error) {
      return {
        ok: false as const,
        error: `RLS blocked insert. Add SUPABASE_SERVICE_ROLE_KEY to your .env file (find it in Supabase → Settings → API → service_role key), then restart the server and try again.`,
      };
    }
    return { ok: true as const };
  });

/** Server-side admin gate for /admin routes.
 *  Returns whether the caller is an admin and whether any admin exists yet
 *  (used to show the first-time claim button). Throws 401 if not signed in. */
export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const svcUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    // Prefer service-role client so we get a definitive answer regardless of RLS.
    const client = svcUrl && svcKey
      ? createClient(svcUrl, svcKey, { auth: { persistSession: false } })
      : supabase;

    const [{ data: mine }, { data: any }] = await Promise.all([
      client.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      client.from("user_roles").select("id").eq("role", "admin").limit(1),
    ]);
    return {
      isAdmin: !!mine,
      hasAnyAdmin: (any?.length ?? 0) > 0,
    };
  });

/** Check if user has admin role */
async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

// ─── Admin Login Audit ──────────────────────────────────────────
function svcClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Log an admin authentication attempt. Public (called from the login form).
 *  Only persists a row when the email belongs to an admin user, so the audit
 *  table can't be flooded with random failed logins from non-admin emails. */
export const logAdminLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; success: boolean; reason?: string }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!email || email.length > 320) throw new Error("Invalid email");
    const reason = input?.reason ? String(input.reason).slice(0, 200) : null;
    return { email, success: !!input?.success, reason };
  })
  .handler(async ({ data }) => {
    const svc = svcClient();
    if (!svc) return { ok: false as const, reason: "service_role_unavailable" };

    // Resolve user_id by email (may be null if no such account).
    let userId: string | null = null;
    try {
      const { data: u } = await svc.rpc("get_user_id_by_email", { p_email: data.email });
      if (typeof u === "string") userId = u;
    } catch { /* ignore */ }

    // Only audit attempts targeting an admin account.
    if (!userId) return { ok: true as const, logged: false };
    const { data: roleRow } = await svc
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return { ok: true as const, logged: false };

    // Best-effort request metadata.
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      userAgent = (getRequestHeader("user-agent") || "").slice(0, 500) || null;
      ip =
        (getRequestHeader("x-forwarded-for") || getRequestHeader("cf-connecting-ip") || "")
          .split(",")[0]
          .trim()
          .slice(0, 64) || null;
    } catch { /* not available */ }

    await svc.from("admin_login_audit").insert({
      user_id: userId,
      email: data.email,
      success: data.success,
      reason: data.reason,
      ip,
      user_agent: userAgent,
    });
    return { ok: true as const, logged: true };
  });

/** Fetch recent admin login attempts (admin-only). */
export const getAdminLoginAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const svc = svcClient() ?? supabase;
    const { data, error } = await svc
      .from("admin_login_audit")
      .select("id, user_id, email, success, reason, ip, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return {
      entries: (data ?? []) as Array<{
        id: string;
        user_id: string | null;
        email: string;
        success: boolean;
        reason: string | null;
        ip: string | null;
        user_agent: string | null;
        created_at: string;
      }>,
    };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Count users
    const { count: userCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // Count projects
    const { count: projectCount } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true });

    // Count projects by status
    const { data: statusData } = await supabase
      .from("projects")
      .select("status");
    const statusCounts: Record<string, number> = {};
    for (const row of statusData ?? []) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    }

    // Count messages
    const { count: messageCount } = await supabase
      .from("project_messages")
      .select("id", { count: "exact", head: true });

    // AI provider status
    const providers = getProviderStatuses();
    const activeProvider = getActiveProviderName();

    // Recent projects (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: recentProjects } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    // Recent users (last 7 days)
    const { count: recentUsers } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    return {
      userCount: userCount ?? 0,
      projectCount: projectCount ?? 0,
      messageCount: messageCount ?? 0,
      statusCounts,
      recentProjects: recentProjects ?? 0,
      recentUsers: recentUsers ?? 0,
      providers,
      activeProvider,
    };
  });

// ─── User Management ────────────────────────────────────────────
export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, plan, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100);

    // Get roles for each user
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const roleMap: Record<string, string[]> = {};
    for (const r of roles ?? []) {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    }

    // Get project counts per user
    const { data: projectUsers } = await supabase
      .from("projects")
      .select("user_id");
    const projectCounts: Record<string, number> = {};
    for (const p of projectUsers ?? []) {
      projectCounts[p.user_id] = (projectCounts[p.user_id] ?? 0) + 1;
    }

    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: roleMap[p.id] ?? [],
      projectCount: projectCounts[p.id] ?? 0,
    }));
  });

// ─── Project Management ─────────────────────────────────────────
export const getAdminProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data } = await supabase
      .from("projects")
      .select("id, name, prompt, status, model, created_at, updated_at, user_id, error_text")
      .order("created_at", { ascending: false })
      .limit(100);

    return data ?? [];
  });

// ─── Toggle User Role ───────────────────────────────────────────
export const toggleUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { targetUserId, role, grant } = data;

    if (grant) {
      await supabase.from("user_roles").insert({ user_id: targetUserId, role });
    } else {
      await supabase.from("user_roles").delete().eq("user_id", targetUserId).eq("role", role);
    }

    return { ok: true };
  });

// ─── Delete Project ─────────────────────────────────────────────
export const adminDeleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Delete messages first (FK)
    await supabase.from("project_messages").delete().eq("project_id", data.projectId);
    // Delete the project
    await supabase.from("projects").delete().eq("id", data.projectId);

    return { ok: true };
  });

// ─── Update User Plan ──────────────────────────────────────────
export const adminUpdatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }: any) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    await supabase
      .from("profiles")
      .update({ plan: data.plan })
      .eq("id", data.targetUserId);

    return { ok: true };
  });

// ─── Feature Flags (DB-backed in app_settings) ──────────────────
const FLAG_DEFAULTS = {
  aiEnabled: true,
  exportEnabled: true,
  screenshotsEnabled: true,
  agentWorkspaceEnabled: true,
  backendEnabled: true,
  signupEnabled: true,
  paymentsEnabled: true,
  maxProjectsPerUser: 50,
  maxMessagesPerProject: 500,
};

export const getFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "feature_flags")
      .maybeSingle();

    const stored = (data?.value as Record<string, any>) ?? {};
    const aiConfigured = !!(process.env.LOVABLE_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
    return {
      ...FLAG_DEFAULTS,
      ...stored,
      aiEnabled: aiConfigured && (stored.aiEnabled ?? true),
    };
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; value: any }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "feature_flags")
      .maybeSingle();
    const current = (existing?.value as Record<string, any>) ?? {};
    const next = { ...current, [data.key]: data.value };

    await supabase.from("app_settings").upsert(
      { key: "feature_flags", value: next, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    return { ok: true };
  });

// ─── Payments / Subscriptions ───────────────────────────────────
export const getAdminPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id, status, current_period_end, cancel_at_period_end, environment, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = subs ?? [];
    const now = Date.now();
    const isActive = (s: any) =>
      (["active", "trialing", "past_due"].includes(s.status) &&
        (!s.current_period_end || new Date(s.current_period_end).getTime() > now)) ||
      (s.status === "canceled" && s.current_period_end && new Date(s.current_period_end).getTime() > now);

    const active = rows.filter(isActive);
    const live = rows.filter((s: any) => s.environment === "live");
    const sandbox = rows.filter((s: any) => s.environment === "sandbox");
    const canceled = rows.filter((s: any) => s.status === "canceled");

    const byPlan: Record<string, number> = {};
    for (const s of active) byPlan[s.price_id] = (byPlan[s.price_id] ?? 0) + 1;

    // Plan distribution from profiles
    const { data: planRows } = await supabase.from("profiles").select("plan");
    const planCounts: Record<string, number> = {};
    for (const p of planRows ?? []) planCounts[p.plan] = (planCounts[p.plan] ?? 0) + 1;

    return {
      total: rows.length,
      activeCount: active.length,
      liveCount: live.length,
      sandboxCount: sandbox.length,
      canceledCount: canceled.length,
      byPlan,
      planCounts,
      subscriptions: rows,
    };
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscriptionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await supabase
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("id", data.subscriptionId);
    return { ok: true };
  });
