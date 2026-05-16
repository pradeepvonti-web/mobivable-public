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

// ─── Dashboard Stats ────────────────────────────────────────────
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

// ─── Get Feature Flags ──────────────────────────────────────────
export const getFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Read from env vars (simple feature flag system)
    return {
      aiEnabled: !!(process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY),
      exportEnabled: true,
      screenshotsEnabled: true,
      agentWorkspaceEnabled: true,
      backendEnabled: true,
      signupEnabled: true,
      maxProjectsPerUser: parseInt(process.env.MAX_PROJECTS_PER_USER ?? "50", 10),
      maxMessagesPerProject: parseInt(process.env.MAX_MESSAGES_PER_PROJECT ?? "500", 10),
    };
  });
