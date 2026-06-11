import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { MobileAppSchema } from "./mobile-app-schema";
import { SAMPLE_FITTRACK, SAMPLE_SHOPLUX, SAMPLE_WEALTHFLOW } from "./sample-apps";
import { MOBILE_THEMES } from "./mobile-theme";
import { TEMPLATE_THEME_VARIANTS } from "./template-taxonomy";

/**
 * Prefer supabaseAdmin (prod), fall back to the caller's authed client when the
 * service-role key is absent (local dev — supabaseAdmin is a lazy proxy that
 * THROWS on first access, so it must be probed in a try/catch).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDb(userClient?: { from: (table: string) => any }): { from: (table: string) => any } { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const test = supabaseAdmin;
    if (test && typeof test.from === "function") return test;
  } catch {
    /* service-role key missing locally */
  }
  if (userClient) return userClient;
  throw new Error("No database client available. Set SUPABASE_SERVICE_ROLE_KEY or pass a user session.");
}

/* ─── Types ──────────────────────────────────────────────────── */

export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  preview_image_url: string | null;
  feature_list: string[];
  is_featured: boolean;
  use_count: number;
  created_at: string;
};

export type TemplateDetail = TemplateSummary & {
  schema: MobileAppSchema;
  is_community: boolean;
  author_id: string | null;
};

/* ─── 1. List Templates ─────────────────────────────────────── */

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ category: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = getDb(context.supabase)
      .from("app_templates")
      .select(
        "id, name, description, category, tags, preview_image_url, feature_list, is_featured, use_count, created_at",
      )
      .order("use_count", { ascending: false });

    if (data.category) {
      query = query.eq("category", data.category);
    }

    const { data: templates, error } = await query;
    if (error) throw new Error(error.message);
    return ((templates ?? []) as unknown as TemplateSummary[]);
  });

/* ─── 2. Get Template ────────────────────────────────────────── */

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ templateId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: template, error } = await getDb(context.supabase)
      .from("app_templates")
      .select("*")
      .eq("id", data.templateId)
      .single();

    if (error) throw new Error(error.message);
    if (!template) throw new Error("Template not found");
    return template as unknown as TemplateDetail;
  });

/* ─── 3. Create Project From Template ────────────────────────── */

/**
 * Instantiate a template into a new project — ZERO AI credits. Optionally
 * applies a theme variant (a MOBILE_THEMES key) so each archetype yields
 * multiple ready-to-use looks deterministically (the "×5" of the vault).
 */
export const createProjectFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        templateId: z.string().uuid(),
        projectName: z.string().min(1).max(200),
        /** MOBILE_THEMES key — deterministic recolor, no AI. */
        themeVariant: z.string().max(40).optional(),
        /** The user's original prompt (when created template-first from the composer). */
        originalPrompt: z.string().max(4000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Template reads are RLS-open to authed users and the project insert
    // passes RLS via user_id, so the user-client fallback works locally.
    const db = getDb(context.supabase);

    // Fetch the template
    const { data: template, error: tErr } = await db
      .from("app_templates")
      .select("id, name, description, schema, use_count")
      .eq("id", data.templateId)
      .single();

    if (tErr || !template) throw new Error("Template not found");

    // Increment use_count via manual update (RPC not defined); best-effort —
    // may be RLS-blocked for non-admin clients locally.
    await db
      .from("app_templates")
      .update({ use_count: ((template as { use_count?: number }).use_count ?? 0) + 1 })
      .eq("id", data.templateId);

    // Deterministic theme variant: clone the schema and swap the named theme.
    let schema = template.schema as MobileAppSchema;
    if (data.themeVariant && MOBILE_THEMES[data.themeVariant]) {
      schema = { ...schema, theme: data.themeVariant };
    }

    // Create the project
    const { data: project, error: pErr } = await db
      .from("projects")
      .insert({
        user_id: userId,
        name: data.projectName,
        prompt: data.originalPrompt ?? template.description ?? `Created from template: ${template.name}`,
        model: "default",
        status: "ready",
        result: JSON.stringify(schema),
      })
      .select("id")
      .single();

    if (pErr) throw new Error(pErr.message);
    return { projectId: project!.id };
  });

/* ─── 3b. Match Templates to a Prompt (zero-AI) ──────────────── */

export type TemplateMatch = TemplateSummary & { score: number };

const STOPWORDS = new Set([
  "a", "an", "the", "app", "application", "build", "create", "make", "i", "want",
  "with", "and", "or", "for", "of", "to", "that", "my", "me", "in", "on", "it",
  "is", "called", "named", "please", "simple", "basic", "mobile",
]);

function promptTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ];
}

/**
 * Keyword-match the vault against a user prompt — pure text scoring, no AI.
 * Used by the composer's template-first flow: strong matches are offered as
 * "start from a template (0 credits)" before any AI generation runs.
 */
export const matchTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ prompt: z.string().min(3).max(4000), limit: z.number().int().min(1).max(10).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const tokens = promptTokens(data.prompt);
    if (tokens.length === 0) return { matches: [] as TemplateMatch[] };

    const { data: templates, error } = await getDb(context.supabase)
      .from("app_templates")
      .select("id, name, description, category, tags, preview_image_url, feature_list, is_featured, use_count, created_at");
    if (error) throw new Error(error.message);

    const scored: TemplateMatch[] = ((templates ?? []) as unknown as TemplateSummary[])
      .map((t) => {
        const hay = {
          name: t.name.toLowerCase(),
          category: t.category.toLowerCase(),
          tags: (t.tags ?? []).map((x) => x.toLowerCase()),
          desc: (t.description ?? "").toLowerCase(),
          features: (t.feature_list ?? []).join(" ").toLowerCase(),
        };
        let score = 0;
        for (const tok of tokens) {
          if (hay.name.includes(tok)) score += 5;
          if (hay.category === tok || hay.category.includes(tok)) score += 4;
          if (hay.tags.some((x) => x.includes(tok))) score += 3;
          if (hay.desc.includes(tok)) score += 2;
          if (hay.features.includes(tok)) score += 1;
        }
        return { ...t, score };
      })
      .filter((t) => t.score >= 5) // require a meaningful overlap, not one stray word
      .sort((a, b) => b.score - a.score || b.use_count - a.use_count)
      .slice(0, data.limit ?? 3);

    return { matches: scored, themeVariants: [...TEMPLATE_THEME_VARIANTS] };
  });

/* ─── 4. Seed Built-in Templates (admin only) ───────────────── */

/** Admin check: throws if the user doesn't have an admin role */
async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

/* ── Additional template schemas ────────────────────────────── */

const TEMPLATE_SOCIALCONNECT: MobileAppSchema = {
  name: "SocialConnect",
  theme: "dark_social",
  screens: [
    {
      id: "feed",
      title: "Feed",
      icon: "home",
      elements: [
        { type: "gradient-mesh-bg", props: { colors: ["#6366f1", "#8b5cf6", "#a855f7", "#6366f1"] } },
        { type: "glass-card", props: { title: "Stories" } },
        { type: "greeting", props: { name: "Taylor", subtitle: "See what's happening" } },
        { type: "search-bar", props: { placeholder: "Search posts, people, tags..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            children: [
              { type: "avatar", props: { name: "Jordan Kim", size: "md", status: "online" } },
              { type: "text", props: { content: "Jordan Kim", size: "sm", weight: "bold" } },
              { type: "text", props: { content: "Just shipped the new feature! 🚀 So excited to see it live.", size: "sm", color: "text" } },
              { type: "spacer", props: { height: 8 } },
              {
                type: "stat-row",
                props: {
                  stats: [
                    { icon: "heart", value: "142", label: "Likes", color: "#ec4899" },
                    { icon: "message", value: "28", label: "Comments", color: "#6366f1" },
                    { icon: "share", value: "12", label: "Shares", color: "#22c55e" },
                  ],
                },
              },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            children: [
              { type: "avatar", props: { name: "Mia Chen", size: "md", status: "away" } },
              { type: "text", props: { content: "Mia Chen", size: "sm", weight: "bold" } },
              { type: "text", props: { content: "Beautiful sunset hike today 🌄 Nature is the best therapy.", size: "sm", color: "text" } },
              { type: "spacer", props: { height: 8 } },
              {
                type: "stat-row",
                props: {
                  stats: [
                    { icon: "heart", value: "89", label: "Likes", color: "#ec4899" },
                    { icon: "message", value: "15", label: "Comments", color: "#6366f1" },
                    { icon: "share", value: "5", label: "Shares", color: "#22c55e" },
                  ],
                },
              },
            ],
          },
        },
        { type: "button", props: { label: "Create Post", icon: "plus", variant: "primary" } },
        { type: "testimonial", props: { quote: "This app changed how I connect with friends!", name: "Sarah M.", role: "Community Leader", rating: 5 } },
      ],
    },
    {
      id: "profile",
      title: "Profile",
      icon: "user",
      elements: [
        { type: "spacer", props: { height: 12 } },
        { type: "avatar", props: { name: "Taylor Swift", size: "xl", status: "online" } },
        { type: "spacer", props: { height: 8 } },
        { type: "text", props: { content: "Taylor Reed", size: "xl", weight: "bold", align: "center" } },
        { type: "text", props: { content: "@taylor_reed · Designer & Creator", size: "xs", color: "muted", align: "center" } },
        { type: "spacer", props: { height: 12 } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "user", value: "1.2K", label: "Followers", color: "#6366f1" },
              { icon: "heart", value: "348", label: "Following", color: "#ec4899" },
              { icon: "edit", value: "89", label: "Posts", color: "#f59e0b" },
            ],
          },
        },
        { type: "divider" },
        { type: "tab-bar", props: { tabs: [{ label: "Posts", active: true }, { label: "Media" }, { label: "Likes" }] } },
        {
          type: "grid-cards",
          props: {
            columns: 3,
            items: [
              { icon: "image", title: "Photo 1", color: "#6366f1" },
              { icon: "image", title: "Photo 2", color: "#ec4899" },
              { icon: "image", title: "Photo 3", color: "#f59e0b" },
              { icon: "video", title: "Video 1", color: "#22c55e" },
              { icon: "image", title: "Photo 4", color: "#3b82f6" },
              { icon: "image", title: "Photo 5", color: "#8b5cf6" },
            ],
          },
        },
      ],
    },
    {
      id: "messages",
      title: "Messages",
      icon: "message",
      elements: [
        { type: "header", props: { title: "Messages", subtitle: "3 unread" } },
        { type: "search-bar", props: { placeholder: "Search conversations..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "message", title: "Jordan Kim", subtitle: "Hey! Did you see the new update?", trailing: "2m", badge: "2", badgeColor: "#6366f1" },
              { icon: "message", title: "Mia Chen", subtitle: "Thanks for the feedback!", trailing: "15m", badge: "1", badgeColor: "#6366f1" },
              { icon: "message", title: "Dev Team", subtitle: "Meeting at 3pm tomorrow", trailing: "1h" },
              { icon: "message", title: "Alex Park", subtitle: "Let's collab on the project!", trailing: "3h" },
              { icon: "message", title: "Sara Lopez", subtitle: "Happy birthday! 🎂", trailing: "1d" },
            ],
          },
        },
      ],
    },
    {
      id: "notifications",
      title: "Notifications",
      icon: "bell",
      elements: [
        { type: "header", props: { title: "Notifications" } },
        { type: "notification", props: { title: "New Follower", message: "Jordan Kim started following you.", icon: "user", type: "info", time: "5m ago" } },
        { type: "notification", props: { title: "Post Liked", message: "Mia Chen liked your post.", icon: "heart", type: "success", time: "20m ago" } },
        { type: "notification", props: { title: "Comment", message: "Alex Park commented on your photo.", icon: "message", type: "info", time: "1h ago" } },
        { type: "notification", props: { title: "Mention", message: "You were mentioned in Dev Team chat.", icon: "zap", type: "warning", time: "3h ago" } },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      icon: "settings",
      elements: [
        { type: "header", props: { title: "Settings" } },
        {
          type: "list",
          props: {
            items: [
              { icon: "user", title: "Account", subtitle: "Profile, email, password", chevron: true },
              { icon: "bell", title: "Notifications", subtitle: "Push, email, in-app", chevron: true },
              { icon: "lock", title: "Privacy", subtitle: "Blocked users, visibility", chevron: true },
              { icon: "globe", title: "Language", subtitle: "English", chevron: true },
              { icon: "moon", title: "Appearance", subtitle: "Dark mode", chevron: true },
              { icon: "share", title: "Connected Accounts", chevron: true },
            ],
          },
        },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "feed", label: "Feed", icon: "home" },
      { screen: "messages", label: "Messages", icon: "message" },
      { screen: "notifications", label: "Alerts", icon: "bell" },
      { screen: "profile", label: "Profile", icon: "user" },
      { screen: "settings", label: "Settings", icon: "settings" },
    ],
  },
};

const TEMPLATE_TASKMASTER: MobileAppSchema = {
  name: "TaskMaster",
  theme: "dark_productivity",
  screens: [
    {
      id: "kanban",
      title: "Board",
      icon: "grid",
      elements: [
        { type: "stat-card-xl", props: { label: "Tasks Completed", value: "24", delta: "+8 this week", deltaDirection: "up" } },
        { type: "progress-bar", props: { value: 24, max: 35, label: "Weekly Goal" } },
        { type: "header", props: { title: "Project Board", subtitle: "Sprint 14" } },
        { type: "chip-group", props: { chips: [{ label: "All", active: true }, { label: "In Progress" }, { label: "Review" }, { label: "Done" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "section",
          props: {
            title: "To Do",
            action: "3 tasks",
            children: [
              {
                type: "list",
                props: {
                  items: [
                    { icon: "target", title: "Design onboarding flow", subtitle: "Priority: High", trailing: "Due Mon", badge: "UI", badgeColor: "#6366f1" },
                    { icon: "target", title: "API integration", subtitle: "Priority: Medium", trailing: "Due Wed" },
                    { icon: "target", title: "Write unit tests", subtitle: "Priority: Low", trailing: "Due Fri" },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "section",
          props: {
            title: "In Progress",
            action: "2 tasks",
            children: [
              {
                type: "list",
                props: {
                  items: [
                    { icon: "activity", title: "Dashboard redesign", subtitle: "Assigned: Jordan", trailing: "60%", badge: "DEV", badgeColor: "#f59e0b" },
                    { icon: "activity", title: "User auth module", subtitle: "Assigned: Mia", trailing: "40%", badge: "DEV", badgeColor: "#f59e0b" },
                  ],
                },
              },
            ],
          },
        },
        { type: "button", props: { label: "Add Task", icon: "plus", variant: "primary" } },
        { type: "empty-state", props: { icon: "list", title: "No tasks yet", description: "Create your first task to get started" } },
      ],
    },
    {
      id: "calendar",
      title: "Calendar",
      icon: "calendar",
      elements: [
        { type: "header", props: { title: "Calendar", subtitle: "May 2026" } },
        { type: "tab-bar", props: { tabs: [{ label: "Day" }, { label: "Week", active: true }, { label: "Month" }] } },
        { type: "spacer", props: { height: 12 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "calendar", title: "Sprint Planning", subtitle: "9:00 AM – 10:00 AM", trailing: "Today", badge: "Team", badgeColor: "#8b5cf6" },
              { icon: "calendar", title: "Design Review", subtitle: "2:00 PM – 3:00 PM", trailing: "Today", badge: "UX", badgeColor: "#ec4899" },
              { icon: "calendar", title: "Standup", subtitle: "9:30 AM – 9:45 AM", trailing: "Tomorrow" },
              { icon: "calendar", title: "Release Planning", subtitle: "11:00 AM – 12:00 PM", trailing: "Wed" },
            ],
          },
        },
        { type: "button", props: { label: "New Event", icon: "plus", variant: "outline" } },
      ],
    },
    {
      id: "stats",
      title: "Stats",
      icon: "bar-chart",
      elements: [
        { type: "header", props: { title: "Team Stats", subtitle: "This Sprint" } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "check", value: "24", label: "Completed", color: "#22c55e" },
              { icon: "activity", value: "8", label: "In Progress", color: "#f59e0b" },
              { icon: "target", value: "5", label: "Blocked", color: "#ef4444" },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        {
          type: "card",
          props: {
            title: "Velocity",
            children: [
              {
                type: "bar-chart",
                props: {
                  bars: [
                    { label: "S10", value: 28, color: "#8b5cf6" },
                    { label: "S11", value: 34, color: "#8b5cf6" },
                    { label: "S12", value: 31, color: "#8b5cf6" },
                    { label: "S13", value: 42, color: "#22c55e" },
                    { label: "S14", value: 24, color: "#f59e0b" },
                  ],
                  maxValue: 50,
                },
              },
            ],
          },
        },
        {
          type: "card",
          props: {
            title: "Task Distribution",
            children: [
              {
                type: "donut-chart",
                props: {
                  segments: [
                    { value: 40, color: "#8b5cf6", label: "Development" },
                    { value: 25, color: "#ec4899", label: "Design" },
                    { value: 20, color: "#f59e0b", label: "QA" },
                    { value: 15, color: "#22c55e", label: "DevOps" },
                  ],
                  centerValue: "37",
                  centerLabel: "total",
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "team",
      title: "Team",
      icon: "user",
      elements: [
        { type: "header", props: { title: "Team Members" } },
        { type: "search-bar", props: { placeholder: "Search team..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "user", title: "Jordan Kim", subtitle: "Lead Developer · 8 tasks", trailing: "Online", badge: "Lead", badgeColor: "#8b5cf6" },
              { icon: "user", title: "Mia Chen", subtitle: "UI Designer · 5 tasks", trailing: "Online" },
              { icon: "user", title: "Alex Park", subtitle: "Backend Dev · 6 tasks", trailing: "Away" },
              { icon: "user", title: "Sara Lopez", subtitle: "QA Engineer · 4 tasks", trailing: "Offline" },
              { icon: "user", title: "Chris Wu", subtitle: "DevOps · 3 tasks", trailing: "Online" },
            ],
          },
        },
        { type: "button", props: { label: "Invite Member", icon: "plus", variant: "outline" } },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "kanban", label: "Board", icon: "grid" },
      { screen: "calendar", label: "Calendar", icon: "calendar" },
      { screen: "stats", label: "Stats", icon: "bar-chart" },
      { screen: "team", label: "Team", icon: "user" },
    ],
  },
};

const TEMPLATE_FOODIEHUB: MobileAppSchema = {
  name: "FoodieHub",
  theme: "dark_food",
  screens: [
    {
      id: "home",
      title: "Home",
      icon: "home",
      elements: [
        { type: "parallax-hero", props: { title: "Chef's Specials", subtitle: "Handpicked by our top chefs", prompt: "gourmet food platter" } },
        { type: "glass-card", props: { title: "Top Picks" } },
        { type: "feature-showcase", props: { title: "Farm to Table", description: "Fresh ingredients sourced daily", icon: "leaf" } },
        { type: "greeting", props: { name: "Jamie", subtitle: "What are you craving today?" } },
        { type: "search-bar", props: { placeholder: "Search restaurants, cuisines..." } },
        { type: "spacer", props: { height: 8 } },
        { type: "chip-group", props: { chips: [{ label: "All", active: true }, { label: "Pizza" }, { label: "Sushi" }, { label: "Burgers" }, { label: "Thai" }, { label: "Indian" }] } },
        { type: "spacer", props: { height: 8 } },
        { type: "hero-banner", props: { title: "Free Delivery", subtitle: "On orders over $25 this week!", gradient: "linear-gradient(135deg, #ef4444, #dc2626)", icon: "truck", buttonLabel: "Order Now" } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "section",
          props: {
            title: "Popular Nearby",
            action: "See all",
            children: [
              {
                type: "grid-cards",
                props: {
                  columns: 2,
                  items: [
                    { icon: "utensils", title: "Bella Italia", subtitle: "$$ · Italian · 25 min", color: "#ef4444", badge: "4.8★" },
                    { icon: "utensils", title: "Sakura Sushi", subtitle: "$$$ · Japanese · 30 min", color: "#f59e0b", badge: "4.9★" },
                    { icon: "utensils", title: "Burger Joint", subtitle: "$ · American · 15 min", color: "#22c55e", badge: "4.5★" },
                    { icon: "utensils", title: "Spice Route", subtitle: "$$ · Indian · 35 min", color: "#8b5cf6", badge: "4.7★" },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "menu",
      title: "Menu",
      icon: "list",
      elements: [
        { type: "header", props: { title: "Bella Italia", subtitle: "Italian · $$ · 25 min delivery" } },
        { type: "rating", props: { value: 4, max: 5, label: "(312 reviews)" } },
        { type: "spacer", props: { height: 8 } },
        { type: "tab-bar", props: { tabs: [{ label: "Popular", active: true }, { label: "Pasta" }, { label: "Pizza" }, { label: "Desserts" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "star", title: "Margherita Pizza", subtitle: "Fresh mozzarella, basil, tomato", trailing: "$14.99", chevron: true },
              { icon: "star", title: "Carbonara Pasta", subtitle: "Pancetta, egg, parmesan, pepper", trailing: "$16.99", chevron: true },
              { icon: "utensils", title: "Caesar Salad", subtitle: "Romaine, croutons, parmesan", trailing: "$10.99", chevron: true },
              { icon: "utensils", title: "Tiramisu", subtitle: "Classic Italian dessert", trailing: "$8.99", chevron: true },
              { icon: "utensils", title: "Bruschetta", subtitle: "Tomato, garlic, fresh basil", trailing: "$9.99", chevron: true },
            ],
          },
        },
      ],
    },
    {
      id: "cart",
      title: "Cart",
      icon: "shopping-cart",
      elements: [
        { type: "header", props: { title: "Your Order", subtitle: "Bella Italia" } },
        {
          type: "list",
          props: {
            items: [
              { icon: "utensils", title: "Margherita Pizza", subtitle: "Qty: 1", trailing: "$14.99" },
              { icon: "utensils", title: "Carbonara Pasta", subtitle: "Qty: 1", trailing: "$16.99" },
              { icon: "utensils", title: "Tiramisu", subtitle: "Qty: 2", trailing: "$17.98" },
            ],
          },
        },
        { type: "divider" },
        { type: "price-tag", props: { price: "49.96", label: "Subtotal", badge: "Free Delivery" } },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Place Order", icon: "check", variant: "primary" } },
      ],
    },
    {
      id: "orders",
      title: "Orders",
      icon: "package",
      elements: [
        { type: "header", props: { title: "My Orders" } },
        { type: "tab-bar", props: { tabs: [{ label: "Active", active: true }, { label: "Past" }] } },
        { type: "spacer", props: { height: 8 } },
        { type: "notification", props: { title: "Order #4521 On Its Way!", message: "Your driver is 5 minutes away. Track your delivery.", icon: "truck", type: "success", time: "Now" } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "package", title: "Bella Italia", subtitle: "2 items · $49.96", trailing: "May 24", badge: "Delivered", badgeColor: "#22c55e" },
              { icon: "package", title: "Sakura Sushi", subtitle: "3 items · $62.50", trailing: "May 22", badge: "Delivered", badgeColor: "#22c55e" },
              { icon: "package", title: "Burger Joint", subtitle: "1 item · $12.99", trailing: "May 20", badge: "Delivered", badgeColor: "#22c55e" },
            ],
          },
        },
      ],
    },
    {
      id: "profile",
      title: "Profile",
      icon: "user",
      elements: [
        { type: "spacer", props: { height: 12 } },
        { type: "avatar", props: { name: "Jamie Wilson", size: "xl", status: "online" } },
        { type: "spacer", props: { height: 8 } },
        { type: "text", props: { content: "Jamie Wilson", size: "xl", weight: "bold", align: "center" } },
        { type: "badge", props: { label: "Foodie Gold", color: "accent" } },
        { type: "spacer", props: { height: 12 } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "package", value: "47", label: "Orders", color: "#ef4444" },
              { icon: "heart", value: "12", label: "Favorites", color: "#ec4899" },
              { icon: "star", value: "4.8", label: "Rating", color: "#f59e0b" },
            ],
          },
        },
        {
          type: "list",
          props: {
            items: [
              { icon: "heart", title: "Favorites", chevron: true, badge: "12" },
              { icon: "map-pin", title: "Addresses", chevron: true },
              { icon: "credit-card", title: "Payment Methods", chevron: true },
              { icon: "gift", title: "Promo Codes", chevron: true },
              { icon: "settings", title: "Settings", chevron: true },
            ],
          },
        },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "home", label: "Home", icon: "home" },
      { screen: "menu", label: "Menu", icon: "list" },
      { screen: "cart", label: "Cart", icon: "shopping-cart" },
      { screen: "orders", label: "Orders", icon: "package" },
      { screen: "profile", label: "Profile", icon: "user" },
    ],
  },
};

const TEMPLATE_LEARNPATH: MobileAppSchema = {
  name: "LearnPath",
  theme: "dark_education",
  screens: [
    {
      id: "home",
      title: "Home",
      icon: "home",
      elements: [
        { type: "stat-card-xl", props: { label: "Hours Learned", value: "47.5", delta: "+3.2h this week", deltaDirection: "up" } },
        { type: "progress-bar", props: { value: 65, max: 100, label: "Current Course" } },
        { type: "feature-showcase", props: { title: "AI-Powered Learning", description: "Personalized study paths", icon: "sparkles" } },
        { type: "greeting", props: { name: "Sam", subtitle: "Continue your learning journey" } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            title: "Current Course",
            children: [
              { type: "text", props: { content: "React Native Masterclass", size: "md", weight: "bold" } },
              { type: "text", props: { content: "Chapter 8: Navigation Patterns", size: "xs", color: "muted" } },
              { type: "progress-ring", props: { value: 68, max: 100, label: "Progress", unit: "%", size: "md" } },
              { type: "button", props: { label: "Continue Learning", icon: "play", variant: "primary" } },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "section",
          props: {
            title: "Recommended",
            action: "Browse all",
            children: [
              {
                type: "grid-cards",
                props: {
                  columns: 2,
                  items: [
                    { icon: "sparkles", title: "AI Fundamentals", subtitle: "12 lessons", color: "#06b6d4", badge: "NEW" },
                    { icon: "globe", title: "Web3 Basics", subtitle: "8 lessons", color: "#8b5cf6" },
                    { icon: "activity", title: "Data Science", subtitle: "15 lessons", color: "#22c55e" },
                    { icon: "lock", title: "Cybersecurity", subtitle: "10 lessons", color: "#ef4444" },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "courses",
      title: "Courses",
      icon: "folder",
      elements: [
        { type: "header", props: { title: "My Courses" } },
        { type: "search-bar", props: { placeholder: "Search courses..." } },
        { type: "spacer", props: { height: 8 } },
        { type: "tab-bar", props: { tabs: [{ label: "In Progress", active: true }, { label: "Completed" }, { label: "Saved" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "play", title: "React Native Masterclass", subtitle: "68% complete · 12h left", trailing: "Ch 8/14", chevron: true },
              { icon: "play", title: "TypeScript Deep Dive", subtitle: "45% complete · 8h left", trailing: "Ch 5/11", chevron: true },
              { icon: "play", title: "UI/UX Design Principles", subtitle: "23% complete · 15h left", trailing: "Ch 3/13", chevron: true },
            ],
          },
        },
      ],
    },
    {
      id: "progress",
      title: "Progress",
      icon: "bar-chart",
      elements: [
        { type: "header", props: { title: "Learning Stats" } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "clock", value: "142h", label: "Total Time", color: "#06b6d4" },
              { icon: "check", value: "8", label: "Completed", color: "#22c55e" },
              { icon: "flame", value: "24", label: "Day Streak", color: "#f59e0b" },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        {
          type: "card",
          props: {
            title: "Weekly Activity",
            children: [
              {
                type: "bar-chart",
                props: {
                  bars: [
                    { label: "Mon", value: 45, color: "#06b6d4" },
                    { label: "Tue", value: 90, color: "#06b6d4" },
                    { label: "Wed", value: 60, color: "#06b6d4" },
                    { label: "Thu", value: 120, color: "#22c55e" },
                    { label: "Fri", value: 30, color: "#06b6d4" },
                    { label: "Sat", value: 75, color: "#06b6d4" },
                    { label: "Sun", value: 50, color: "#06b6d4" },
                  ],
                  maxValue: 150,
                },
              },
            ],
          },
        },
        {
          type: "card",
          props: {
            title: "Skills Breakdown",
            children: [
              {
                type: "donut-chart",
                props: {
                  segments: [
                    { value: 35, color: "#06b6d4", label: "Frontend" },
                    { value: 25, color: "#8b5cf6", label: "Backend" },
                    { value: 20, color: "#22c55e", label: "Design" },
                    { value: 20, color: "#f59e0b", label: "DevOps" },
                  ],
                  centerValue: "8",
                  centerLabel: "courses",
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "certificates",
      title: "Certs",
      icon: "trophy",
      elements: [
        { type: "header", props: { title: "Certificates" } },
        {
          type: "list",
          props: {
            items: [
              { icon: "trophy", title: "JavaScript Essentials", subtitle: "Completed May 2026", trailing: "View", chevron: true, badge: "Verified", badgeColor: "#22c55e" },
              { icon: "trophy", title: "React Fundamentals", subtitle: "Completed Apr 2026", trailing: "View", chevron: true, badge: "Verified", badgeColor: "#22c55e" },
              { icon: "trophy", title: "CSS Mastery", subtitle: "Completed Mar 2026", trailing: "View", chevron: true, badge: "Verified", badgeColor: "#22c55e" },
              { icon: "trophy", title: "Git & GitHub", subtitle: "Completed Feb 2026", trailing: "View", chevron: true, badge: "Verified", badgeColor: "#22c55e" },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Share Certificates", icon: "share", variant: "outline" } },
      ],
    },
    {
      id: "community",
      title: "Community",
      icon: "user",
      elements: [
        { type: "header", props: { title: "Community" } },
        { type: "search-bar", props: { placeholder: "Search discussions..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "message", title: "Help with React hooks", subtitle: "Posted by Jordan · 12 replies", trailing: "2h ago", chevron: true },
              { icon: "message", title: "Best practices for state mgmt", subtitle: "Posted by Mia · 28 replies", trailing: "5h ago", chevron: true },
              { icon: "message", title: "TypeScript generics explained", subtitle: "Posted by Alex · 45 replies", trailing: "1d ago", chevron: true },
              { icon: "message", title: "Study group: System Design", subtitle: "8 members active", trailing: "3d ago", chevron: true },
            ],
          },
        },
        { type: "button", props: { label: "Start Discussion", icon: "plus", variant: "primary" } },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "home", label: "Home", icon: "home" },
      { screen: "courses", label: "Courses", icon: "folder" },
      { screen: "progress", label: "Progress", icon: "bar-chart" },
      { screen: "certificates", label: "Certs", icon: "trophy" },
      { screen: "community", label: "Community", icon: "user" },
    ],
  },
};

const TEMPLATE_MEDTRACK: MobileAppSchema = {
  name: "MedTrack",
  theme: "dark_health",
  screens: [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: "home",
      elements: [
        { type: "glass-card", props: { title: "Health Overview" } },
        { type: "line-chart", props: { series: [{ label: "Heart Rate", data: [72, 75, 68, 71, 74, 69, 73], color: "#ef4444" }], labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] } },
        { type: "stat-card-xl", props: { label: "Blood Pressure", value: "120/80", delta: "Normal", deltaDirection: "up" } },
        { type: "progress-bar", props: { value: 5, max: 7, label: "Medication Adherence" } },
        { type: "greeting", props: { name: "Dr. Patel", subtitle: "Today's health overview" } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "heart", value: "72", label: "Heart Rate", color: "#ef4444" },
              { icon: "activity", value: "120/80", label: "BP", color: "#10b981" },
              { icon: "zap", value: "98%", label: "SpO₂", color: "#3b82f6" },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            title: "Heart Rate Trend",
            children: [
              {
                type: "bar-chart",
                props: {
                  bars: [
                    { label: "6AM", value: 62, color: "#10b981" },
                    { label: "9AM", value: 78, color: "#10b981" },
                    { label: "12PM", value: 85, color: "#f59e0b" },
                    { label: "3PM", value: 72, color: "#10b981" },
                    { label: "6PM", value: 68, color: "#10b981" },
                    { label: "9PM", value: 65, color: "#10b981" },
                  ],
                  maxValue: 100,
                },
              },
            ],
          },
        },
        { type: "notification", props: { title: "Medication Reminder", message: "Time to take Metformin 500mg. Take with food.", icon: "bell", type: "warning", time: "Now" } },
        { type: "button", props: { label: "Log Vitals", icon: "plus", variant: "primary" } },
      ],
    },
    {
      id: "vitals",
      title: "Vitals",
      icon: "activity",
      elements: [
        { type: "header", props: { title: "Vital Signs", subtitle: "Last 7 days" } },
        { type: "tab-bar", props: { tabs: [{ label: "Heart", active: true }, { label: "BP" }, { label: "SpO₂" }, { label: "Temp" }] } },
        { type: "spacer", props: { height: 12 } },
        { type: "progress-ring", props: { value: 72, max: 100, label: "Current BPM", unit: "bpm", size: "lg" } },
        { type: "spacer", props: { height: 12 } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "trending-down", value: "58", label: "Resting", color: "#10b981" },
              { icon: "trending-up", value: "142", label: "Peak", color: "#ef4444" },
              { icon: "activity", value: "74", label: "Average", color: "#3b82f6" },
            ],
          },
        },
        {
          type: "list",
          props: {
            items: [
              { icon: "clock", title: "Today, 3:00 PM", subtitle: "72 bpm · Normal", trailing: "Rest" },
              { icon: "clock", title: "Today, 12:00 PM", subtitle: "85 bpm · Elevated", trailing: "Active" },
              { icon: "clock", title: "Today, 9:00 AM", subtitle: "78 bpm · Normal", trailing: "Walk" },
            ],
          },
        },
      ],
    },
    {
      id: "medications",
      title: "Meds",
      icon: "heart",
      elements: [
        { type: "header", props: { title: "Medications" } },
        {
          type: "list",
          props: {
            items: [
              { icon: "heart", title: "Metformin 500mg", subtitle: "Twice daily · With food", trailing: "8 AM, 8 PM", badge: "Active", badgeColor: "#10b981" },
              { icon: "heart", title: "Lisinopril 10mg", subtitle: "Once daily · Morning", trailing: "8 AM", badge: "Active", badgeColor: "#10b981" },
              { icon: "heart", title: "Vitamin D 2000IU", subtitle: "Once daily · Any time", trailing: "9 AM", badge: "Active", badgeColor: "#10b981" },
              { icon: "heart", title: "Ibuprofen 200mg", subtitle: "As needed", trailing: "PRN", badge: "PRN", badgeColor: "#f59e0b" },
            ],
          },
        },
        { type: "divider" },
        { type: "button", props: { label: "Add Medication", icon: "plus", variant: "outline" } },
      ],
    },
    {
      id: "appointments",
      title: "Appts",
      icon: "calendar",
      elements: [
        { type: "header", props: { title: "Appointments" } },
        { type: "notification", props: { title: "Upcoming", message: "Annual checkup with Dr. Smith in 3 days.", icon: "calendar", type: "info", time: "May 28" } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "calendar", title: "Annual Checkup", subtitle: "Dr. Smith · General Practice", trailing: "May 28", chevron: true },
              { icon: "calendar", title: "Blood Work", subtitle: "Quest Diagnostics", trailing: "Jun 5", chevron: true },
              { icon: "calendar", title: "Dental Cleaning", subtitle: "Dr. Lee · Dentistry", trailing: "Jun 15", chevron: true },
              { icon: "calendar", title: "Eye Exam", subtitle: "Dr. Wong · Ophthalmology", trailing: "Jul 2", chevron: true },
            ],
          },
        },
        { type: "button", props: { label: "Book Appointment", icon: "plus", variant: "primary" } },
      ],
    },
    {
      id: "records",
      title: "Records",
      icon: "file",
      elements: [
        { type: "header", props: { title: "Health Records" } },
        { type: "search-bar", props: { placeholder: "Search records..." } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "section",
          props: {
            title: "Recent Documents",
            action: "View all",
            children: [
              {
                type: "list",
                props: {
                  items: [
                    { icon: "file", title: "Lab Results - May 2026", subtitle: "Blood panel · All normal", trailing: "PDF", chevron: true },
                    { icon: "file", title: "X-Ray Report", subtitle: "Chest · Clear", trailing: "PDF", chevron: true },
                    { icon: "file", title: "Prescription History", subtitle: "Last 12 months", trailing: "PDF", chevron: true },
                    { icon: "file", title: "Vaccination Record", subtitle: "Up to date", trailing: "PDF", chevron: true },
                  ],
                },
              },
            ],
          },
        },
        { type: "button", props: { label: "Upload Document", icon: "upload", variant: "outline" } },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "dashboard", label: "Dashboard", icon: "home" },
      { screen: "vitals", label: "Vitals", icon: "activity" },
      { screen: "medications", label: "Meds", icon: "heart" },
      { screen: "appointments", label: "Appts", icon: "calendar" },
      { screen: "records", label: "Records", icon: "file" },
    ],
  },
};

const TEMPLATE_TRAVELMATE: MobileAppSchema = {
  name: "TravelMate",
  theme: "dark_travel",
  screens: [
    {
      id: "home",
      title: "Explore",
      icon: "compass",
      elements: [
        { type: "parallax-hero", props: { title: "Discover Paradise", subtitle: "Your next adventure awaits", prompt: "tropical beach sunset" } },
        { type: "glass-card", props: { title: "Hot Deals" } },
        { type: "marquee", props: { items: ["SUMMER DEALS: UP TO 40% OFF", "BOOK NOW"] } },
        { type: "feature-showcase", props: { title: "Local Experiences", description: "Curated by travel experts", icon: "compass" } },
        { type: "greeting", props: { name: "Riley", subtitle: "Where to next?" } },
        { type: "search-bar", props: { placeholder: "Search destinations, hotels..." } },
        { type: "spacer", props: { height: 8 } },
        { type: "hero-banner", props: { title: "Summer in Santorini", subtitle: "Flights from $499 · 4-night packages", gradient: "linear-gradient(135deg, #ec4899, #8b5cf6)", icon: "sun", buttonLabel: "Explore" } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "section",
          props: {
            title: "Trending Destinations",
            action: "See all",
            children: [
              {
                type: "grid-cards",
                props: {
                  columns: 2,
                  items: [
                    { icon: "map-pin", title: "Tokyo, Japan", subtitle: "From $650", color: "#ec4899", badge: "HOT" },
                    { icon: "map-pin", title: "Bali, Indonesia", subtitle: "From $420", color: "#22c55e" },
                    { icon: "map-pin", title: "Paris, France", subtitle: "From $550", color: "#6366f1" },
                    { icon: "map-pin", title: "Cancún, Mexico", subtitle: "From $380", color: "#f59e0b" },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "trips",
      title: "My Trips",
      icon: "map",
      elements: [
        { type: "header", props: { title: "My Trips" } },
        { type: "tab-bar", props: { tabs: [{ label: "Upcoming", active: true }, { label: "Past" }, { label: "Wishlisted" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            title: "Santorini, Greece",
            subtitle: "Jun 15 – Jun 19 · 4 nights",
            children: [
              {
                type: "stat-row",
                props: {
                  stats: [
                    { icon: "navigation", value: "Flight", label: "Booked", color: "#22c55e" },
                    { icon: "home", value: "Hotel", label: "Booked", color: "#22c55e" },
                    { icon: "map", value: "3", label: "Activities", color: "#ec4899" },
                  ],
                },
              },
              { type: "button", props: { label: "View Itinerary", icon: "chevron-right", variant: "outline" } },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "map", title: "Tokyo Adventure", subtitle: "Aug 1 – Aug 8 · Planning", trailing: "Draft", chevron: true },
              { icon: "map", title: "Bali Retreat", subtitle: "Sep 20 – Sep 27 · Wishlist", trailing: "Saved", chevron: true },
            ],
          },
        },
        { type: "button", props: { label: "Plan New Trip", icon: "plus", variant: "primary" } },
      ],
    },
    {
      id: "explore",
      title: "Discover",
      icon: "compass",
      elements: [
        { type: "header", props: { title: "Discover" } },
        { type: "chip-group", props: { chips: [{ label: "All", active: true }, { label: "Beaches" }, { label: "Mountains" }, { label: "Cities" }, { label: "Culture" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "compass", title: "Hidden Gems in Kyoto", subtitle: "Cultural · 12 spots", trailing: "4.9★", chevron: true },
              { icon: "compass", title: "Street Food Tour Bangkok", subtitle: "Food · 8 stops", trailing: "4.8★", chevron: true },
              { icon: "compass", title: "Hiking Patagonia", subtitle: "Adventure · 5 trails", trailing: "4.7★", chevron: true },
              { icon: "compass", title: "Art Galleries of Florence", subtitle: "Culture · 6 venues", trailing: "4.6★", chevron: true },
            ],
          },
        },
      ],
    },
    {
      id: "bookings",
      title: "Bookings",
      icon: "credit-card",
      elements: [
        { type: "header", props: { title: "Bookings" } },
        { type: "notification", props: { title: "Check-in Available", message: "Your Santorini flight check-in opens in 24 hours.", icon: "navigation", type: "info", time: "Jun 14" } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "navigation", title: "Flight: JFK → ATH", subtitle: "Jun 15, 8:30 PM · Delta DL402", trailing: "$499", badge: "Confirmed", badgeColor: "#22c55e" },
              { icon: "home", title: "Mystique Hotel", subtitle: "Jun 15-19 · Ocean view suite", trailing: "$1,200", badge: "Confirmed", badgeColor: "#22c55e" },
              { icon: "map", title: "Sunset Sailing Tour", subtitle: "Jun 16, 5:00 PM", trailing: "$85", badge: "Confirmed", badgeColor: "#22c55e" },
            ],
          },
        },
      ],
    },
    {
      id: "reviews",
      title: "Reviews",
      icon: "star",
      elements: [
        { type: "header", props: { title: "Reviews & Tips" } },
        { type: "tab-bar", props: { tabs: [{ label: "My Reviews", active: true }, { label: "Saved" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "star", title: "Mystique Hotel, Santorini", subtitle: "★★★★★ · Stunning views, perfect service", trailing: "May 2026", chevron: true },
              { icon: "star", title: "Sukiyabashi Jiro, Tokyo", subtitle: "★★★★★ · Best sushi experience ever", trailing: "Mar 2026", chevron: true },
              { icon: "star", title: "Café de Flore, Paris", subtitle: "★★★★ · Classic Parisian charm", trailing: "Jan 2026", chevron: true },
            ],
          },
        },
        { type: "button", props: { label: "Write Review", icon: "edit", variant: "outline" } },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "home", label: "Explore", icon: "compass" },
      { screen: "trips", label: "Trips", icon: "map" },
      { screen: "explore", label: "Discover", icon: "compass" },
      { screen: "bookings", label: "Bookings", icon: "credit-card" },
      { screen: "reviews", label: "Reviews", icon: "star" },
    ],
  },
};

const TEMPLATE_CRYPTOWALLET: MobileAppSchema = {
  name: "CryptoWallet",
  theme: "dark_crypto",
  screens: [
    {
      id: "portfolio",
      title: "Portfolio",
      icon: "home",
      elements: [
        { type: "glass-card", props: { title: "Total Balance" } },
        { type: "line-chart", props: { series: [{ label: "BTC", data: [42000, 44500, 41000, 48000, 52000, 49000, 55000, 58000, 54000, 62000, 59000, 67000], color: "#f7931a" }], labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] } },
        { type: "stat-card-xl", props: { label: "Top Gainer", value: "ETH", delta: "+18.7%", deltaDirection: "up" } },
        { type: "greeting", props: { name: "Morgan", subtitle: "Market is up 2.4% today" } },
        {
          type: "card",
          props: {
            title: "Total Balance",
            children: [
              { type: "text", props: { content: "$42,680.50", size: "2xl", weight: "bold" } },
              { type: "text", props: { content: "+$1,024.30 (2.4%) today", size: "xs", color: "success" } },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "stat-row",
          props: {
            stats: [
              { icon: "trending-up", value: "+12.8%", label: "Month", color: "#10b981" },
              { icon: "dollar-sign", value: "$2.1K", label: "Profit", color: "#22c55e" },
              { icon: "pie-chart", value: "6", label: "Assets", color: "#f59e0b" },
            ],
          },
        },
        {
          type: "section",
          props: {
            title: "Holdings",
            action: "See all",
            children: [
              {
                type: "list",
                props: {
                  items: [
                    { icon: "zap", title: "Bitcoin (BTC)", subtitle: "0.42 BTC · +3.2%", trailing: "$28,140", badge: "↑", badgeColor: "#10b981" },
                    { icon: "activity", title: "Ethereum (ETH)", subtitle: "3.8 ETH · +1.8%", trailing: "$9,880", badge: "↑", badgeColor: "#10b981" },
                    { icon: "dollar-sign", title: "Solana (SOL)", subtitle: "28 SOL · -0.5%", trailing: "$3,220", badge: "↓", badgeColor: "#ef4444" },
                    { icon: "star", title: "Cardano (ADA)", subtitle: "2,400 ADA · +4.1%", trailing: "$1,440", badge: "↑", badgeColor: "#10b981" },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      id: "swap",
      title: "Swap",
      icon: "refresh",
      elements: [
        { type: "header", props: { title: "Swap Tokens" } },
        {
          type: "card",
          props: {
            title: "From",
            children: [
              { type: "text", props: { content: "Ethereum (ETH)", size: "md", weight: "bold" } },
              { type: "text", props: { content: "Balance: 3.8 ETH", size: "xs", color: "muted" } },
              { type: "text", props: { content: "1.0 ETH", size: "xl", weight: "bold" } },
            ],
          },
        },
        { type: "spacer", props: { height: 8 } },
        {
          type: "card",
          props: {
            title: "To",
            children: [
              { type: "text", props: { content: "Bitcoin (BTC)", size: "md", weight: "bold" } },
              { type: "text", props: { content: "≈ 0.0389 BTC", size: "xl", weight: "bold" } },
              { type: "text", props: { content: "Rate: 1 ETH = 0.0389 BTC", size: "xs", color: "muted" } },
            ],
          },
        },
        { type: "divider" },
        {
          type: "list",
          props: {
            items: [
              { icon: "zap", title: "Network Fee", trailing: "~$2.40" },
              { icon: "clock", title: "Estimated Time", trailing: "~2 min" },
              { icon: "activity", title: "Slippage", trailing: "0.5%" },
            ],
          },
        },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Swap Now", icon: "refresh", variant: "primary" } },
      ],
    },
    {
      id: "history",
      title: "History",
      icon: "clock",
      elements: [
        { type: "header", props: { title: "Transaction History" } },
        { type: "tab-bar", props: { tabs: [{ label: "All", active: true }, { label: "Sent" }, { label: "Received" }, { label: "Swaps" }] } },
        { type: "spacer", props: { height: 8 } },
        {
          type: "list",
          props: {
            items: [
              { icon: "arrow-up", title: "Sent BTC", subtitle: "To 0x8f3...a2b1", trailing: "-0.05 BTC", badge: "Confirmed", badgeColor: "#22c55e" },
              { icon: "arrow-down", title: "Received ETH", subtitle: "From 0x2a1...c4d3", trailing: "+1.2 ETH", badge: "Confirmed", badgeColor: "#22c55e" },
              { icon: "refresh", title: "Swap SOL → ETH", subtitle: "10 SOL → 0.32 ETH", trailing: "Swap", badge: "Confirmed", badgeColor: "#22c55e" },
              { icon: "arrow-up", title: "Sent USDT", subtitle: "To 0x5b2...e8f7", trailing: "-500 USDT", badge: "Pending", badgeColor: "#f59e0b" },
              { icon: "arrow-down", title: "Received ADA", subtitle: "Staking reward", trailing: "+48 ADA", badge: "Confirmed", badgeColor: "#22c55e" },
            ],
          },
        },
      ],
    },
    {
      id: "alerts",
      title: "Alerts",
      icon: "bell",
      elements: [
        { type: "header", props: { title: "Price Alerts" } },
        {
          type: "list",
          props: {
            items: [
              { icon: "zap", title: "BTC > $70,000", subtitle: "Currently: $67,000", trailing: "Active", badge: "On", badgeColor: "#22c55e" },
              { icon: "activity", title: "ETH > $3,000", subtitle: "Currently: $2,600", trailing: "Active", badge: "On", badgeColor: "#22c55e" },
              { icon: "dollar-sign", title: "SOL < $100", subtitle: "Currently: $115", trailing: "Active", badge: "On", badgeColor: "#22c55e" },
            ],
          },
        },
        { type: "divider" },
        { type: "notification", props: { title: "BTC Alert Triggered", message: "Bitcoin crossed $66,000 — up 3.2% in 24h.", icon: "trending-up", type: "success", time: "1h ago" } },
        { type: "notification", props: { title: "Portfolio Alert", message: "Your portfolio gained $1,000+ today.", icon: "dollar-sign", type: "info", time: "4h ago" } },
        { type: "spacer", props: { height: 12 } },
        { type: "button", props: { label: "Create Alert", icon: "plus", variant: "primary" } },
      ],
    },
    {
      id: "settings",
      title: "Settings",
      icon: "settings",
      elements: [
        { type: "header", props: { title: "Wallet Settings" } },
        {
          type: "list",
          props: {
            items: [
              { icon: "lock", title: "Security", subtitle: "2FA, biometrics, recovery", chevron: true },
              { icon: "eye", title: "Privacy", subtitle: "Transaction visibility", chevron: true },
              { icon: "globe", title: "Network", subtitle: "Mainnet", chevron: true },
              { icon: "bell", title: "Notifications", subtitle: "Push, price alerts", chevron: true },
              { icon: "download", title: "Export Keys", subtitle: "Backup your wallet", chevron: true },
              { icon: "settings", title: "Advanced", subtitle: "Gas, slippage, RPC", chevron: true },
            ],
          },
        },
      ],
    },
  ],
  navigation: {
    type: "bottom-tabs",
    items: [
      { screen: "portfolio", label: "Portfolio", icon: "home" },
      { screen: "swap", label: "Swap", icon: "refresh" },
      { screen: "history", label: "History", icon: "clock" },
      { screen: "alerts", label: "Alerts", icon: "bell" },
      { screen: "settings", label: "Settings", icon: "settings" },
    ],
  },
};

/* ── Built-in template definitions ──────────────────────────── */

type BuiltinTemplate = {
  name: string;
  description: string;
  category: string;
  tags: string[];
  schema: MobileAppSchema;
  feature_list: string[];
  is_featured: boolean;
};

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: "FitTrack Pro",
    description: "A comprehensive fitness tracking app with activity logging, calorie tracking, workout stats, and personal progress monitoring.",
    category: "fitness",
    tags: ["fitness", "health", "tracking", "workout"],
    schema: SAMPLE_FITTRACK,
    feature_list: ["Activity tracking", "Calorie counter", "Weekly stats", "Workout history", "Progress rings", "Profile & badges"],
    is_featured: true,
  },
  {
    name: "ShopLux",
    description: "Premium e-commerce shopping experience with product browsing, detailed product pages, cart management, and order tracking.",
    category: "e-commerce",
    tags: ["shopping", "e-commerce", "retail", "fashion"],
    schema: SAMPLE_SHOPLUX,
    feature_list: ["Product catalog", "Product details", "Shopping cart", "Order notifications", "User profiles", "Flash sales"],
    is_featured: true,
  },
  {
    name: "WealthFlow",
    description: "Personal finance and investment tracking with portfolio management, spending insights, and transaction monitoring.",
    category: "finance",
    tags: ["finance", "investing", "banking", "budgeting"],
    schema: SAMPLE_WEALTHFLOW,
    feature_list: ["Portfolio tracker", "Spending insights", "Transaction history", "Asset allocation", "Budget alerts", "Quick actions"],
    is_featured: true,
  },
  {
    name: "SocialConnect",
    description: "Modern social media platform with a live feed, direct messaging, user profiles, notifications, and community engagement.",
    category: "social",
    tags: ["social", "messaging", "community", "networking"],
    schema: TEMPLATE_SOCIALCONNECT,
    feature_list: ["Social feed", "Direct messaging", "User profiles", "Notifications", "Settings", "Photo grid"],
    is_featured: false,
  },
  {
    name: "TaskMaster",
    description: "Project management and task tracking app with kanban boards, team calendars, sprint statistics, and team collaboration.",
    category: "productivity",
    tags: ["productivity", "tasks", "kanban", "team", "project"],
    schema: TEMPLATE_TASKMASTER,
    feature_list: ["Kanban board", "Team calendar", "Sprint stats", "Task distribution", "Team management", "Velocity charts"],
    is_featured: false,
  },
  {
    name: "FoodieHub",
    description: "Food delivery and restaurant discovery app with menu browsing, ordering, cart management, and order tracking.",
    category: "food",
    tags: ["food", "delivery", "restaurant", "ordering"],
    schema: TEMPLATE_FOODIEHUB,
    feature_list: ["Restaurant discovery", "Menu browsing", "Cart & ordering", "Order tracking", "Favorites", "Review ratings"],
    is_featured: false,
  },
  {
    name: "LearnPath",
    description: "Online learning platform with course management, progress tracking, certificates, and community discussions.",
    category: "education",
    tags: ["education", "learning", "courses", "certificates"],
    schema: TEMPLATE_LEARNPATH,
    feature_list: ["Course catalog", "Progress tracking", "Certificates", "Community forums", "Learning streaks", "Skills breakdown"],
    is_featured: false,
  },
  {
    name: "MedTrack",
    description: "Health tracking and medical management app with vital signs monitoring, medication reminders, appointments, and health records.",
    category: "health",
    tags: ["health", "medical", "vitals", "medications"],
    schema: TEMPLATE_MEDTRACK,
    feature_list: ["Vital signs dashboard", "Medication tracking", "Appointment scheduling", "Health records", "Trend charts", "Reminders"],
    is_featured: false,
  },
  {
    name: "TravelMate",
    description: "Travel planning and booking app with destination discovery, trip management, booking confirmations, and travel reviews.",
    category: "travel",
    tags: ["travel", "booking", "trips", "destinations"],
    schema: TEMPLATE_TRAVELMATE,
    feature_list: ["Destination discovery", "Trip planning", "Booking management", "Travel reviews", "Itineraries", "Price alerts"],
    is_featured: false,
  },
  {
    name: "CryptoWallet",
    description: "Cryptocurrency portfolio management with token holdings, swap functionality, transaction history, and price alerts.",
    category: "finance",
    tags: ["crypto", "wallet", "blockchain", "trading", "defi"],
    schema: TEMPLATE_CRYPTOWALLET,
    feature_list: ["Portfolio dashboard", "Token swap", "Transaction history", "Price alerts", "Multi-chain", "Wallet security"],
    is_featured: false,
  },
];

export const seedBuiltinTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await assertAdmin(userId);

    let inserted = 0;

    for (const tpl of BUILTIN_TEMPLATES) {
      // Check if already exists by name
      const { data: existing } = await supabaseAdmin
        .from("app_templates")
        .select("id")
        .eq("name", tpl.name)
        .maybeSingle();

      if (existing) continue;

      const { error } = await supabaseAdmin.from("app_templates").insert({
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        tags: tpl.tags,
        schema: tpl.schema as any,
        feature_list: tpl.feature_list,
        is_featured: tpl.is_featured,
        is_community: false,
        use_count: 0,
        author_id: userId,
      });

      if (error) {
        console.error(`Failed to seed template "${tpl.name}":`, error.message);
      } else {
        inserted++;
      }
    }

    return { ok: true, inserted, total: BUILTIN_TEMPLATES.length };
  });
