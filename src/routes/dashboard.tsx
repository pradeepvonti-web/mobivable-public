import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import {
  openCustomerPortal,
  changeSubscriptionPlan,
  syncSubscriptionFromStripe,
} from "@/utils/payments.functions";
import { AppPromptComposer } from "@/components/AppPromptComposer";
import TemplateGallery from "@/components/TemplateGallery";
import {
  Smartphone, Zap, MessageSquare, BarChart3, Search, Filter,
  MoreHorizontal, Trash2, Copy, Star, StarOff, Sparkles,
  ShoppingCart, Users, Dumbbell, UtensilsCrossed, Briefcase, Palette,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

type Sub = {
  status: string;
  price_id: string;
  product_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  environment: string;
};

type Plan = "free_beta" | "starter" | "pro" | "scale" | "business";
type Profile = { display_name: string | null; plan: Plan };

type ProjectRow = {
  id: string;
  name: string;
  prompt: string;
  status: string;
  model: string;
  updated_at: string;
};

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — Mobivable" },
      { name: "description", content: "Manage your Mobivable subscription and account." },
    ],
  }),
});

const PRICE_LABEL: Record<string, string> = {
  starter_monthly: "Starter · Monthly",
  starter_yearly: "Starter · Yearly",
  pro_monthly: "Pro · Monthly",
  pro_yearly: "Pro · Yearly",
  scale_monthly: "Scale · Monthly",
  scale_yearly: "Scale · Yearly",
  business_monthly: "Business · Monthly",
  business_yearly: "Business · Yearly",
};

const PLAN_QUOTA: Record<Plan, string> = {
  free_beta: "1 published app",
  starter: "5 published apps",
  pro: "Unlimited published apps",
  scale: "Unlimited apps · 3 team seats",
  business: "Unlimited apps · unlimited seats",
};

const PLAN_NAME: Record<Plan, string> = {
  free_beta: "Free Beta",
  starter: "Starter",
  pro: "Pro",
  scale: "Scale",
  business: "Business",
};

function DashboardPage() {
  const { session, status } = useRequiredSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "building" | "ready" | "error">("all");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("fav-projects") ?? "[]")); } catch { return new Set(); }
  });
  const [syncNotice, setSyncNotice] = useState<{
    updated: boolean;
    error?: string;
    syncedAt: string;
    message: string;
    lastRetryAt?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem("dashboard-sync-notice");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    try {
      if (syncNotice) localStorage.setItem("dashboard-sync-notice", JSON.stringify(syncNotice));
      else localStorage.removeItem("dashboard-sync-notice");
    } catch { /* ignore */ }
  }, [syncNotice]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const navigate = useNavigate();

  const subRef = useRef<Sub | null>(sub);
  subRef.current = sub;

  const portal = useServerFn(openCustomerPortal);
  const changePlan = useServerFn(changeSubscriptionPlan);
  const syncSub = useServerFn(syncSubscriptionFromStripe);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
  }, [status]);

  const doPortalSync = async () => {
    const before = subRef.current;
    try {
      const result = await syncSub({ data: { environment: getStripeEnvironment() } });
      await load();
      router.invalidate();
      if (result.ok && result.sub) {
        const changed =
          !before ||
          before.status !== result.sub.status ||
          before.price_id !== result.sub.price_id ||
          before.cancel_at_period_end !== result.sub.cancel_at_period_end;
        setSyncNotice({
          updated: changed,
          error: undefined,
          syncedAt: result.syncedAt,
          message: changed
            ? `Updated to ${PRICE_LABEL[result.sub.price_id] ?? result.sub.price_id} · ${result.sub.status}`
            : "No subscription changes found",
        });
        setTimeout(() => setSyncNotice(null), 8000);
      } else if (!result.ok) {
        setSyncNotice({
          updated: false,
          error: result.reason ?? "Sync failed",
          syncedAt: new Date().toISOString(),
          message: result.reason ?? "We couldn't sync your subscription from Stripe.",
        });
      }
    } catch (e) {
      setSyncNotice({
        updated: false,
        error: e instanceof Error ? e.message : "Unknown error",
        syncedAt: new Date().toISOString(),
        message: e instanceof Error ? e.message : "Sync failed unexpectedly.",
      });
    }
  };
  const doPortalSyncRef = useRef(doPortalSync);
  doPortalSyncRef.current = doPortalSync;

  // When the user returns from the Stripe Customer Portal (opened in a new
  // tab), pull the latest subscription state from Stripe and refresh the
  // dashboard. Triggered on tab focus + visibility, and on mount if the URL
  // carries ?portal=return (set when we open the portal tab).
  useEffect(() => {
    if (status !== "authenticated") return;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        await doPortalSyncRef.current();
      } finally {
        pending = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionStorage.getItem("portal-opened") === "1") {
        sessionStorage.removeItem("portal-opened");
        void refresh();
      }
    };
    window.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const url = new URL(window.location.href);
    if (url.searchParams.get("portal") === "return") {
      url.searchParams.delete("portal");
      window.history.replaceState({}, "", url.toString());
      void refresh();
    }
    return () => {
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [status]);

  async function load() {
    if (!session?.user) return;
    const env = getStripeEnvironment();
    const [{ data: prof }, { data: subRow }, { data: projRows }] = await Promise.all([
      supabase.from("profiles").select("display_name, plan").eq("id", session.user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select("status, price_id, product_id, current_period_end, cancel_at_period_end, environment")
        .eq("user_id", session.user.id)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("projects")
        .select("id, name, prompt, status, model, updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false }),
    ]);
    setProfile(prof as Profile | null);
    setSub(subRow as Sub | null);
    setProjects((projRows as ProjectRow[] | null) ?? []);
    setLoading(false);
  }

  if (status !== "authenticated") {
    return <AuthHydrating />;
  }

  async function handleManage() {
    setBusy("portal");
    setError(null);
    try {
      const result = await portal({
        data: {
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}/dashboard?portal=return`,
        },
      });
      if ("error" in result) throw new Error(result.error);
      sessionStorage.setItem("portal-opened", "1");
      window.open(result.url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open portal");
    } finally {
      setBusy(null);
    }
  }

  async function handleChange(targetPriceId: string) {
    setBusy(targetPriceId);
    setError(null);
    try {
      await changePlan({
        data: {
          targetPriceId: targetPriceId as any,
          environment: getStripeEnvironment(),
        },
      });
      await load();
      router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change plan");
    } finally {
      setBusy(null);
    }
  }

  const isPastDue = sub?.status === "past_due";
  const isCanceled = sub?.status === "canceled" || sub?.cancel_at_period_end;
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : null;

  const toggleFav = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem("fav-projects", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const duplicateProject = async (p: ProjectRow) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase.from("projects").insert({
      user_id: u.user.id, name: `${p.name} (copy)`, prompt: p.prompt, model: p.model, status: "draft",
    }).select("id").single();
    if (error?.message.includes("APP_QUOTA_EXCEEDED")) {
      toast.error("You've hit your plan's app limit. Upgrade to create more.");
      return;
    }
    if (data) { toast.success("Project duplicated!"); void load(); }
  };

  const deleteProject = async (id: string) => {
    await supabase.from("projects").delete().eq("id", id);
    setProjects(prev => prev.filter(p => p.id !== id));
    toast("Project deleted");
  };

  const filteredProjects = projects
    .filter(p => statusFilter === "all" || p.status === statusFilter)
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()) || p.prompt.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aFav = favorites.has(a.id) ? 1 : 0;
      const bFav = favorites.has(b.id) ? 1 : 0;
      return bFav - aFav;
    });

  const statusCounts = {
    all: projects.length,
    building: projects.filter(p => p.status === "building").length,
    ready: projects.filter(p => p.status === "ready" || p.status === "done").length,
    error: projects.filter(p => p.status === "error").length,
  };

  const planQuotaNum = profile?.plan === "pro" ? Infinity : profile?.plan === "starter" ? 5 : 1;
  const publishedCount = projects.filter(p => p.status === "ready" || p.status === "done").length;

  const tierOptions: { id: string; label: string }[] = [
    { id: "starter_monthly", label: "Starter · Monthly · $29" },
    { id: "starter_yearly", label: "Starter · Yearly · $276" },
    { id: "pro_monthly", label: "Pro · Monthly · $59" },
    { id: "pro_yearly", label: "Pro · Yearly · $564" },
    { id: "scale_monthly", label: "Scale · Monthly · $119" },
    { id: "scale_yearly", label: "Scale · Yearly · $1,140" },
    { id: "business_monthly", label: "Business · Monthly · $299" },
    { id: "business_yearly", label: "Business · Yearly · $2,868" },
  ].filter((o) => o.id !== sub?.price_id);

  return (
    <PageShell
      eyebrow="ACCOUNT"
      title={profile?.display_name ? `Hello, ${profile.display_name}` : "Your Dashboard"}
      intro="Manage your subscription, change plans, and update billing."
    >
      <div className="space-y-12 max-w-4xl mx-auto">
        <AppPromptComposer />

        {/* ─── Agent CTA ─── */}
        <Link
          // Cast: routeTree.gen.ts isn't aware of /agent.tsx until the
          // Vite plugin regenerates it on dev/build pickup.
          to={"/agent" as never}
          className="group block border border-border p-5 hover:border-primary transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-display text-base">Open the Agent</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Chat across all your projects · powered by your MCP tools
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground group-hover:text-primary transition-colors">
              /agent →
            </span>
          </div>
        </Link>

        {/* ─── Quick Stats Bar ─── */}
        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Smartphone, label: "Total Apps", value: projects.length, color: "text-primary" },
              { icon: Zap, label: "Building", value: statusCounts.building, color: "text-amber-500" },
              { icon: BarChart3, label: "Published", value: publishedCount, color: "text-emerald-500" },
              { icon: MessageSquare, label: "Plan Usage", value: planQuotaNum === Infinity ? "∞" : `${publishedCount}/${planQuotaNum}`, color: "text-violet-500" },
            ].map(s => (
              <div key={s.label} className="border border-border p-5 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-lg bg-foreground/5 grid place-items-center ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-display text-2xl">{s.value}</p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Your Apps with Search & Filter ─── */}
        <section className="border border-border p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Your apps · {filteredProjects.length} of {projects.length}
            </p>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-2 border border-border px-3 py-2 flex-1 sm:flex-initial sm:w-52">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search apps..." className="bg-transparent text-xs outline-none w-full" />
              </div>
              <div className="flex border border-border">
                {(["all", "building", "ready", "error"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setStatusFilter(f)}
                    className={`px-3 py-2 text-[9px] font-mono uppercase tracking-widest transition-colors ${statusFilter === f ? "bg-primary text-background" : "text-muted-foreground hover:text-foreground"}`}>
                    {f}{statusCounts[f] > 0 ? ` (${statusCounts[f]})` : ""}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">[···] Loading</p>
          ) : filteredProjects.length === 0 && projects.length === 0 ? (
            /* ─── Empty State ─── */
            <div className="text-center py-12">
              <div className="text-5xl mb-4">📱</div>
              <h3 className="font-display text-2xl uppercase tracking-tight mb-2">No apps yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">Describe your app idea above, or start from a template below to get building in seconds.</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No apps match your search.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {filteredProjects.map(p => {
                const isFav = favorites.has(p.id);
                const statusColors: Record<string, string> = { building: "bg-amber-500/15 text-amber-500", ready: "bg-emerald-500/15 text-emerald-500", done: "bg-emerald-500/15 text-emerald-500", error: "bg-red-500/15 text-red-500", draft: "bg-muted text-muted-foreground" };
                const sc = statusColors[p.status] ?? statusColors.draft;
                return (
                  <div key={p.id} className="relative border border-border hover:border-primary transition-colors group">
                    <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                            <Smartphone className="h-4 w-4 text-primary" />
                          </div>
                          <h3 className="font-display text-lg uppercase tracking-tight group-hover:text-primary truncate">{p.name || "Untitled"}</h3>
                        </div>
                        <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${sc}`}>{p.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">{p.prompt}</p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {new Date(p.updated_at).toLocaleDateString()} · {p.model}
                      </p>
                    </Link>
                    {/* Action buttons */}
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={e => { e.preventDefault(); toggleFav(p.id); }} className="h-7 w-7 grid place-items-center rounded hover:bg-primary/10" title={isFav ? "Unpin" : "Pin"}>
                        {isFav ? <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                      <div className="relative">
                        <button type="button" onClick={e => { e.preventDefault(); setOpenMenu(openMenu === p.id ? null : p.id); }} className="h-7 w-7 grid place-items-center rounded hover:bg-primary/10">
                          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        {openMenu === p.id && (
                          <div className="absolute right-0 top-8 w-36 rounded-lg border border-border bg-card shadow-lg z-20 overflow-hidden">
                            <button type="button" onClick={e => { e.preventDefault(); void duplicateProject(p); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-primary/10"><Copy className="h-3 w-3" /> Duplicate</button>
                            <button type="button" onClick={e => { e.preventDefault(); void deleteProject(p.id); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /> Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── App Templates ─── */}
        {!loading && projects.length < 3 && (
          <section className="border border-border p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Quick Start</p>
                <h3 className="font-display text-xl uppercase tracking-tight">Start from a Template</h3>
              </div>
              <button
                type="button"
                onClick={() => setGalleryOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 text-primary font-display text-xs uppercase tracking-wider hover:bg-primary/10 transition-colors"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Browse All Templates
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { icon: ShoppingCart, label: "E-Commerce", prompt: "Build a modern e-commerce app with product catalog, cart, checkout, user accounts, and order tracking. Use a clean minimal design with a dark theme.", color: "text-emerald-500" },
                { icon: Users, label: "Social Network", prompt: "Create a social networking app with user profiles, a news feed, post creation with images, likes, comments, and direct messaging. Modern design with blue accents.", color: "text-blue-500" },
                { icon: Dumbbell, label: "Fitness Tracker", prompt: "Build a fitness tracker app with workout logging, progress charts, calorie counting, exercise library, and weekly goal tracking. Athletic design with green accents.", color: "text-lime-500" },
                { icon: UtensilsCrossed, label: "Food Delivery", prompt: "Create a food delivery app with restaurant browsing, menu viewing, cart management, order tracking with map, and payment. Warm colors with orange accents.", color: "text-orange-500" },
                { icon: Briefcase, label: "Task Manager", prompt: "Build a project task manager app with kanban boards, task creation, due dates, labels, team assignments, and progress tracking. Professional design with violet theme.", color: "text-violet-500" },
                { icon: Palette, label: "Portfolio", prompt: "Create a creative portfolio app to showcase design work, photography, and projects. With galleries, about section, contact form, and client testimonials. Minimal dark theme.", color: "text-pink-500" },
              ].map(t => (
                <button key={t.label} type="button"
                  onClick={() => { const el = document.querySelector("textarea"); if (el) { (el as HTMLTextAreaElement).value = t.prompt; el.dispatchEvent(new Event("input", { bubbles: true })); } }}
                  className="border border-border p-5 text-left hover:border-primary transition-colors group">
                  <t.icon className={`h-5 w-5 ${t.color} mb-3`} />
                  <p className="font-display text-sm uppercase tracking-tight group-hover:text-primary">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{t.prompt.slice(0, 60)}...</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {isPastDue && (
          <div className="border border-destructive/50 bg-destructive/10 p-5">
            <p className="font-display text-sm uppercase tracking-wider text-destructive mb-2">
              Payment failed
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              We couldn't process your latest payment. Your access stays on while we retry, but
              please update your payment method to avoid losing it.
            </p>
            <button
              type="button"
              onClick={handleManage}
              disabled={busy === "portal"}
              className="px-4 py-2 bg-destructive text-background font-display text-xs uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
            >
              {busy === "portal" ? "Opening…" : "Update payment method"}
            </button>
          </div>
        )}

        {isCanceled && periodEnd && (
          <div className="border border-yellow-500/40 bg-yellow-500/10 p-5">
            <p className="font-display text-sm uppercase tracking-wider text-yellow-600 mb-2">
              Subscription canceled
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              You keep your current plan benefits until <span className="text-foreground">{periodEnd}</span>.
              After that you'll be moved to Free Beta.
            </p>
            <button
              type="button"
              onClick={handleManage}
              disabled={busy === "portal"}
              className="px-4 py-2 border border-yellow-500/50 text-foreground font-display text-xs uppercase tracking-wider hover:bg-yellow-500/10 transition-all disabled:opacity-50"
            >
              {busy === "portal" ? "Opening…" : "Manage subscription"}
            </button>
          </div>
        )}

        {loading ? (
          <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
            [···] Loading
          </p>
        ) : (
          <>
            {syncNotice && (
              <div className={`border p-5 ${
                syncNotice.error
                  ? "border-destructive/40 bg-destructive/10"
                  : syncNotice.updated
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-border bg-muted/30"
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className={`font-display text-sm uppercase tracking-wider mb-1 ${
                      syncNotice.error
                        ? "text-destructive"
                        : syncNotice.updated
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }`}>
                      {syncNotice.error ? "Sync failed" : syncNotice.updated ? "Subscription synced" : "Already up to date"}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {syncNotice.message}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                      Last synced · {new Date(syncNotice.syncedAt).toLocaleTimeString()}
                    </p>
                    {syncNotice.error && (
                      <button
                        type="button"
                        onClick={() => { setSyncNotice(null); void doPortalSync(); }}
                        className="mt-3 px-4 py-2 bg-primary text-background font-display text-xs uppercase tracking-wider hover:invert transition-all"
                      >
                        Retry sync
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSyncNotice(null)}
                    className="text-muted-foreground hover:text-foreground text-xs shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <section className="border border-border p-8">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Current plan
              </p>
              <h2 className="font-display text-4xl uppercase tracking-tight mb-2">
                {PLAN_NAME[profile?.plan ?? "free_beta"]}
              </h2>
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-6">
                {PLAN_QUOTA[profile?.plan ?? "free_beta"]}
              </p>

              {sub && (
                <div className="space-y-2 font-mono text-xs uppercase tracking-wider text-muted-foreground border-t border-border pt-4">
                  <div>Subscription · {PRICE_LABEL[sub.price_id] ?? sub.price_id}</div>
                  <div>Status · {sub.status}</div>
                  {periodEnd && (
                    <div>
                      {isCanceled ? "Access until" : "Renews on"} · {periodEnd}
                    </div>
                  )}
                </div>
              )}
            </section>

            {sub && !isCanceled && (
              <section className="border border-border p-8">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Change plan
                </p>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  Upgrades apply immediately with prorated billing. Downgrades take effect at your
                  next renewal so you keep what you've paid for.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {tierOptions.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={busy === o.id}
                      onClick={() => handleChange(o.id)}
                      className="px-4 py-3 border border-border font-display text-xs uppercase tracking-wider text-left hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {busy === o.id ? "Updating…" : o.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {sub && (
              <section className="border border-border p-8">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Billing
                </p>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  Manage your payment method, download invoices, or cancel your subscription
                  through our payment portal.
                </p>
                <button
                  type="button"
                  onClick={handleManage}
                  disabled={busy === "portal"}
                  className="px-5 py-3 bg-primary text-background font-display text-xs uppercase tracking-wider hover:invert transition-all disabled:opacity-50"
                >
                  {busy === "portal" ? "Opening…" : "Manage billing"}
                </button>
              </section>
            )}

            {!sub && (
              <section className="border border-border p-8">
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                  You're on the Free Beta plan. Upgrade for more published apps, custom domains,
                  and priority compile queue.
                </p>
                <Link
                  to="/pricing"
                  className="inline-block px-5 py-3 bg-primary text-background font-display text-xs uppercase tracking-wider hover:invert transition-all"
                >
                  View plans
                </Link>
              </section>
            )}

            {error && (
              <div className="border border-destructive/40 bg-destructive/10 text-destructive text-sm p-3 font-mono">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Template Gallery Modal */}
      {galleryOpen && (
        <TemplateGallery
          onSelect={(projectId: string) => {
            setGalleryOpen(false);
            navigate({ to: "/projects/$projectId", params: { projectId } });
          }}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </PageShell>
  );
}
