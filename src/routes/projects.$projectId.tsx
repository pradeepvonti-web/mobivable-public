import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  MessageSquare,
  Database,
  Code2,
  Image as ImageIcon,
  Settings,
  History,
  LifeBuoy,
  Loader2,
  RefreshCw,
  Smartphone,
  Eye,
  Send,
  Square,
  Plus,
  MousePointerClick,
  Mic,
  ArrowUp,
  ChevronDown,
  Check,
  Undo2,
  Redo2,
  Users,
  Menu,
  Crown,
  Share2,
  Upload,
  Download,
  Sun,
  Moon,
  KeyRound,
  EyeOff,
  Trash2,
  Pencil,
  X,
  Sparkles,
  BookOpen,
  Github,
  Workflow,
  Camera,
  AtSign,
  ClipboardList,
  Paperclip,
  ChevronRight,
  Terminal,
  DollarSign,
  Brain,
  BookOpen as BookOpenIcon,
  Rocket,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { generateProject } from "@/lib/generate-project.functions";
import { generateAppImages } from "@/lib/app-images.functions";

import { generateAsset } from "@/lib/generate-asset.functions";
import { sendProjectMessage } from "@/lib/project-chat.functions";
import { ProjectPreview } from "@/components/ProjectPreview";
import { CreditBadge } from "@/components/CreditBadge";
import { AgentWorkspace } from "@/components/AgentWorkspace";
import { MobileAppRenderer } from "@/components/MobileAppRenderer";
import { ComponentPalette } from "@/components/ComponentPalette";
import { parseAppSchema } from "@/lib/code-gen";
import type { MobileAppSchema, MElement } from "@/lib/mobile-app-schema";
import { SAMPLE_FITTRACK, SAMPLE_APPS } from "@/lib/sample-apps";
import { usePreviewConfig, aliasedSelect } from "@/lib/preview-config";
import { AGENTS, ALL_ROLES, AGENT_TEMPLATES, AGENT_BADGE, parseAgentMarker, type AgentRole } from "@/lib/agents";
import { SDLCProgressBar } from "@/components/SDLCProgressBar";
import { useTheme } from "@/components/theme-toggle";
import { ExportPanel } from "@/components/ExportPanel";
import { ScreenshotGallery } from "@/components/ScreenshotGallery";
import { AIProviderSettings } from "@/components/AIProviderSettings";
import { CodeEditorPanel } from "@/components/CodeEditorPanel";
import { AgentsMdPanel } from "@/components/AgentsMdPanel";
import { ErrorConsolePanel, useConsoleCapture } from "@/components/ErrorConsolePanel";
import { MonetizationPanel } from "@/components/MonetizationPanel";
import { AIStudioPanel } from "@/components/AIStudioPanel";
import { KnowledgeBasePanel } from "@/components/KnowledgeBasePanel";
import { DeploymentsPanel } from "@/components/DeploymentsPanel";
import { FigmaImportPanel } from "@/components/FigmaImportPanel";
import { CodeExportPanel } from "@/components/CodeExportPanel";
import { inferBackendSpec, applyBackendSchema, getBackendSpec } from "@/lib/backend-provision.functions";
import { exportExpoProject } from "@/lib/export-expo.functions";
import { useTypewriter, APP_TYPED_PHRASES } from "@/hooks/useTypewriter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Attachment = { path: string; url: string; name: string };

type VisualStyles = {
  background?: string;
  borderColor?: string;
  borderWidth?: string;
  padding?: string;
  fontSize?: string;
};
type VisualEdit = {
  path: number[];
  text?: string;
  classes?: string;
  styles?: VisualStyles;
};
type VisualSnapshot = { edits: VisualEdit[]; reorders: Record<string, number[]> };
type VisualEditMap = {
  edits: VisualEdit[];
  reorders?: Record<string, number[]>;
  past?: VisualSnapshot[];
  future?: VisualSnapshot[];
};

const STYLE_KEYS: (keyof VisualStyles)[] = [
  "background",
  "borderColor",
  "borderWidth",
  "padding",
  "fontSize",
];
const STYLE_CSS: Record<keyof VisualStyles, string> = {
  background: "background",
  borderColor: "borderColor",
  borderWidth: "borderWidth",
  padding: "padding",
  fontSize: "fontSize",
};

const CLASS_PRESETS: { label: string; classes: string[] }[] = [
  {
    label: "Spacing",
    classes: ["p-1", "p-2", "p-4", "p-6", "p-8", "px-4", "py-2", "m-2", "mx-auto", "gap-2", "gap-4"],
  },
  {
    label: "Layout",
    classes: ["flex", "inline-flex", "grid", "block", "hidden", "items-center", "justify-center", "justify-between", "flex-col", "flex-1", "w-full", "h-full"],
  },
  {
    label: "Text",
    classes: ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "font-medium", "font-semibold", "font-bold", "uppercase", "text-center", "tracking-wide"],
  },
  {
    label: "Color",
    classes: ["text-primary", "text-foreground", "text-muted-foreground", "bg-primary", "bg-background", "bg-muted", "bg-card"],
  },
  {
    label: "Border",
    classes: ["border", "border-2", "border-border", "border-primary", "rounded", "rounded-md", "rounded-lg", "rounded-xl", "rounded-full", "shadow", "shadow-lg"],
  },
];

type Project = {
  id: string;
  name: string;
  prompt: string;
  model: string;
  status: string;
  created_at: string;
  attachments: Attachment[] | null;
  result: string | null;
  error_text: string | null;
  visual_edits: VisualEditMap | null;
};

function getPath(el: HTMLElement, root: HTMLElement): number[] | null {
  const path: number[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    const parent: HTMLElement | null = cur.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return cur === root ? path : null;
}

function resolvePath(root: HTMLElement, path: number[]): HTMLElement | null {
  let cur: HTMLElement | null = root;
  for (const i of path) {
    if (!cur) return null;
    cur = (cur.children[i] as HTMLElement) ?? null;
  }
  return cur;
}

function pathKey(p: number[]) {
  return p.join(".");
}

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
  head: () => ({
    meta: [{ title: "Workspace — Mobivable" }],
  }),
});

const SIDE_ITEMS = [
  { icon: MessageSquare, label: "Chat", active: true },
  { icon: LayoutGrid, label: "Components" },
  { icon: Brain, label: "AI Studio" },
  { icon: Code2, label: "Code" },
  { icon: Terminal, label: "Console" },
  { icon: Database, label: "Backend" },
  { icon: DollarSign, label: "Monetization" },
  { icon: Sparkles, label: "AI & Env Keys" },
  { icon: ImageIcon, label: "Assets" },
  { icon: BookOpenIcon, label: "Knowledge" },
  { icon: Rocket, label: "Deployments" },
  { icon: Layers, label: "Figma Import" },
  { icon: Smartphone, label: "Code Export" },
  { icon: History, label: "Ver. History" },
  { icon: LifeBuoy, label: "Get Support" },
  { icon: Settings, label: "Settings" },
];

function ProjectPage() {
  const { status } = useRequiredSession();
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const agentStorageKey = `mobivable:selectedAgent:${projectId}`;
  const [selectedAgent, setSelectedAgent] = useState<AgentRole>(() => {
    if (typeof window === "undefined") return "product_manager";
    const saved = window.localStorage.getItem(`mobivable:selectedAgent:${projectId}`);
    return saved && (ALL_ROLES as string[]).includes(saved)
      ? (saved as AgentRole)
      : "product_manager";
  });
  const agentHydratedRef = useRef(false);
  // Hydrate from localStorage immediately, then reconcile with the cloud-synced value.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(agentStorageKey);
    const local: AgentRole =
      saved && (ALL_ROLES as string[]).includes(saved)
        ? (saved as AgentRole)
        : "product_manager";
    setSelectedAgent(local);
    agentHydratedRef.current = true;

    // Pull the user's account-synced preference (RLS scopes to current user).
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{ data: { selected_agent: string } | null }>;
              };
            };
          };
        };
      })
        .from("user_project_prefs")
        .select("selected_agent")
        .eq("user_id", uid)
        .eq("project_id", projectId)
        .maybeSingle();
      const remote = data?.selected_agent;
      if (remote && (ALL_ROLES as string[]).includes(remote) && remote !== local) {
        setSelectedAgent(remote as AgentRole);
        window.localStorage.setItem(agentStorageKey, remote);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Persist locally + to the account-synced table after hydration.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!agentHydratedRef.current) return;
    window.localStorage.setItem(agentStorageKey, selectedAgent);
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("user_project_prefs")
        .upsert(
          { user_id: uid, project_id: projectId, selected_agent: selectedAgent },
          { onConflict: "user_id,project_id" },
        );
    })();
  }, [agentStorageKey, selectedAgent, projectId]);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [paneTab, setPaneTab] = useState<"preview" | "code" | "agents" | "export" | "screenshots">("preview");
  const { theme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserEmail(data.user?.email ?? "");
      if (data.user?.id) {
        const { data: prof } = await (supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{ data: { plan: string | null } | null }>;
              };
            };
          };
        })
          .from("profiles")
          .select("plan")
          .eq("id", data.user.id)
          .maybeSingle();
        setUserPlan(prof?.plan ?? null);

        // Check if user is an admin — admins get all features
        const { data: adminRow } = await (supabase as any)
          .from("user_roles")
          .select("id")
          .eq("user_id", data.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (adminRow) setIsAdmin(true);
      }
    });
  }, []);
  const isPro = userPlan === "pro" || isAdmin;
  const [sidePanel, setSidePanel] = useState<null | "backend" | "env" | "assets" | "code" | "console" | "monetization" | "history" | "support" | "settings" | "aistudio" | "knowledge" | "deployments" | "code_export" | "figma" | "components">(null);
  const { entries: consoleEntries, addEntry: addConsoleEntry, clear: clearConsole } = useConsoleCapture();
  const [appAssets, setAppAssets] = useState<{ icon: string | null; splash: string | null }>({ icon: null, splash: null });
  const [assetsTick, setAssetsTick] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [agentsMdOpen, setAgentsMdOpen] = useState(false);
  const [exportingExpo, setExportingExpo] = useState(false);
  const [projectIntegration, setProjectIntegration] = useState<{ supabase_url: string | null; supabase_anon_key: string | null }>({ supabase_url: null, supabase_anon_key: null });
  const recentTemplatesKey = `mobivable:recentTemplates:${projectId}`;
  const [recentTemplates, setRecentTemplates] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(`mobivable:recentTemplates:${projectId}`);
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  });
  const recordTemplateUse = (role: AgentRole, tpl: string) => {
    setRecentTemplates((prev) => {
      const existing = prev[role] ?? [];
      const next = [tpl, ...existing.filter((t) => t !== tpl)].slice(0, 5);
      const updated = { ...prev, [role]: next };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(recentTemplatesKey, JSON.stringify(updated));
        } catch {
          // ignore quota errors
        }
      }
      return updated;
    });
  };
  const [messages, setMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string; pending?: boolean; agentRole?: AgentRole | null; agentName?: string; phase?: string }[]
  >([]);
  const [teamBanner, setTeamBanner] = useState<{ phaseLabel: string; agents: { role: AgentRole; name: string }[] } | null>(null);
  const [input, setInput] = useState("");
  const typedHint = useTypewriter(APP_TYPED_PHRASES, !input);
  const [plusOpen, setPlusOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const draftStorageKey = (role: AgentRole) => `mobivable:chatDraft:${projectId}:${role}`;
  const draftHydratedRef = useRef(false);
  // When the selected agent changes (or on mount), restore that role's draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(draftStorageKey(selectedAgent));
    setInput(saved ?? "");
    // Mark hydrated on next tick so the persist effect doesn't immediately overwrite.
    draftHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent, projectId]);
  // Persist the current draft per agent role.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftHydratedRef.current) return;
    const key = draftStorageKey(selectedAgent);
    if (input) window.localStorage.setItem(key, input);
    else window.localStorage.removeItem(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, selectedAgent, projectId]);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"build" | "plan">("build");
  const [modeOpen, setModeOpen] = useState(false);
  const [visualEdit, setVisualEdit] = useState(false);
  const [selectedEl, setSelectedEl] = useState<
    { tag: string; text: string; classes: string; path: number[] } | null
  >(null);
  const [editText, setEditText] = useState("");
  const [editClasses, setEditClasses] = useState("");
  const [editStyles, setEditStyles] = useState<VisualStyles>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const selectedElRef = useRef<HTMLElement | null>(null);
  const selectedOrigRef = useRef<{ text: string; classes: string; styles: VisualStyles } | null>(null);
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const visualEditsRef = useRef<VisualEdit[]>([]);
  const reordersRef = useRef<Record<string, number[]>>({});
  const dragSrcRef = useRef<HTMLElement | null>(null);
  const historyPastRef = useRef<VisualSnapshot[]>([]);
  const historyFutureRef = useRef<VisualSnapshot[]>([]);
  const [, setHistoryTick] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [deviceOS, setDeviceOS] = useState<"ios" | "android">("ios");
  const [genAssetsState, setGenAssetsState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [genAssetsMsg, setGenAssetsMsg] = useState<string>("");
  // Drag-and-drop editing: live schema overrides + active screen tracked from renderer.
  const [liveSchema, setLiveSchema] = useState<MobileAppSchema | null>(null);
  const [liveSchemaResultId, setLiveSchemaResultId] = useState<string | null>(null);
  const [activeScreenId, setActiveScreenId] = useState<string>("");
  const [dropFlash, setDropFlash] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [demoApp, setDemoApp] = useState<string>("fittrack");
  const [newClassInput, setNewClassInput] = useState("");
  type PendingAttachment = {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    progress: number;
    status: "uploading" | "ready" | "error";
    error?: string;
    previewUrl?: string;
    extractedText?: string;
    extractError?: string;
  };
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generateFn = useServerFn(generateProject);
  const chatFn = useServerFn(sendProjectMessage);
  const exportExpoFn = useServerFn(exportExpoProject);

  const handleExportExpo = async () => {
    setExportingExpo(true);
    try {
      const res = await exportExpoFn({ data: { projectId } });
      if (res.ok) {
        const a = document.createElement("a");
        a.href = res.url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        alert(`Export failed: ${res.error}`);
      }
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setExportingExpo(false);
    }
  };
  const triggeredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef(false);
  const streamRef = useRef<AsyncIterator<unknown> | null>(null);
  // Apply theme extracted from the UI/UX Designer's spec (matches the generated mockup).
  useEffect(() => {
    const handler = (e: Event) => {
      const theme = (e as CustomEvent).detail;
      if (!theme || typeof theme !== "object") return;
      setLiveSchema((prev) => {
        const base = prev ?? (project?.result ? parseAppSchema(project.result) : null) ?? SAMPLE_APPS[demoApp] ?? SAMPLE_FITTRACK;
        const prevTheme = typeof base.theme === "object" ? base.theme : {};
        return { ...base, theme: { ...prevTheme, ...theme } } as MobileAppSchema;
      });
    };
    window.addEventListener("mobile-theme-extracted", handler);
    return () => window.removeEventListener("mobile-theme-extracted", handler);
  }, [project?.result, demoApp]);


  // Load latest icon/splash URLs so the generated app config can reference them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data: files } = await supabase.storage
        .from("project-attachments")
        .list(`${uid}/${projectId}`, { limit: 100 });
      if (cancelled) return;
      const find = (k: "icon" | "splash") =>
        files?.find((f) => f.name === `${k}.png` || f.name === `${k}.jpg`);
      const toUrl = (f?: { name: string }) =>
        f
          ? supabase.storage
              .from("project-attachments")
              .getPublicUrl(`${uid}/${projectId}/${f.name}`).data.publicUrl
          : null;
      setAppAssets({ icon: toUrl(find("icon")), splash: toUrl(find("splash")) });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, assetsTick]);

  const { config: previewConfig } = usePreviewConfig();
  // Dynamic table/column names from admin config — bypass generated types.
  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: unknown) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
        order: (c: string, o: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };

  async function reloadProject() {
    const detailSelect = aliasedSelect(previewConfig.projectDetailFields);
    const { data, error } = await sb
      .from(previewConfig.projectsTable)
      .select(`${detailSelect}, attachments, error_text, visual_edits`)
      .eq(previewConfig.projectDetailFields.id, projectId)
      .maybeSingle();
    if (error) setError(error.message);
    const row = data as (Project & { created_at: string }) | null;
    setProject(row);
    const ve = row?.visual_edits;
    historyPastRef.current = (ve?.past ?? []).map((s) => ({
      edits: s.edits ?? [],
      reorders: s.reorders ?? {},
    }));
    historyFutureRef.current = (ve?.future ?? []).map((s) => ({
      edits: s.edits ?? [],
      reorders: s.reorders ?? {},
    }));
    setHistoryTick((t) => t + 1);
    setLoading(false);
    // Also load Supabase integration config for export
    try {
      const { data: u } = await supabase.auth.getUser();
      if (u?.user?.id) {
        const { data: integ } = await (sb as any)
          .from("project_integrations")
          .select("supabase_url,supabase_anon_key")
          .eq("project_id", projectId)
          .eq("user_id", u.user.id)
          .maybeSingle();
        if (integ) setProjectIntegration(integ);
      }
    } catch { /* non-critical */ }
    return row;
  }



  const generateImagesFn = useServerFn(generateAppImages);

  async function runGeneration() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await generateFn({ data: { projectId } });
      if (!res.ok) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
      await reloadProject();
      // Kick off image generation in the background; reload when done.
      generateImagesFn({ data: { projectId } })
        .then(() => reloadProject())
        .catch((e) => console.error("[appImages]", e));
    }
  }

  async function regenerateAssets() {
    if (genAssetsState === "running") return;
    setGenAssetsState("running");
    setGenAssetsMsg("");
    try {
      const res = await generateImagesFn({ data: { projectId } });
      if (res && "ok" in res && res.ok) {
        setGenAssetsState("done");
        setGenAssetsMsg(`Generated ${res.generated} • cached ${res.cached}${res.failed ? ` • failed ${res.failed}` : ""}`);
        await reloadProject();
        setTimeout(() => setGenAssetsState("idle"), 4000);
      } else {
        setGenAssetsState("error");
        setGenAssetsMsg("ok" in (res ?? {}) && !(res as { ok: boolean }).ok ? (res as { error?: string }).error ?? "Failed" : "Failed");
        setTimeout(() => setGenAssetsState("idle"), 5000);
      }
    } catch (e) {
      setGenAssetsState("error");
      setGenAssetsMsg(e instanceof Error ? e.message : "Failed");
      setTimeout(() => setGenAssetsState("idle"), 5000);
    }


  async function loadMessages() {
    const msgSelect = aliasedSelect({
      id: previewConfig.messagesFields.id,
      role: previewConfig.messagesFields.role,
      content: previewConfig.messagesFields.content,
    });
    const { data } = await sb
      .from(previewConfig.messagesTable)
      .select(msgSelect)
      .eq(previewConfig.messagesFields.projectFk, projectId)
      .order(previewConfig.messagesFields.createdAt, { ascending: true });
    setMessages(
      ((data as { id: string; role: "user" | "assistant"; content: string }[] | null) ?? []).map((m) => {
        if (m.role !== "assistant") return { id: m.id, role: m.role, content: m.content };
        const { role, text } = parseAgentMarker(m.content);
        // legacy fallback: old messages used `**🤖 Name** *(Phase)*` prefix
        const legacy = text.match(/^\*\*🤖 ([^*]+)\*\*\s*(?:\*\(([^)]+)\)\*)?\s*\n+/);
        const cleaned = legacy ? text.slice(legacy[0].length) : text;
        return {
          id: m.id,
          role: m.role,
          content: cleaned,
          agentRole: role,
          agentName: role ? AGENTS[role].name : legacy?.[1],
          phase: legacy?.[2],
        };
      }),
    );
  }

  function handleCancel() {
    cancelRef.current = true;
    streamRef.current?.return?.(undefined);
  }

  function isExtractable(file: File) {
    if (file.size > 200 * 1024) return false;
    if (file.type.startsWith("text/")) return true;
    if (/\.(txt|md|markdown|json|csv|tsv|log|ya?ml|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|java|c|cc|cpp|h|sh|sql|env)$/i.test(file.name)) return true;
    if (file.type === "application/json") return true;
    return false;
  }

  async function uploadOne(file: File, uid: string, token: string) {
    const id = crypto.randomUUID();
    const path = `${uid}/${projectId}/${id}-${file.name}`;
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
    const entry: PendingAttachment = {
      id,
      name: file.name,
      url: "",
      type: file.type || "file",
      size: file.size,
      progress: 0,
      status: "uploading",
      previewUrl,
    };
    setPending((p) => [...p, entry]);

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
    const endpoint = `${supabaseUrl}/storage/v1/object/project-attachments/${path}`;

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint, true);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("x-upsert", "false");
      if (file.type) xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setPending((p) => p.map((x) => (x.id === id ? { ...x, progress: pct } : x)));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data: pub } = supabase.storage.from("project-attachments").getPublicUrl(path);
          setPending((p) =>
            p.map((x) =>
              x.id === id
                ? { ...x, url: pub.publicUrl, progress: 100, status: "ready" }
                : x,
            ),
          );
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            const j = JSON.parse(xhr.responseText);
            if (j?.message) msg = j.message;
          } catch {
            /* ignore */
          }
          setPending((p) =>
            p.map((x) => (x.id === id ? { ...x, status: "error", error: msg } : x)),
          );
        }
        resolve();
      };
      xhr.onerror = () => {
        setPending((p) =>
          p.map((x) =>
            x.id === id ? { ...x, status: "error", error: "Network error" } : x,
          ),
        );
        resolve();
      };
      xhr.send(file);
    });

    if (isExtractable(file)) {
      try {
        const text = await file.text();
        setPending((p) =>
          p.map((x) =>
            x.id === id ? { ...x, extractedText: text.slice(0, 20000) } : x,
          ),
        );
      } catch (e) {
        setPending((p) =>
          p.map((x) =>
            x.id === id
              ? { ...x, extractError: e instanceof Error ? e.message : "Extract failed" }
              : x,
          ),
        );
      }
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!uid || !token) throw new Error("Not authenticated");
      const accepted = Array.from(files).filter((f) => {
        if (f.size > 20 * 1024 * 1024) {
          setError(`${f.name} is over 20MB`);
          return false;
        }
        return true;
      });
      await Promise.all(accepted.map((f) => uploadOne(f, uid, token)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSend(e?: React.FormEvent | { preventDefault?: () => void }, overrideText?: string) {
    e?.preventDefault?.();
    const raw = (overrideText ?? input).trim();
    const readyAttachments = pending.filter((p) => p.status === "ready");
    if ((!raw && readyAttachments.length === 0) || sending) return;
    const attachBlock = readyAttachments.length
      ? `\n\nAttachments:\n${readyAttachments.map((p) => `- [${p.name}](${p.url})`).join("\n")}`
      : "";
    const extractedBlocks = readyAttachments
      .filter((p) => p.extractedText)
      .map((p) => `\n\n--- File: ${p.name} ---\n${p.extractedText}\n--- end ---`)
      .join("");
    const base = raw || "(see attachments)";
    const content = selectedEl
      ? `[Visual edit target: <${selectedEl.tag}>${selectedEl.text ? ` "${selectedEl.text}"` : ""}]\n\n${base}${attachBlock}${extractedBlocks}`
      : `${base}${attachBlock}${extractedBlocks}`;
    cancelRef.current = false;
    setSending(true);
    setInput("");
    selectedElRef.current?.classList.remove("visual-edit-selected");
    selectedElRef.current?.removeAttribute("draggable");
    selectedElRef.current = null;
    setSelectedEl(null);
    setPending([]);
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content },
    ]);
    setTeamBanner(null);
    try {
      const stream = await chatFn({ data: { projectId, content, agentRole: selectedAgent } });
      streamRef.current = stream as unknown as AsyncIterator<unknown>;
      let activeAgentMsgId: string | null = null;
      let errored = false;
      for await (const event of stream) {
        if (cancelRef.current) break;
        if (event.type === "team_assembled") {
          setTeamBanner({ phaseLabel: event.phaseLabel, agents: event.agents });
        } else if (event.type === "agent_start") {
          activeAgentMsgId = `${tempId}-${event.role}-${Date.now()}`;
          const id = activeAgentMsgId;
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: "assistant",
              content: "",
              pending: true,
              agentRole: event.role as AgentRole,
              agentName: event.name,
              phase: event.phase,
            },
          ]);
        } else if (event.type === "delta") {
          const id = activeAgentMsgId;
          if (!id) continue;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, content: m.content + event.delta, pending: false } : m,
            ),
          );
        } else if (event.type === "agent_done") {
          activeAgentMsgId = null;
        } else if (event.type === "agent_error") {
          errored = true;
          const id = activeAgentMsgId;
          if (id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? { ...m, content: `⚠️ ${event.error}`, pending: false } : m)),
            );
          }
        } else if (event.type === "error") {
          errored = true;
          setMessages((prev) => [
            ...prev,
            { id: `${tempId}-err`, role: "assistant", content: `⚠️ ${event.error}` },
          ]);
        } else if (event.type === "project_updated") {
          await reloadProject();
        }
      }
      if (!errored && !cancelRef.current) {
        await loadMessages();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${tempId}-err`,
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : "Failed to send"}`,
        },
      ]);
    } finally {
      streamRef.current = null;
      cancelRef.current = false;
      setSending(false);
      setTeamBanner(null);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    loadMessages();
    (async () => {
      const p = await reloadProject();
      if (p && p.status === "building" && !p.result && !triggeredRef.current) {
        triggeredRef.current = true;
        runGeneration();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, project?.result]);

  // Realtime: pick up assistant messages inserted from outside this component
  // (e.g. agent orchestration completion notice).
  useEffect(() => {
    if (status !== "authenticated") return;
    const ch = supabase
      .channel(`project_messages_${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "project_messages", filter: `project_id=eq.${projectId}` },
        () => { void loadMessages(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status]);

  // Apply persisted visual edits to the rendered preview
  useEffect(() => {
    const edits = project?.visual_edits?.edits ?? [];
    const reorders = project?.visual_edits?.reorders ?? {};
    visualEditsRef.current = edits;
    reordersRef.current = { ...reorders };
    const root = previewRootRef.current;
    if (!root) return;
    const id = requestAnimationFrame(() => {
      // 1) Tag every element with its original child index (once)
      const tag = (el: HTMLElement) => {
        Array.from(el.children).forEach((c, i) => {
          const child = c as HTMLElement;
          if (child.dataset.origIdx === undefined) {
            child.dataset.origIdx = String(i);
          }
          tag(child);
        });
      };
      tag(root);

      // 2) Replay reorders by reattaching children in the recorded original-index order
      for (const [key, order] of Object.entries(reorders)) {
        const parentPath = key === "" ? [] : key.split(".").map(Number);
        const parent = resolvePath(root, parentPath);
        if (!parent) continue;
        const byOrig = new Map<number, HTMLElement>();
        Array.from(parent.children).forEach((c) => {
          const child = c as HTMLElement;
          const idx = Number(child.dataset.origIdx);
          if (!Number.isNaN(idx)) byOrig.set(idx, child);
        });
        for (const orig of order) {
          const child = byOrig.get(orig);
          if (child) parent.appendChild(child);
        }
      }

      // 3) Apply text / classes / styles
      for (const edit of edits) {
        const el = resolvePath(root, edit.path);
        if (!el) continue;
        if (typeof edit.classes === "string") el.className = edit.classes;
        if (typeof edit.text === "string" && el.children.length === 0) {
          el.textContent = edit.text;
        }
        if (edit.styles) {
          for (const k of STYLE_KEYS) {
            const v = edit.styles[k];
            if (typeof v === "string") {
              (el.style as unknown as Record<string, string>)[STYLE_CSS[k]] = v;
            }
          }
        }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [project?.visual_edits, project?.status, project?.result]);

  // Live-preview style edits on the selected element
  useEffect(() => {
    const el = selectedElRef.current;
    if (!el) return;
    for (const k of STYLE_KEYS) {
      const v = editStyles[k];
      const css = STYLE_CSS[k];
      if (typeof v === "string" && v !== "") {
        (el.style as unknown as Record<string, string>)[css] = v;
      } else {
        el.style.removeProperty(css.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
      }
    }
  }, [editStyles]);

  // Live-preview text edits on the selected element
  useEffect(() => {
    const el = selectedElRef.current;
    if (!el || !selectedEl) return;
    if (el.children.length === 0 && el.textContent !== editText) {
      el.textContent = editText;
    }
  }, [editText, selectedEl]);

  // Live-preview class edits on the selected element (preserve selected outline)
  useEffect(() => {
    const el = selectedElRef.current;
    if (!el || !selectedEl) return;
    const cls = editClasses.split(/\s+/).filter(Boolean);
    if (!cls.includes("visual-edit-selected")) cls.push("visual-edit-selected");
    const next = cls.join(" ");
    if (el.className !== next) el.className = next;
  }, [editClasses, selectedEl]);

  async function saveEdit() {
    if (!selectedEl || !selectedElRef.current) return;
    setSavingEdit(true);
    try {
      const el = selectedElRef.current;
      const newText = editText;
      const newClasses = editClasses;
      // Apply to DOM (preserve the selected outline class)
      if (el.children.length === 0 && newText !== el.textContent) {
        el.textContent = newText;
      }
      const cls = newClasses.split(/\s+/).filter(Boolean);
      if (!cls.includes("visual-edit-selected")) cls.push("visual-edit-selected");
      el.className = cls.join(" ");

      const cleaned = cls.filter((c) => c !== "visual-edit-selected").join(" ");
      const existing = visualEditsRef.current.filter(
        (e) => pathKey(e.path) !== pathKey(selectedEl.path),
      );
      const stylesClean: VisualStyles = {};
      for (const k of STYLE_KEYS) {
        const v = editStyles[k];
        if (typeof v === "string" && v !== "") stylesClean[k] = v;
      }
      const next: VisualEdit[] = [
        ...existing,
        { path: selectedEl.path, text: newText, classes: cleaned, styles: stylesClean },
      ];
      visualEditsRef.current = next;
      await persistVisualEdits(next, reordersRef.current);
    } finally {
      setSavingEdit(false);
    }
  }

  async function persistVisualEdits(
    edits: VisualEdit[],
    reorders: Record<string, number[]>,
    recordHistory = true,
  ) {
    if (recordHistory) {
      const prev = project?.visual_edits;
      const prevSnap: VisualSnapshot = {
        edits: prev?.edits ?? [],
        reorders: prev?.reorders ?? {},
      };
      historyPastRef.current.push(prevSnap);
      if (historyPastRef.current.length > 50) historyPastRef.current.shift();
      historyFutureRef.current = [];
      setHistoryTick((t) => t + 1);
    }
    const payload: VisualEditMap = {
      edits,
      reorders,
      past: historyPastRef.current.slice(-50),
      future: historyFutureRef.current.slice(-50),
    };
    const { error: upErr } = await supabase
      .from("projects")
      .update({ visual_edits: payload })
      .eq("id", projectId);
    if (upErr) {
      setError(upErr.message);
    } else {
      setProject((p) => (p ? { ...p, visual_edits: payload } : p));
    }
  }

  async function applyHistorySnapshot(snap: VisualSnapshot) {
    setSelectedEl(null);
    selectedElRef.current = null;
    setPreviewKey((k) => k + 1);
    await persistVisualEdits(snap.edits, snap.reorders, false);
  }

  function currentSnapshot(): VisualSnapshot {
    const ve = project?.visual_edits;
    return { edits: ve?.edits ?? [], reorders: ve?.reorders ?? {} };
  }

  async function undoVisualEdit() {
    const past = historyPastRef.current;
    if (!past.length) return;
    const snap = past.pop()!;
    historyFutureRef.current.push(currentSnapshot());
    setHistoryTick((t) => t + 1);
    await applyHistorySnapshot(snap);
  }

  async function redoVisualEdit() {
    const future = historyFutureRef.current;
    if (!future.length) return;
    const snap = future.pop()!;
    historyPastRef.current.push(currentSnapshot());
    setHistoryTick((t) => t + 1);
    await applyHistorySnapshot(snap);
  }

  if (status !== "authenticated") return <AuthHydrating />;

  const isBuilding = !!project && (project.status === "building" || generating);
  const isReady = !!project && project.status === "ready" && !!project.result;
  const isFailed = !!project && project.status === "failed";

  return (
    <div className="min-h-screen lg:h-screen w-full lg:overflow-hidden bg-background text-foreground flex flex-col">
      {/* Top header bar */}
      <header className="shrink-0 h-14 border-b border-border bg-background flex items-center gap-3 px-3 lg:px-4">
        <Link
          to="/dashboard"
          className="h-9 w-9 grid place-items-center rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <button
          type="button"
          className="h-9 w-9 grid place-items-center rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-full bg-primary/20 grid place-items-center shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>
          <h1 className="font-display text-base lg:text-lg tracking-tight truncate">
            {project?.name ?? "Loading…"}
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-1.5 lg:gap-2">
          <CreditBadge />
          <button
            type="button"
            onClick={() => { if (!isPro) setUpgradeOpen(true); else toast.info("You're already on Pro!"); }}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-full bg-primary text-primary-foreground text-xs lg:text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Crown className="h-3.5 w-3.5" />
            Upgrade
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-full border border-border text-xs lg:text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          <button
            type="button"
            onClick={() => setAgentsMdOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-full border border-border text-xs lg:text-sm font-medium hover:bg-muted/50 transition-colors"
            title="View Agents.md"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Agents.md
          </button>
          <button
            type="button"
            onClick={handleExportExpo}
            disabled={exportingExpo}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-full border border-border text-xs lg:text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-50"
            title="Download a complete Expo (React Native) project"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingExpo ? "Packaging…" : "Export Expo"}
          </button>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-full border border-border text-xs lg:text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Publish
          </button>
          <button
            type="button"
            onClick={() => setPaneTab("export")}
            className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 lg:px-4 rounded-full border border-border text-xs lg:text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>

          {/* Theme toggle */}
          <div className="ml-1 flex items-center rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setTheme("light")}
              aria-label="Light theme"
              aria-pressed={theme === "light"}
              className={`h-7 w-7 grid place-items-center rounded-full transition-colors ${
                theme === "light" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              aria-label="Dark theme"
              aria-pressed={theme === "dark"}
              className={`h-7 w-7 grid place-items-center rounded-full transition-colors ${
                theme === "dark" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-full border border-border hover:bg-muted/50 transition-colors"
            >
              <span className="h-6 w-6 rounded-full bg-primary/20 text-primary grid place-items-center text-[11px] font-semibold uppercase">
                {(userEmail[0] ?? "U")}
              </span>
              <span className="hidden sm:inline text-xs font-medium truncate max-w-[100px]">
                {userEmail ? userEmail.split("@")[0] : "Account"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {userMenuOpen && (
              <div
                className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-border bg-card shadow-lg p-1"
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium truncate">{userEmail || "—"}</p>
                </div>
                <Link
                  to="/dashboard"
                  className="block px-3 py-2 text-sm rounded-md hover:bg-muted/50"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/login";
                  }}
                  className="block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted/50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 w-full lg:overflow-hidden flex flex-col lg:flex-row pb-16 lg:pb-0">
      {/* Left rail */}
      <aside className="hidden lg:flex w-52 shrink-0 border-r border-border flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Link
            to="/dashboard"
            className="font-display text-sm uppercase tracking-wider hover:text-primary transition-colors"
          >
            Mobivable Agentic Mobile Studio
          </Link>
        </div>
        <div className="p-3">
          <Link
            to="/"
            className="block w-full text-center px-4 py-2 rounded-full border border-primary/40 text-primary font-display text-xs uppercase tracking-wider hover:bg-primary/10 transition-colors"
          >
            + New Project
          </Link>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-0.5">
          {SIDE_ITEMS.map(({ icon: Icon, label }) => {
            const isActive =
              (label === "Chat" && sidePanel === null) ||
              (label === "Components" && sidePanel === "components") ||
              (label === "AI Studio" && sidePanel === "aistudio") ||
              (label === "Code" && sidePanel === "code") ||
              (label === "Console" && sidePanel === "console") ||
              (label === "Backend" && sidePanel === "backend") ||
              (label === "Monetization" && sidePanel === "monetization") ||
              (label === "AI & Env Keys" && sidePanel === "env") ||
              (label === "Assets" && sidePanel === "assets") ||
              (label === "Knowledge" && sidePanel === "knowledge") ||
              (label === "Deployments" && sidePanel === "deployments") ||
              (label === "Figma Import" && sidePanel === "figma") ||
              (label === "Code Export" && sidePanel === "code_export") ||
              (label === "Ver. History" && sidePanel === "history") ||
              (label === "Get Support" && sidePanel === "support") ||
              (label === "Settings" && sidePanel === "settings");
            const locked = label === "Backend" && !isPro;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label === "Backend") {
                    if (!isPro) setUpgradeOpen(true);
                    else setSidePanel("backend");
                  } else if (label === "Components") {
                    setSidePanel("components");
                  } else if (label === "AI Studio") {
                    setSidePanel("aistudio");
                  } else if (label === "AI & Env Keys") {
                    setSidePanel("env");
                  } else if (label === "Assets") {
                    setSidePanel("assets");
                  } else if (label === "Code") {
                    setSidePanel("code");
                  } else if (label === "Console") {
                    setSidePanel("console");
                  } else if (label === "Monetization") {
                    setSidePanel("monetization");
                  } else if (label === "Knowledge") {
                    setSidePanel("knowledge");
                  } else if (label === "Deployments") {
                    setSidePanel("deployments");
                  } else if (label === "Figma Import") {
                    setSidePanel("figma");
                  } else if (label === "Code Export") {
                    setSidePanel("code_export");
                  } else if (label === "Ver. History") {
                    setSidePanel("history");
                  } else if (label === "Get Support") {
                    setSidePanel("support");
                  } else if (label === "Settings") {
                    setSidePanel("settings");
                  } else if (label === "Chat") setSidePanel(null);
                }}
                title={locked ? "Backend is a Pro feature" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{label}</span>
                {locked && (
                  <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                    Pro
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Chat thread */}
      <section className={`${sidePanel !== null ? "hidden" : mobileView === "chat" ? "flex" : "hidden"} ${sidePanel !== null ? "lg:hidden" : "lg:flex"} flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col`}>
        <header className="p-4 border-b border-border flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-primary/20 grid place-items-center">
            <span className="h-2 w-2 rounded-full bg-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg uppercase tracking-tight truncate">
              {project?.name ?? "Loading…"}
            </h1>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary truncate inline-flex items-center gap-1 transition-colors"
                  title="Switch agent"
                >
                  Talking to · <span className="text-primary">{AGENTS[selectedAgent].name}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <p className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Select an agent
                </p>
                <div className="max-h-80 overflow-y-auto space-y-0.5">
                  {ALL_ROLES.map((role) => {
                    const a = AGENTS[role];
                    const active = role === selectedAgent;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setSelectedAgent(role)}
                        title={a.short}
                        className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors border ${
                          active
                            ? "bg-primary/15 text-primary border-primary/40"
                            : "border-transparent hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              active ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className={`truncate ${active ? "font-semibold" : "font-medium"}`}>
                            {a.name}
                          </span>
                          {active && (
                            <span className="ml-auto shrink-0 text-[9px] font-mono uppercase tracking-widest text-primary">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 pl-3.5 truncate">
                          {a.short}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* SDLC phase progress — full team pipeline */}
        <SDLCProgressBar projectId={projectId} />



        {/* Agent brief: functionalities + templates */}
        {(() => {
          const a = AGENTS[selectedAgent];
          const templates = AGENT_TEMPLATES[selectedAgent] ?? [];
          const recents = recentTemplates[selectedAgent] ?? [];
          const rest = templates.filter((t) => !recents.includes(t));
          const renderRow = (tpl: string, isRecent: boolean) => (
            <div
              key={`${isRecent ? "r" : "t"}:${tpl}`}
              className={`group flex items-stretch gap-1 rounded-md border ${isRecent ? "border-primary/40 bg-primary/5" : "border-border bg-background"} hover:border-primary/50 transition-colors overflow-hidden`}
            >
              <button
                type="button"
                onClick={() => {
                  setInput(tpl);
                  recordTemplateUse(selectedAgent, tpl);
                }}
                title="Insert into chat input"
                className="flex-1 text-left text-xs px-3 py-2 hover:bg-primary/5 transition-colors"
              >
                {tpl}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  recordTemplateUse(selectedAgent, tpl);
                  handleSend(undefined, tpl);
                }}
                title="Send now"
                aria-label="Send template"
                className="px-2.5 grid place-items-center border-l border-border text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          );
          return (
            <div className="px-4 py-3 border-b border-border bg-card/40">
              <div className="flex items-start gap-2">
                <div className="h-6 w-6 rounded-md bg-primary/15 grid place-items-center shrink-0">
                  <Users className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-sm leading-tight">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{a.short}</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                  Functionalities
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.tasks.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/30 bg-primary/5 text-primary/90"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {recents.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Recent
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRecentTemplates((prev) => {
                          const updated = { ...prev, [selectedAgent]: [] };
                          if (typeof window !== "undefined") {
                            try {
                              window.localStorage.setItem(recentTemplatesKey, JSON.stringify(updated));
                            } catch {
                              // ignore
                            }
                          }
                          return updated;
                        });
                      }}
                      className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {recents.map((tpl) => renderRow(tpl, true))}
                  </div>
                </div>
              )}
              {rest.length > 0 && (
                <div className="mt-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    {recents.length > 0 ? "More templates" : "Templates"}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {rest.map((tpl) => renderRow(tpl, false))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              [···] Loading
            </p>
          )}

          {!loading && !project && (
            <p className="text-sm text-muted-foreground">
              {error ?? "Project not found."}
            </p>
          )}

          {project && (
            <>
              {/* Initial user prompt */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl border border-primary/30 bg-card p-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {project.prompt}
                  </p>
                  {project.attachments && project.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {project.attachments.map((a) => (
                        <a
                          key={a.path}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="h-16 w-16 rounded-md overflow-hidden border border-border"
                        >
                          <img
                            src={a.url}
                            alt={a.name}
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(project.created_at).toLocaleTimeString()} ·{" "}
                    {project.model}
                  </p>
                </div>
              </div>

              {/* Initial plan from generation */}
              {(isBuilding || isFailed || (isReady && project.result)) && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] w-full rounded-2xl border border-border bg-card/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          isFailed
                            ? "bg-destructive"
                            : isBuilding
                              ? "bg-primary animate-pulse"
                              : "bg-primary"
                        }`}
                      />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {isFailed ? "Failed" : isBuilding ? "Building plan…" : "Plan ready"}
                      </span>
                    </div>

                    {isBuilding && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Running through {project.model}…</span>
                      </div>
                    )}

                    {isFailed && (
                      <div className="space-y-3">
                        <p className="text-sm text-destructive">
                          {project.error_text ?? error ?? "Generation failed."}
                        </p>
                        <button
                          onClick={runGeneration}
                          disabled={generating}
                          className="inline-flex items-center gap-2 px-3 py-1.5 border border-border text-[11px] font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" /> Retry
                        </button>
                      </div>
                    )}

                    {isReady && project.result && (
                      <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary">
                        <ReactMarkdown>{project.result}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Team chat messages (multi-agent) */}
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl border border-primary/30 bg-card p-3">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      </div>
                    </div>
                  );
                }
                const role = m.agentRole;
                const badge = role ? AGENT_BADGE[role] : null;
                const name = m.agentName ?? (role ? AGENTS[role].name : "Assistant");
                return (
                  <div key={m.id} className="flex justify-start gap-2">
                    <div
                      className={`h-8 w-8 shrink-0 rounded-full border grid place-items-center text-base ${
                        badge?.tint ?? "bg-muted/40 text-muted-foreground border-border"
                      }`}
                      aria-hidden
                    >
                      {badge?.emoji ?? "🤖"}
                    </div>
                    <div className="max-w-[85%] w-full rounded-2xl border border-border bg-card/60 p-3">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded border ${badge?.tint ?? "border-border text-muted-foreground"}`}>
                          {name}
                        </span>
                        {m.phase && (
                          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
                            · {m.phase}
                          </span>
                        )}
                      </div>
                      {m.pending && !m.content ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{name} is thinking…</span>
                        </div>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary">
                          <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Live "team is collaborating" banner */}
              {teamBanner && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                      {teamBanner.phaseLabel} team is collaborating
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {teamBanner.agents.map((a) => {
                      const b = AGENT_BADGE[a.role];
                      return (
                        <span
                          key={a.role}
                          className={`inline-flex items-center gap-1 text-[10px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${b.tint}`}
                        >
                          <span aria-hidden>{b.emoji}</span>
                          {a.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>


        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="border-t border-border p-3 bg-background"
        >
          {selectedEl && (
            <div className="mb-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MousePointerClick className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-primary font-mono uppercase shrink-0">
                    {selectedEl.tag}
                  </span>
                  <span className="text-muted-foreground font-mono truncate">
                    {selectedEl.path.join(".")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    selectedElRef.current?.classList.remove("visual-edit-selected");
                    selectedElRef.current?.removeAttribute("draggable");
                    selectedElRef.current = null;
                    setSelectedEl(null);
                  }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Clear selection"
                >
                  ✕
                </button>
              </div>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Text
                </span>
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="(no text content)"
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:border-primary/60"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Classes
                </span>
                <input
                  value={editClasses}
                  onChange={(e) => setEditClasses(e.target.value)}
                  placeholder="tailwind classes"
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-primary/60"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-[11px] font-display uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save edit
                </button>
              </div>
            </div>
          )}
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((a) => {
                const thumb = a.previewUrl || (a.type.startsWith("image/") ? a.url : null);
                const ext = a.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE";
                const sizeKb = a.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(a.size / 1024))} KB`
                  : `${(a.size / (1024 * 1024)).toFixed(1)} MB`;
                return (
                  <div
                    key={a.id}
                    className={`relative flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs min-w-[180px] ${
                      a.status === "error"
                        ? "border-destructive/60 bg-destructive/10"
                        : "border-border bg-card/60"
                    }`}
                  >
                    {thumb ? (
                      <img src={thumb} alt={a.name} className="h-9 w-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 grid place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground shrink-0">
                        {ext}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="max-w-[140px] truncate font-medium">{a.name}</span>
                        {a.status === "uploading" && (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                        {a.status === "ready" && a.extractedText && (
                          <span className="text-[9px] uppercase tracking-wider text-primary">
                            extracted
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {a.status === "uploading"
                          ? `${a.progress}%`
                          : a.status === "error"
                          ? a.error || "Failed"
                          : sizeKb}
                      </div>
                      {a.status === "uploading" && (
                        <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${a.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPending((p) => {
                          const removed = p.find((x) => x.id === a.id);
                          if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
                          return p.filter((x) => x.id !== a.id);
                        });
                      }}
                      aria-label={`Remove ${a.name}`}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="rounded-3xl border border-border bg-card/80 backdrop-blur px-4 py-3 focus-within:border-primary/60 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={typedHint ? `Ask Mobivable to ${typedHint}` : "Ask Mobivable…"}
              disabled={sending || !project}
              className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-32 leading-relaxed"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPlusOpen((o) => !o)}
                    disabled={uploading || sending}
                    aria-label="Open chat menu"
                    aria-expanded={plusOpen}
                    className="h-8 w-8 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : plusOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </button>
                  {plusOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setPlusOpen(false)}
                        aria-hidden
                      />
                      <div
                        role="menu"
                        className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl p-1.5 z-20"
                      >
                        {(() => {
                          const goTo = (path: string) => {
                            setPlusOpen(false);
                            if (typeof window !== "undefined") window.location.assign(path);
                          };
                          const stub = (label: string) => () => {
                            setPlusOpen(false);
                            toast(label, { description: "Coming soon" });
                          };
                          const groups: Array<
                            Array<{
                              icon: typeof Settings;
                              label: string;
                              hint?: string;
                              chevron?: boolean;
                              onClick: () => void;
                            }>
                          > = [
                            [
                              {
                                icon: Settings,
                                label: "Settings",
                                hint: "Ctrl .",
                                onClick: () => goTo("/settings"),
                              },
                            ],
                            [
                              {
                                icon: History,
                                label: "History",
                                onClick: () => {
                                  setPlusOpen(false);
                                  setHistoryOpen(true);
                                },
                              },
                              {
                                icon: BookOpen,
                                label: "Knowledge",
                                onClick: () => {
                                  setPlusOpen(false);
                                  setKnowledgeOpen(true);
                                },
                              },
                              {
                                icon: Github,
                                label: "GitHub",
                                onClick: () => {
                                  setPlusOpen(false);
                                  setConnectorsOpen(true);
                                },
                              },
                              {
                                icon: Workflow,
                                label: "Connectors",
                                chevron: true,
                                onClick: () => {
                                  setPlusOpen(false);
                                  setConnectorsOpen(true);
                                },
                              },
                            ],
                            [
                              {
                                icon: Camera,
                                label: "Take a screenshot",
                                onClick: stub("Screenshot capture"),
                              },
                              {
                                icon: AtSign,
                                label: "Add reference",
                                onClick: stub("Add reference"),
                              },
                              {
                                icon: ClipboardList,
                                label: "Add skill",
                                onClick: stub("Skills"),
                              },
                              {
                                icon: Paperclip,
                                label: "Attach",
                                onClick: () => {
                                  setPlusOpen(false);
                                  fileInputRef.current?.click();
                                },
                              },
                            ],
                          ];
                          return groups.map((group, gi) => (
                            <div key={gi}>
                              {gi > 0 && <div className="my-1 h-px bg-border/60" />}
                              {group.map((item) => (
                                <button
                                  key={item.label}
                                  type="button"
                                  onClick={item.onClick}
                                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent transition-colors"
                                >
                                  <item.icon className="h-4 w-4 text-muted-foreground" />
                                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                                  {item.hint && (
                                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                                  )}
                                  {item.chevron && (
                                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </button>
                              ))}
                            </div>
                          ));
                        })()}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVisualEdit((v) => !v);
                    setSelectedEl(null);
                    if (!visualEdit) setMobileView("preview");
                  }}
                  className={`h-8 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
                    visualEdit
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  }`}
                >
                  <MousePointerClick className="h-3.5 w-3.5" />
                  <span>{visualEdit ? "Exit visual edits" : "Visual edits"}</span>
                </button>
              </div>
              <div className="flex items-center gap-2 relative">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setModeOpen((o) => !o)}
                    className="h-8 inline-flex items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="capitalize">{mode}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {modeOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-56 rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg p-1.5 z-10">
                      {(
                        [
                          { id: "build", label: "Build", hint: "Make changes directly" },
                          { id: "plan", label: "Plan", hint: "Discuss before building" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setMode(opt.id);
                            setModeOpen(false);
                          }}
                          className="w-full flex items-start gap-2 rounded-xl px-3 py-2 text-left hover:bg-accent transition-colors"
                        >
                          <Check
                            className={`h-4 w-4 mt-0.5 ${mode === opt.id ? "opacity-100" : "opacity-0"}`}
                          />
                          <div>
                            <div className="text-sm font-medium">{opt.label}</div>
                            <div className="text-xs text-muted-foreground">{opt.hint}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Voice input"
                  className="h-8 w-8 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Mic className="h-4 w-4" />
                </button>
                {sending ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    aria-label="Stop generating"
                    className="h-8 w-8 grid place-items-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={(!input.trim() && pending.filter((p) => p.status === "ready").length === 0) || !project || pending.some((p) => p.status === "uploading")}
                    aria-label="Send message"
                    className="h-8 w-8 grid place-items-center rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </section>

      {sidePanel === "backend" && isPro && (
        <BackendPanel projectId={projectId} onClose={() => setSidePanel(null)} />
      )}

      {sidePanel === "components" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <LayoutGrid className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Components</h2>
                <p className="text-[10px] text-muted-foreground truncate">Drag any block onto the phone preview</p>
              </div>
            </div>
            <button type="button" onClick={() => setSidePanel(null)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
              Close
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">
            <ComponentPalette variant="panel" />
          </div>
        </section>
      )}

      {sidePanel === "env" && (
        <EnvPanel projectId={projectId} onClose={() => setSidePanel(null)} />
      )}
      {sidePanel === "assets" && (
        <AssetsPanel projectId={projectId} onClose={() => setSidePanel(null)} onChanged={() => setAssetsTick((t) => t + 1)} />
      )}
      {sidePanel === "code" && (
        <CodeEditorPanel
          projectResult={project?.result ?? null}
          projectPrompt={project?.prompt ?? ""}
          projectModel={project?.model ?? ""}
          onClose={() => setSidePanel(null)}
        />
      )}
      {sidePanel === "console" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <Terminal className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Error Console</h2>
                <p className="text-[10px] text-muted-foreground truncate">Runtime logs and errors</p>
              </div>
            </div>
            <button type="button" onClick={() => setSidePanel(null)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
              Close
            </button>
          </header>
          <div className="flex-1 overflow-hidden">
            <ErrorConsolePanel entries={consoleEntries} onClear={clearConsole} onClose={() => setSidePanel(null)} />
          </div>
        </section>
      )}

      {sidePanel === "monetization" && (
        <MonetizationPanel
          projectId={projectId}
          onClose={() => setSidePanel(null)}
        />
      )}

      {/* ─── Version History Panel ─── */}
      {sidePanel === "history" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <History className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Version History</h2>
                <p className="text-[10px] text-muted-foreground truncate">Track changes & rollback</p>
              </div>
            </div>
            <button type="button" onClick={() => setSidePanel(null)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Close</button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-foreground">Current Version</span>
                <span className="text-[9px] font-mono text-muted-foreground ml-auto">{new Date().toLocaleDateString()}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Latest build with all agent modifications</p>
            </div>
            {[
              { label: "Initial Build", time: "Created", desc: "First generation from prompt" },
              { label: "Schema Generated", time: "Auto", desc: "App schema generated by AI agents" },
            ].map((v, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/60 p-4 space-y-1 opacity-70">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  <span className="text-xs font-medium text-foreground">{v.label}</span>
                  <span className="text-[9px] font-mono text-muted-foreground ml-auto">{v.time}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{v.desc}</p>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground text-center pt-4 italic">Full version history with diff viewing coming soon</p>
          </div>
        </section>
      )}

      {/* ─── Get Support Panel ─── */}
      {sidePanel === "support" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 grid place-items-center shrink-0">
                <LifeBuoy className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Get Support</h2>
                <p className="text-[10px] text-muted-foreground truncate">Help, docs & community</p>
              </div>
            </div>
            <button type="button" onClick={() => setSidePanel(null)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Close</button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {[
              { icon: "📖", title: "Documentation", desc: "Learn how to build amazing apps", url: "#" },
              { icon: "💬", title: "Community Forum", desc: "Ask questions and share ideas", url: "#" },
              { icon: "🐛", title: "Report a Bug", desc: "Help us improve Mobivable", url: "#" },
              { icon: "📧", title: "Contact Support", desc: "Get help from our team", url: "mailto:support@mobivable.com" },
              { icon: "🎓", title: "Tutorials", desc: "Step-by-step app building guides", url: "#" },
              { icon: "📋", title: "Changelog", desc: "See what's new in Mobivable", url: "#" },
            ].map((item, i) => (
              <a
                key={i}
                href={item.url}
                target={item.url.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 hover:border-primary/30 hover:bg-primary/5 transition-all group"
              >
                <span className="text-xl">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground block group-hover:text-primary transition-colors">{item.title}</span>
                  <span className="text-[10px] text-muted-foreground">{item.desc}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ─── Settings Panel ─── */}
      {sidePanel === "settings" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-muted/30 grid place-items-center shrink-0">
                <Settings className="h-4 w-4 text-foreground" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Settings</h2>
                <p className="text-[10px] text-muted-foreground truncate">Project configuration</p>
              </div>
            </div>
            <button type="button" onClick={() => setSidePanel(null)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">Close</button>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Project Info */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Project Name</label>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">{project?.name ?? "Untitled"}</div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Project ID</label>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 text-[11px] font-mono text-muted-foreground select-all">{projectId}</div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Plan</label>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${isPro ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  {isPro ? "Pro" : "Free"}
                </span>
                {isAdmin && <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">Admin</span>}
              </div>
            </div>

            {/* Theme */}
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Theme</label>
              <div className="flex gap-2">
                {(["light", "dark"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={`flex-1 rounded-xl border p-3 text-center text-xs font-medium capitalize transition-all ${
                      theme === t ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
              <h4 className="text-xs font-semibold text-destructive">Danger Zone</h4>
              <p className="text-[10px] text-muted-foreground">Irreversible actions for this project.</p>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Are you sure you want to delete this project? This cannot be undone.")) return;
                  await supabase.from("projects").delete().eq("id", projectId);
                  window.location.href = "/";
                }}
                className="w-full h-9 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
              >
                Delete Project
              </button>
            </div>
          </div>
        </section>
      )}

      {sidePanel === "aistudio" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <AIStudioPanel
            projectId={projectId}
            projectName={project?.name ?? ""}
            onClose={() => setSidePanel(null)}
            onSendPrompt={(p) => {
              setSidePanel(null);
              handleSend(undefined, p);
            }}
          />
        </section>
      )}

      {sidePanel === "knowledge" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <KnowledgeBasePanel
            projectId={projectId}
            onClose={() => setSidePanel(null)}
          />
        </section>
      )}

      {sidePanel === "deployments" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <DeploymentsPanel
            projectId={projectId}
            onClose={() => setSidePanel(null)}
          />
        </section>
      )}

      {sidePanel === "figma" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <FigmaImportPanel
            projectId={projectId}
            onClose={() => setSidePanel(null)}
          />
        </section>
      )}

      {sidePanel === "code_export" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <CodeExportPanel
            projectId={projectId}
            onClose={() => setSidePanel(null)}
          />
        </section>
      )}

      <AgentsMdPanel
        projectId={projectId}
        open={agentsMdOpen}
        onClose={() => setAgentsMdOpen(false)}
      />

      {upgradeOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                Pro
              </span>
              <h2 className="font-display text-lg">Backend is a Pro feature</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect a Supabase backend to power data, auth, and storage in your
              mobile app. Upgrade to Pro to unlock per-project backends.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUpgradeOpen(false)}
                className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 transition-colors"
              >
                Not now
              </button>
              <Link
                to="/pricing"
                onClick={() => setUpgradeOpen(false)}
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Upgrade to Pro
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── Share Modal ─── */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center">
                <Share2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-lg">Share Project</h2>
                <p className="text-[10px] text-muted-foreground">Invite collaborators or share a preview link</p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Project Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== "undefined" ? window.location.href : ""}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Link copied to clipboard!");
                  }}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h4 className="text-xs font-semibold mb-2">Share via</h4>
              <div className="flex gap-2">
                {["Email", "Slack", "Teams"].map(channel => (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => toast.info(`${channel} sharing coming soon!`)}
                    className="flex-1 rounded-lg border border-border p-2.5 text-center text-xs font-medium hover:bg-muted/50 hover:border-primary/30 transition-all"
                  >
                    {channel}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setShareOpen(false)} className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Publish Modal ─── */}
      {publishOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4" onClick={() => setPublishOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 grid place-items-center">
                <Upload className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <h2 className="font-display text-lg">Publish App</h2>
                <p className="text-[10px] text-muted-foreground">Build & deploy to app stores</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground font-mono uppercase tracking-widest">Pre-Publish Checklist</h4>
              {[
                { label: "App Name", done: !!(project?.name), detail: project?.name ?? "Not set" },
                { label: "App Icon", done: !!appAssets.icon, detail: appAssets.icon ? "Uploaded" : "Not set" },
                { label: "Splash Screen", done: !!appAssets.splash, detail: appAssets.splash ? "Uploaded" : "Not set" },
                { label: "Backend Connected", done: !!(projectIntegration.supabase_url), detail: projectIntegration.supabase_url ? "Connected" : "Not connected" },
                { label: "App Schema", done: !!(project?.result), detail: project?.result ? "Generated" : "Not generated" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
                  <div className={`h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold ${item.done ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                    {item.done ? "✓" : "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{item.label}</span>
                  </div>
                  <span className={`text-[10px] font-mono ${item.done ? "text-emerald-500" : "text-muted-foreground"}`}>{item.detail}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
              <h4 className="text-xs font-semibold text-amber-600">Build Targets</h4>
              <div className="flex gap-2">
                {[
                  { name: "iOS", icon: "🍎" },
                  { name: "Android", icon: "🤖" },
                  { name: "Both", icon: "📱" },
                ].map(t => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => toast.info(`${t.name} build via EAS coming soon!`)}
                    className="flex-1 rounded-lg border border-border p-3 text-center hover:border-primary/30 hover:bg-primary/5 transition-all"
                  >
                    <span className="text-lg block mb-1">{t.icon}</span>
                    <span className="text-[10px] font-medium">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPublishOpen(false)} className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { toast.info("EAS Build integration coming soon! Use Export to download the Expo project for now."); setPublishOpen(false); }}
                className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Start Build
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview pane */}
      <section className={`${mobileView === "preview" ? "grid" : "hidden"} lg:grid flex-1 relative place-items-center bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden py-10 lg:py-0 min-h-[720px] lg:min-h-0`}>
        {/* Top toolbar: segmented pane tabs on the left, status + actions on the right */}
        <div className="absolute top-4 inset-x-4 z-30 flex items-center justify-between gap-3 pointer-events-none">
          {/* Left: segmented pane tabs */}
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/90 px-1 py-1 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => setPaneTab("preview")}
              aria-label="Dev Preview"
              title="Simulated phone frame for development"
              className={`inline-flex items-center justify-center h-7 w-9 rounded-full transition-colors ${paneTab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPaneTab("code")}
              aria-label="Agent-generated mobile app code"
              title="Actual code generated by the agent for the mobile app"
              className={`inline-flex items-center justify-center h-7 w-9 rounded-full font-mono text-[11px] transition-colors ${paneTab === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {"</>"}
            </button>
            <button
              type="button"
              onClick={() => setPaneTab("agents")}
              aria-label="Agents"
              title="Agents"
              className={`inline-flex items-center justify-center h-7 w-9 rounded-full transition-colors ${paneTab === "agents" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Users className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPaneTab("export")}
              aria-label="Export"
              title="Export as Expo project"
              className={`inline-flex items-center justify-center h-7 w-9 rounded-full transition-colors ${paneTab === "export" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPaneTab("screenshots")}
              aria-label="Screenshots"
              title="App screenshots & assets"
              className={`inline-flex items-center justify-center h-7 w-9 rounded-full transition-colors ${paneTab === "screenshots" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Right: live status + restart + preview on device */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-background/90 text-xs shadow-lg backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-foreground/90">Live</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setRestarting(true);
                setTimeout(() => {
                  setPreviewKey((k) => k + 1);
                  setTimeout(() => setRestarting(false), 800);
                }, 2000);
              }}
              disabled={restarting}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-background/90 text-xs text-foreground/90 hover:text-foreground hover:bg-background shadow-lg backdrop-blur transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${restarting ? "animate-spin" : ""}`} />
              {restarting ? "Restarting..." : "Restart"}
            </button>
            <button
              type="button"
              title="Open on a real phone or tablet"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.open(window.location.href, "_blank", "noopener,noreferrer");
                }
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-primary/60 bg-primary/10 text-xs text-primary hover:bg-primary/20 shadow-lg backdrop-blur transition-colors"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Real Device
            </button>
          </div>
        </div>
        {paneTab === "agents" && (
          <div className="absolute inset-0 top-20 lg:right-[220px] z-10">
            <AgentWorkspace projectId={projectId} />
          </div>
        )}
        {paneTab === "export" && (
          <div className="absolute inset-0 top-20 lg:right-[220px] z-10">
            <ExportPanel
              schema={(() => {
                const s = project?.result ? parseAppSchema(project.result) : null;
                return s ?? SAMPLE_APPS[demoApp] ?? null;
              })()}
              projectName={project?.name}
              supabaseUrl={projectIntegration.supabase_url ?? undefined}
              supabaseAnonKey={projectIntegration.supabase_anon_key ?? undefined}
            />
          </div>
        )}
        {paneTab === "screenshots" && (
          <div className="absolute inset-0 top-20 lg:right-[220px] z-10">
            <ScreenshotGallery
              schema={(() => {
                const s = project?.result ? parseAppSchema(project.result) : null;
                return s ?? SAMPLE_APPS[demoApp] ?? null;
              })()}
              previewRef={previewRootRef}
            />
          </div>
        )}
        {paneTab === "code" && (
          <div className="absolute inset-0 top-20 lg:right-[220px] z-10 overflow-auto bg-background/95 backdrop-blur p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground">app.json (auto-generated)</h3>
                <span className="text-[10px] text-muted-foreground">
                  {appAssets.icon || appAssets.splash ? "linked to your selected assets" : "using defaults — upload assets to override"}
                </span>
              </div>
              <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-words rounded-md border border-border bg-card/50 p-4">
{JSON.stringify(
  {
    expo: {
      name: project?.name ?? "My App",
      slug: ((project?.name ?? "my-app").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")) || "my-app",
      icon: appAssets.icon ?? "./assets/icon.png",
      splash: {
        image: appAssets.splash ?? "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
      android: {
        adaptiveIcon: {
          foregroundImage: appAssets.icon ?? "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff",
        },
      },
      ios: { icon: appAssets.icon ?? "./assets/icon.png" },
    },
  },
  null,
  2,
)}
              </pre>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Generated source</h3>
              <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-words">
                {project?.result || "// No generated code yet."}
              </pre>
            </div>
          </div>
        )}
        {(visualEdit || selectedEl) && (
          <aside className="hidden lg:flex absolute top-0 right-0 bottom-0 w-80 z-20 border-l border-border bg-card/95 backdrop-blur flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <MousePointerClick className="h-4 w-4 text-primary shrink-0" />
                <h2 className="font-display text-xs uppercase tracking-wider">Inspector</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={undoVisualEdit}
                  disabled={historyPastRef.current.length === 0}
                  title="Undo"
                  aria-label="Undo"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={redoVisualEdit}
                  disabled={historyFutureRef.current.length === 0}
                  title="Redo"
                  aria-label="Redo"
                  className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
                {selectedEl && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const orig = selectedOrigRef.current;
                        if (!orig) return;
                        setEditText(orig.text);
                        setEditClasses(orig.classes);
                        setEditStyles({ ...orig.styles });
                      }}
                      title="Revert to last saved"
                      className="ml-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Revert
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        selectedElRef.current?.classList.remove("visual-edit-selected");
                        selectedElRef.current?.removeAttribute("draggable");
                        selectedElRef.current = null;
                        selectedOrigRef.current = null;
                        setSelectedEl(null);
                      }}
                      className="ml-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!selectedEl ? (
                <p className="text-xs text-muted-foreground">
                  Click any element in the preview to inspect and edit it.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Tag</p>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-mono text-primary shrink-0">
                        &lt;{selectedEl.tag}&gt;
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground truncate">
                        {selectedEl.path.join(" › ")}
                      </span>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Text</span>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      placeholder="(no text content / has children)"
                      className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:border-primary/60"
                    />
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Classes</span>
                      {editClasses.trim() && (
                        <button
                          type="button"
                          onClick={() => setEditClasses("")}
                          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    {(() => {
                      const list = editClasses.split(/\s+/).filter(Boolean);
                      return list.length ? (
                        <div className="flex flex-wrap gap-1">
                          {list.map((c, i) => (
                            <span
                              key={`${c}-${i}`}
                              className="group inline-flex items-center gap-1 rounded-md border border-border bg-background pl-1.5 pr-1 py-0.5 text-[10px] font-mono"
                            >
                              {c}
                              <button
                                type="button"
                                aria-label={`Remove ${c}`}
                                onClick={() => {
                                  const next = list.filter((_, j) => j !== i).join(" ");
                                  setEditClasses(next);
                                }}
                                className="h-3.5 w-3.5 grid place-items-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No classes</p>
                      );
                    })()}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const toks = newClassInput.split(/\s+/).filter(Boolean);
                        if (!toks.length) return;
                        const cur = editClasses.split(/\s+/).filter(Boolean);
                        for (const t of toks) if (!cur.includes(t)) cur.push(t);
                        setEditClasses(cur.join(" "));
                        setNewClassInput("");
                      }}
                      className="flex gap-1"
                    >
                      <input
                        type="text"
                        value={newClassInput}
                        onChange={(e) => setNewClassInput(e.target.value)}
                        placeholder="Add class…"
                        className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-primary/60"
                      />
                      <button
                        type="submit"
                        disabled={!newClassInput.trim()}
                        className="rounded-md border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        Add
                      </button>
                    </form>
                    <details className="rounded-lg border border-border bg-background/40">
                      <summary className="cursor-pointer list-none px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
                        Presets
                      </summary>
                      <div className="space-y-2 p-2 pt-1">
                        {CLASS_PRESETS.map((group) => {
                          const cur = editClasses.split(/\s+/).filter(Boolean);
                          return (
                            <div key={group.label}>
                              <p className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">{group.label}</p>
                              <div className="flex flex-wrap gap-1">
                                {group.classes.map((c) => {
                                  const active = cur.includes(c);
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => {
                                        const next = active
                                          ? cur.filter((x) => x !== c)
                                          : [...cur, c];
                                        setEditClasses(next.join(" "));
                                      }}
                                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
                                        active
                                          ? "border-primary bg-primary/15 text-primary"
                                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
                                      }`}
                                    >
                                      {c}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>

                  <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Style</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">Background</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="color"
                            value={editStyles.background || "#000000"}
                            onChange={(e) => setEditStyles((s) => ({ ...s, background: e.target.value }))}
                            className="h-7 w-9 rounded border border-border bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={editStyles.background || ""}
                            onChange={(e) => setEditStyles((s) => ({ ...s, background: e.target.value }))}
                            placeholder="transparent"
                            className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[10px] font-mono"
                          />
                        </div>
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-muted-foreground">Border color</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="color"
                            value={editStyles.borderColor || "#000000"}
                            onChange={(e) => setEditStyles((s) => ({ ...s, borderColor: e.target.value }))}
                            className="h-7 w-9 rounded border border-border bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={editStyles.borderColor || ""}
                            onChange={(e) => setEditStyles((s) => ({ ...s, borderColor: e.target.value }))}
                            placeholder="none"
                            className="flex-1 min-w-0 rounded border border-border bg-background px-1.5 py-1 text-[10px] font-mono"
                          />
                        </div>
                      </label>
                    </div>
                    {([
                      ["borderWidth", "Border width", 0, 16],
                      ["padding", "Padding", 0, 64],
                      ["fontSize", "Font size", 8, 72],
                    ] as const).map(([key, label, min, max]) => {
                      const num = parseFloat(editStyles[key] || "0") || 0;
                      return (
                        <label key={key} className="block">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                            <span className="text-[10px] font-mono text-foreground">{num}px</span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={1}
                            value={num}
                            onChange={(e) => setEditStyles((s) => ({ ...s, [key]: `${e.target.value}px` }))}
                            className="mt-1 w-full accent-primary"
                          />
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        setEditStyles({ background: "", borderColor: "", borderWidth: "", padding: "", fontSize: "" })
                      }
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Reset styles
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={savingEdit}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-2 text-xs font-display uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save changes
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
        <div className="absolute top-4 left-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isReady ? "bg-primary" : "bg-muted-foreground"
            }`}
          />
          {isReady ? "Preview" : "Offline"}
        </div>

        {visualEdit && (
          <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-border bg-background/90 px-1 py-1 shadow-lg backdrop-blur">
              <button
                type="button"
                onClick={undoVisualEdit}
                disabled={historyPastRef.current.length === 0}
                aria-label="Undo visual edit"
                title="Undo last visual edit"
                className="h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={redoVisualEdit}
                disabled={historyFutureRef.current.length === 0}
                aria-label="Redo visual edit"
                title="Redo visual edit"
                className="h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-primary bg-primary/15 px-3 py-1.5 text-xs text-primary font-medium shadow-lg backdrop-blur">
              <MousePointerClick className="h-3.5 w-3.5" />
              Click any element to select
            </div>
          </div>
        )}

        {/* Demo app selector (when no AI result) */}
        {!project?.result && paneTab === "preview" && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mr-1">Demo:</span>
            {Object.entries(SAMPLE_APPS).map(([key, app]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setDemoApp(key); setPreviewKey(k => k + 1); }}
                className={`rounded-full px-3 py-1 text-[10px] font-medium transition-all ${
                  demoApp === key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {app.name}
              </button>
            ))}
          </div>
        )}

        {/* Phone frame */}
        <div
          className={`relative transition-all duration-300 ${
            paneTab !== "preview"
              ? "lg:absolute lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:scale-[0.32] lg:origin-right z-20 hidden lg:block"
              : ""
          }`}
        >
          <div
            aria-hidden
            className="absolute -inset-6 rounded-[3rem] blur-2xl opacity-50"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--primary) 60%, transparent), transparent 70%)",
            }}
          />
          <div className="relative h-[640px] w-[320px] rounded-[2.5rem] border-[10px] border-foreground/80 bg-card shadow-2xl overflow-hidden">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 h-5 w-24 rounded-full bg-foreground/80 z-20" />
            {isBuilding ? (
              <div className="h-full w-full grid place-items-center p-6">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="font-display text-sm uppercase tracking-wider">Loading app…</p>
                </div>
              </div>
            ) : isFailed && project?.result && parseAppSchema(project.result) === null && !SAMPLE_APPS[demoApp] ? (
              <div className="h-full w-full grid place-items-center p-6">
                <div className="text-center">
                  <Smartphone className="h-10 w-10 mx-auto text-destructive mb-3" />
                  <p className="font-display text-sm uppercase tracking-wider text-destructive">
                    Build failed
                  </p>
                </div>
              </div>
            ) : (
              <div
                ref={previewRootRef}
                className={`h-full w-full relative ${visualEdit ? "visual-edit-mode" : ""}`}
                onDragStartCapture={(e) => {
                  const t = e.target as HTMLElement;
                  if (t !== selectedElRef.current) {
                    e.preventDefault();
                    return;
                  }
                  dragSrcRef.current = t;
                  e.dataTransfer.effectAllowed = "move";
                  try {
                    e.dataTransfer.setData("text/plain", "visual-edit");
                  } catch {
                    /* ignore */
                  }
                }}
                onDragOverCapture={(e) => {
                  // Palette drag-and-drop: let the inner drop zone handle it.
                  if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("application/x-mobile-element")) {
                    return;
                  }
                  const src = dragSrcRef.current;
                  if (!src) return;
                  const t = e.target as HTMLElement;
                  if (t === src || !src.parentElement) return;
                  const overSibling = t.parentElement === src.parentElement;
                  const overParent = t === src.parentElement;
                  if (!overSibling && !overParent) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  document
                    .querySelectorAll(".visual-edit-drop")
                    .forEach((n) => n.classList.remove("visual-edit-drop"));
                  if (overSibling) t.classList.add("visual-edit-drop");
                }}
                onDragLeaveCapture={(e) => {
                  (e.target as HTMLElement).classList?.remove("visual-edit-drop");
                }}
                onDropCapture={(e) => {
                  const src = dragSrcRef.current;
                  if (!src || !src.parentElement) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const root = previewRootRef.current;
                  if (!root) return;
                  document
                    .querySelectorAll(".visual-edit-drop")
                    .forEach((n) => n.classList.remove("visual-edit-drop"));
                  const t = e.target as HTMLElement;
                  const parent = src.parentElement;
                  const oldChildren = Array.from(parent.children) as HTMLElement[];
                  if (t === parent) {
                    parent.appendChild(src);
                  } else if (t.parentElement === parent && t !== src) {
                    const rect = t.getBoundingClientRect();
                    const vertical = rect.height >= rect.width;
                    const before = vertical
                      ? e.clientY < rect.top + rect.height / 2
                      : e.clientX < rect.left + rect.width / 2;
                    parent.insertBefore(src, before ? t : t.nextSibling);
                  } else {
                    dragSrcRef.current = null;
                    return;
                  }
                  const newChildren = Array.from(parent.children) as HTMLElement[];
                  const newIndex = newChildren.indexOf(src);
                  // Remap edits paths under this parent
                  const parentPath = getPath(parent, root);
                  if (parentPath) {
                    const idxMap = new Map<number, number>();
                    newChildren.forEach((c, i) => {
                      idxMap.set(oldChildren.indexOf(c), i);
                    });
                    const remapped = visualEditsRef.current.map((ed) => {
                      if (ed.path.length <= parentPath.length) return ed;
                      for (let i = 0; i < parentPath.length; i++) {
                        if (ed.path[i] !== parentPath[i]) return ed;
                      }
                      const np = [...ed.path];
                      const m = idxMap.get(ed.path[parentPath.length]);
                      if (m !== undefined) np[parentPath.length] = m;
                      return { ...ed, path: np };
                    });
                    visualEditsRef.current = remapped;
                    // Record permutation of original indices for this parent
                    const order = newChildren.map((c) => Number(c.dataset.origIdx ?? 0));
                    reordersRef.current = {
                      ...reordersRef.current,
                      [pathKey(parentPath)]: order,
                    };
                    setSelectedEl((s) =>
                      s ? { ...s, path: [...parentPath, newIndex] } : s,
                    );
                    void persistVisualEdits(visualEditsRef.current, reordersRef.current);
                  }
                  dragSrcRef.current = null;
                }}
                onClickCapture={(e) => {
                  if (!visualEdit) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const t = e.target as HTMLElement;
                  const root = previewRootRef.current;
                  if (!root) return;
                  const path = getPath(t, root);
                  if (!path) return;
                  if (selectedElRef.current) {
                    selectedElRef.current.classList.remove("visual-edit-selected");
                    selectedElRef.current.removeAttribute("draggable");
                  }
                  t.classList.add("visual-edit-selected");
                  t.setAttribute("draggable", "true");
                  selectedElRef.current = t;
                  const cls = (t.className?.toString() || "")
                    .split(/\s+/)
                    .filter((c) => c && c !== "visual-edit-selected")
                    .join(" ");
                  const txt = t.children.length === 0 ? (t.textContent || "") : "";
                  setEditText(txt);
                  setEditClasses(cls);
                  const persisted = visualEditsRef.current.find(
                    (e) => pathKey(e.path) === pathKey(path),
                  );
                  const cs = window.getComputedStyle(t);
                  const toHex = (rgb: string): string => {
                    const m = rgb.match(/\d+(\.\d+)?/g);
                    if (!m || m.length < 3) return "";
                    const [r, g, b, a] = m.map(Number);
                    if (a === 0) return "";
                    const h = (n: number) => n.toString(16).padStart(2, "0");
                    return `#${h(r)}${h(g)}${h(b)}`;
                  };
                  const pxNum = (v: string) => parseFloat(v) || 0;
                  setEditStyles({
                    background:
                      persisted?.styles?.background ?? toHex(cs.backgroundColor),
                    borderColor:
                      persisted?.styles?.borderColor ?? toHex(cs.borderTopColor),
                    borderWidth:
                      persisted?.styles?.borderWidth ?? `${pxNum(cs.borderTopWidth)}px`,
                    padding:
                      persisted?.styles?.padding ?? `${pxNum(cs.paddingTop)}px`,
                    fontSize:
                      persisted?.styles?.fontSize ?? `${pxNum(cs.fontSize)}px`,
                  });
                  selectedOrigRef.current = {
                    text: persisted?.text ?? txt,
                    classes: persisted?.classes ?? cls,
                    styles: {
                      background: persisted?.styles?.background ?? "",
                      borderColor: persisted?.styles?.borderColor ?? "",
                      borderWidth: persisted?.styles?.borderWidth ?? "",
                      padding: persisted?.styles?.padding ?? "",
                      fontSize: persisted?.styles?.fontSize ?? "",
                    },
                  };
                  setSelectedEl({
                    tag: t.tagName.toLowerCase(),
                    text: txt.trim().slice(0, 80),
                    classes: cls.slice(0, 200),
                    path,
                  });
                  setVisualEdit(false);
                }}
              >
                {(() => {
                  if (restarting) {
                    return (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        height: '100%', width: '100%',
                        background: 'linear-gradient(160deg, #7c5dd6 0%, #a78bfa 35%, #c4b5fd 60%, #8b5cf6 100%)',
                        fontFamily: 'system-ui, -apple-system, sans-serif', color: '#fff',
                      }}>
                        {/* Logo */}
                        <div style={{
                          width: 80, height: 80, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #3b4fa8 0%, #5b6abf 40%, #fff 60%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                          marginBottom: 28,
                          animation: 'restartPulse 2s ease-in-out infinite',
                        }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: '#1a1a2e', border: '3px solid #fff',
                          }} />
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 8 }}>
                          Setting things up…
                        </div>
                        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 32 }}>
                          Please wait while we build your app
                        </div>
                        {/* Spinner */}
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          border: '2.5px solid rgba(255,255,255,0.25)',
                          borderTopColor: '#fff',
                          animation: 'restartSpin 0.8s linear infinite',
                        }} />
                        <style>{`
                          @keyframes restartSpin { to { transform: rotate(360deg); } }
                          @keyframes restartPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
                        `}</style>
                      </div>
                    );
                  }
                  const parsed = project?.result ? parseAppSchema(project.result) : null;
                  // Reset live edits when the underlying generated result changes.
                  if (project?.result && project.result !== liveSchemaResultId) {
                    queueMicrotask(() => {
                      setLiveSchemaResultId(project.result);
                      setLiveSchema(null);
                    });
                  }
                  const baseSchema = liveSchema ?? parsed ?? SAMPLE_APPS[demoApp] ?? SAMPLE_FITTRACK;
                  const handleDrop = (e: React.DragEvent) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("application/x-mobile-element");
                    if (!raw) return;
                    try {
                      const el = JSON.parse(raw) as MElement;
                      const screenId = activeScreenId || baseSchema.screens[0]?.id;
                      const next: MobileAppSchema = {
                        ...baseSchema,
                        screens: baseSchema.screens.map((s) =>
                          s.id === screenId ? { ...s, elements: [...s.elements, el] } : s,
                        ),
                      };
                      setLiveSchema(next);
                      setDropFlash(true);
                      setTimeout(() => setDropFlash(false), 350);
                    } catch {
                      /* ignore malformed payload */
                    }
                  };
                  const hasPaletteType = (dt: DataTransfer) => {
                    try {
                      const types = Array.from(dt.types || []);
                      return types.includes("application/x-mobile-element");
                    } catch { return false; }
                  };
                  return (
                    <div
                      style={{ position: "relative", height: "100%", width: "100%" }}
                      onDragEnter={(e) => {
                        if (hasPaletteType(e.dataTransfer)) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onDragOver={(e) => {
                        if (hasPaletteType(e.dataTransfer)) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "copy";
                        }
                      }}
                      onDrop={(e) => {
                        if (hasPaletteType(e.dataTransfer)) {
                          e.stopPropagation();
                        }
                        handleDrop(e);
                      }}
                    >
                      <MobileAppRenderer
                        key={previewKey}
                        schema={baseSchema}
                        onScreenChange={setActiveScreenId}
                      />
                      {dropFlash && (
                        <div
                          style={{
                            position: "absolute", inset: 0, pointerEvents: "none",
                            border: "3px solid hsl(var(--primary))",
                            borderRadius: 18,
                            animation: "dropFlashAnim 350ms ease-out",
                          }}
                        />
                      )}
                      <style>{`@keyframes dropFlashAnim { 0% { opacity: 1; } 100% { opacity: 0; } }`}</style>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

      </section>

      {/* Mobile bottom action bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border grid grid-cols-3 h-16">
        <button
          type="button"
          onClick={() => setMobileView("chat")}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-display uppercase tracking-wider transition-colors ${
            mobileView === "chat" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          type="button"
          onClick={() => setMobileView("preview")}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] font-display uppercase tracking-wider transition-colors ${
            mobileView === "preview" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Eye className="h-4 w-4" />
          Preview
        </button>
        <button
          type="button"
          onClick={runGeneration}
          disabled={generating || !project}
          className="flex flex-col items-center justify-center gap-1 text-[10px] font-display uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Building" : "Retry"}
        </button>
      </nav>
      </div>
      {historyOpen && (
        <HistoryDialog
          currentProjectId={projectId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {knowledgeOpen && (
        <KnowledgeDialog onClose={() => setKnowledgeOpen(false)} />
      )}
      {connectorsOpen && (
        <ConnectorsDialog onClose={() => setConnectorsOpen(false)} />
      )}
    </div>
  );
}

function HistoryDialog({
  currentProjectId,
  onClose,
}: {
  currentProjectId: string;
  onClose: () => void;
}) {
  type Row = {
    id: string;
    name: string | null;
    prompt: string;
    updated_at: string;
  };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setErr("Not signed in");
      setRows([]);
      return;
    }
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{
              data: Row[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    })
      .from("projects")
      .select("id, name, prompt, updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this chat session? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await supabase.from("project_messages").delete().eq("project_id", id);
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      toast("Chat deleted");
      if (id === currentProjectId && typeof window !== "undefined") {
        window.location.assign("/dashboard");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Chat history</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {rows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No previous chats yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {rows.map((r) => {
                const isCurrent = r.id === currentProjectId;
                return (
                  <li
                    key={r.id}
                    className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors ${
                      isCurrent ? "bg-accent/60" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {r.name || "Untitled"}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] uppercase tracking-wider text-primary">
                            current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {r.prompt}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">
                        {new Date(r.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isCurrent && (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: r.id }}
                          onClick={onClose}
                          className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium border border-border hover:bg-background"
                        >
                          Open
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background disabled:opacity-50"
                        aria-label="Delete chat"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function BackendPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [connected, setConnected] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  async function testConnection() {
    setTestResult(null);
    setTesting(true);
    try {
      const url = supabaseUrl.trim().replace(/\/+$/, "");
      const key = anonKey.trim();
      if (!url || !key) throw new Error("Enter both Project URL and anon key");
      if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
        throw new Error("URL must look like https://xxxxx.supabase.co");
      }
      const started = performance.now();
      const res = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const ms = Math.round(performance.now() - started);
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Invalid anon key (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(`Unexpected response: HTTP ${res.status}`);
      setTestResult({ ok: true, message: `Connection OK · ${ms}ms` });
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => {
                maybeSingle: () => Promise<{ data: {
                  supabase_url: string | null;
                  supabase_anon_key: string | null;
                  supabase_project_ref: string | null;
                  connected_at: string | null;
                } | null }>;
              };
            };
          };
        };
      })
        .from("project_integrations")
        .select("supabase_url,supabase_anon_key,supabase_project_ref,connected_at")
        .eq("project_id", projectId)
        .eq("user_id", uid)
        .maybeSingle();
      if (data) {
        setSupabaseUrl(data.supabase_url ?? "");
        setAnonKey(data.supabase_anon_key ?? "");
        setProjectRef(data.supabase_project_ref ?? "");
        setSavedAt(data.connected_at);
        setConnected(!!data.connected_at);
      }
      setLoading(false);
    })();
  }, [projectId]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const now = new Date().toISOString();
      const { error: err } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("project_integrations")
        .upsert(
          {
            project_id: projectId,
            user_id: uid,
            supabase_url: supabaseUrl.trim() || null,
            supabase_anon_key: anonKey.trim() || null,
            supabase_project_ref: projectRef.trim() || null,
            connected_at: supabaseUrl.trim() && anonKey.trim() ? now : null,
          },
          { onConflict: "project_id,user_id" },
        );
      if (err) throw new Error(err.message);
      setConnected(!!(supabaseUrl.trim() && anonKey.trim()));
      setSavedAt(now);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setSaving(true);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      await (supabase as unknown as {
        from: (t: string) => {
          delete: () => {
            eq: (c: string, v: string) => {
              eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
            };
          };
        };
      })
        .from("project_integrations")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", uid);
      setSupabaseUrl("");
      setAnonKey("");
      setProjectRef("");
      setConnected(false);
      setSavedAt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <div className="flex-1 overflow-y-auto">
        <header className="p-5 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg truncate">Supabase Backend</h2>
              <p className="text-xs text-muted-foreground truncate">
                Connect a Supabase project to power this mobile app
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </header>

        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                  }`}
                />
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  {connected ? "Connected" : "Not connected"}
                </span>
                {savedAt && (
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    Saved {new Date(savedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project URL
                </label>
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Anon / Publishable Key
                </label>
                <input
                  type="password"
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOi…"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  The publishable/anon key is safe to embed in client apps. Never paste your
                  service role key here.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project Ref <span className="text-muted-foreground/60 normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={projectRef}
                  onChange={(e) => setProjectRef(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              {testResult && (
                <p
                  className={`text-xs font-mono ${
                    testResult.ok ? "text-emerald-500" : "text-destructive"
                  }`}
                >
                  {testResult.ok ? "✓ " : "✗ "}
                  {testResult.message}
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !supabaseUrl.trim() || !anonKey.trim()}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {saving ? "Saving…" : connected ? "Update connection" : "Connect"}
                </button>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing || !supabaseUrl.trim() || !anonKey.trim()}
                  className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 disabled:opacity-40 transition-colors"
                >
                  {testing ? "Testing…" : "Test connection"}
                </button>
                {connected && (
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={saving}
                    className="px-4 py-2 rounded-full border border-border text-sm hover:bg-muted/50 transition-colors"
                  >
                    Disconnect
                  </button>
                )}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  Open Supabase →
                </a>
              </div>
            </>
          )}
        </div>

        <BackendDataModelSection projectId={projectId} projectRef={projectRef} />
      </div>
    </section>
  );
}

function BackendDataModelSection({
  projectId,
  projectRef,
}: {
  projectId: string;
  projectRef: string;
}) {
  type Col = { name: string; type: string; nullable?: boolean };
  type Tbl = { name: string; columns: Col[]; rls?: string };
  const [tables, setTables] = useState<Tbl[]>([]);
  const [loading, setLoading] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pat, setPat] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const inferFn = useServerFn(inferBackendSpec);
  const applyFn = useServerFn(applyBackendSchema);
  const getFn = useServerFn(getBackendSpec);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await getFn({ data: { projectId } });
        if (r.ok && r.backend?.tables) setTables(r.backend.tables as Tbl[]);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, getFn]);

  async function handleInfer() {
    setInferring(true);
    setResult(null);
    try {
      const r = await inferFn({ data: { projectId } });
      if (r.ok) {
        setTables((r.backend.tables ?? []) as Tbl[]);
        toast.success(`Inferred ${r.backend.tables?.length ?? 0} tables`);
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setInferring(false);
    }
  }

  async function handleApply() {
    if (!pat.trim() || !projectRef.trim()) {
      toast.error("Need Management PAT and Project Ref");
      return;
    }
    setApplying(true);
    setResult(null);
    try {
      const r = await applyFn({
        data: {
          projectId,
          managementToken: pat.trim(),
          projectRef: projectRef.trim(),
        },
      });
      if (r.ok) {
        setResult({ ok: true, text: "Schema applied successfully" });
        toast.success("Schema applied to your Supabase");
      } else {
        setResult({ ok: false, text: r.error });
        toast.error(r.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, text: msg });
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="p-5 border-t border-border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm">Data Model</h3>
          <p className="text-[11px] text-muted-foreground">
            AI-inferred tables for this app
          </p>
        </div>
        <button
          type="button"
          onClick={handleInfer}
          disabled={inferring}
          className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted/50 disabled:opacity-40 flex items-center gap-1.5"
        >
          {inferring ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {tables.length > 0 ? "Re-infer" : "Generate"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : tables.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No tables yet. Click Generate to have AI infer the schema from your app.
        </p>
      ) : (
        <div className="space-y-2">
          {tables.map((t) => (
            <div
              key={t.name}
              className="rounded-lg border border-border bg-background/60 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-semibold">{t.name}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  RLS: {t.rls ?? "owner"}
                </span>
              </div>
              <div className="space-y-0.5">
                {t.columns.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between text-[10px] font-mono text-muted-foreground"
                  >
                    <span>{c.name}</span>
                    <span>
                      {c.type}
                      {c.nullable === false ? " NOT NULL" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tables.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Supabase Management PAT
          </label>
          <input
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="sbp_…"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
          />
          <p className="text-[10px] text-muted-foreground">
            Create at{" "}
            <a
              href="https://supabase.com/dashboard/account/tokens"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              supabase.com/dashboard/account/tokens
            </a>
            . Not stored — used only for this operation.
          </p>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !pat.trim() || !projectRef.trim()}
            className="w-full px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {applying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Applying schema…
              </>
            ) : (
              <>
                <Database className="h-3.5 w-3.5" />
                Apply schema to your Supabase
              </>
            )}
          </button>
          {!projectRef.trim() && (
            <p className="text-[10px] text-amber-500">
              Set Project Ref above first.
            </p>
          )}
          {result && (
            <div
              className={`rounded-md p-2 text-[11px] font-mono ${
                result.ok
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {result.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type EnvVar = {
  id: string;
  name: string;
  value: string;
  visible: boolean;
};

const RESERVED_ENV_NAMES = new Set([
  "NODE_ENV",
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "PWD",
  "LANG",
  "TERM",
  "HOSTNAME",
  "EXPO_PUBLIC_PROJECT_ID",
  "EXPO_PUBLIC_API_URL",
]);

function validateEnvName(
  name: string,
  opts: { requirePublic?: boolean; existing?: string[] } = {},
): string | null {
  if (!name) return "Name is required";
  if (name.length < 2) return "Name must be at least 2 characters";
  if (name.length > 64) return "Name must be 64 characters or fewer";
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    return "Use UPPER_SNAKE_CASE: A–Z, 0–9, _ (cannot start with a digit)";
  }
  if (/__/.test(name)) return "Name cannot contain consecutive underscores";
  if (name.endsWith("_")) return "Name cannot end with an underscore";
  if (RESERVED_ENV_NAMES.has(name)) return `"${name}" is reserved`;
  if (opts.requirePublic && !name.startsWith("EXPO_PUBLIC_")) {
    return "Public variables must start with EXPO_PUBLIC_";
  }
  if (name.startsWith("EXPO_PUBLIC_") && name.length <= "EXPO_PUBLIC_".length) {
    return "Add a name after the EXPO_PUBLIC_ prefix";
  }
  if (opts.existing?.includes(name)) return `"${name}" already exists`;
  return null;
}

function EnvPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newVisible, setNewVisible] = useState(true);
  const [newPublic, setNewPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editVisible, setEditVisible] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit(v: EnvVar) {
    setEditId(v.id);
    setEditValue(v.value);
    setEditVisible(v.visible);
    setEditError(null);
  }

  function cancelEdit() {
    setEditId(null);
    setEditValue("");
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    if (editValue.length > 4000) {
      setEditError("Value too long");
      return;
    }
    setEditSaving(true);
    try {
      const { error: err } = await (supabase as unknown as {
        from: (t: string) => {
          update: (row: Record<string, unknown>) => {
            eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("project_env_vars")
        .update({ value: editValue, visible: editVisible })
        .eq("id", id);
      if (err) throw new Error(err.message);
      setVars((prev) =>
        prev.map((v) => (v.id === id ? { ...v, value: editValue, visible: editVisible } : v)),
      );
      cancelEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  }

  const systemVars = [
    { name: "EXPO_PUBLIC_PROJECT_ID", value: projectId },
    { name: "EXPO_PUBLIC_API_URL", value: import.meta.env.VITE_SUPABASE_URL ?? "" },
  ];

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: EnvVar[] | null }>;
            };
          };
        };
      };
    })
      .from("project_env_vars")
      .select("id,name,value,visible")
      .eq("project_id", projectId)
      .eq("user_id", uid)
      .order("name", { ascending: true });
    setVars(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addVar() {
    setError(null);
    let name = newName.trim().toUpperCase();
    if (newPublic && !name.startsWith("EXPO_PUBLIC_")) {
      name = `EXPO_PUBLIC_${name}`;
    }
    const validationError = validateEnvName(name, {
      requirePublic: newPublic,
      existing: vars.map((v) => v.name),
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (newValue.length > 4000) {
      setError("Value too long (max 4000 chars)");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error: err } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("project_env_vars")
        .insert({
          project_id: projectId,
          user_id: uid,
          name,
          value: newValue,
          visible: newVisible,
        });
      if (err) throw new Error(err.message);
      setNewName("");
      setNewValue("");
      setNewVisible(true);
      setNewPublic(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function exportEnv() {
    const lines = vars
      .filter((v) => v.visible)
      .map((v) => `${v.name}=${/[\s"'#$`\\]/.test(v.value) ? `"${v.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v.value}`);
    if (lines.length === 0) return;
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function removeVar(id: string) {
    await (supabase as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("project_env_vars")
      .delete()
      .eq("id", id);
    setVars((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <header className="p-5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg truncate">Environment Variables</h2>
            <p className="text-xs text-muted-foreground truncate">
              Available in your Expo app via process.env
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* AI Provider Configuration */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> AI Providers
          </p>
          <AIProviderSettings />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <KeyRound className="h-3 w-3" /> System variables (read-only)
          </p>
          {systemVars.map((sv) => (
            <div key={sv.name} className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono">{sv.name}</span>
                <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  System
                </span>
              </div>
              <input
                readOnly
                value={sv.value}
                className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs font-mono text-muted-foreground"
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              User variables
            </p>
            <button
              type="button"
              onClick={exportEnv}
              disabled={vars.filter((v) => v.visible).length === 0}
              className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-40 flex items-center gap-1"
              title="Download visible variables as .env"
            >
              <Download className="h-3 w-3" />
              Export .env
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : vars.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-1">
              <p className="text-sm text-muted-foreground">No user variables defined</p>
              <p className="text-xs text-muted-foreground/70">Add variables using the form below</p>
            </div>
          ) : (
            vars.map((v) => {
              const isEditing = editId === v.id;
              return (
                <div key={v.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono flex-1 truncate">{v.name}</span>
                    {!v.visible && !isEditing && (
                      <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Hidden
                      </span>
                    )}
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditVisible((x) => !x)}
                          className="text-muted-foreground hover:text-foreground"
                          title={editVisible ? "Set hidden" : "Set visible"}
                        >
                          {editVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(v.id)}
                          disabled={editSaving}
                          className="text-primary hover:opacity-80 disabled:opacity-40"
                          title="Save"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-muted-foreground hover:text-foreground"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setReveal((r) => ({ ...r, [v.id]: !r[v.id] }))}
                          className="text-muted-foreground hover:text-foreground"
                          title={reveal[v.id] ? "Hide value" : "Reveal value"}
                        >
                          {reveal[v.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(v)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeVar(v.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <input
                        autoFocus
                        type={editVisible ? "text" : "password"}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(v.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        maxLength={4000}
                        className="w-full px-2 py-1.5 rounded border border-primary/50 bg-background text-xs font-mono focus:outline-none focus:border-primary"
                      />
                      {editError && <p className="text-[11px] text-destructive">{editError}</p>}
                    </>
                  ) : (
                    <input
                      readOnly
                      type={reveal[v.id] || v.visible ? "text" : "password"}
                      value={v.value}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs font-mono"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-sm font-medium">Add new variable</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
            placeholder={newPublic ? "MY_VAR (EXPO_PUBLIC_ added)" : "MY_SECRET"}
            maxLength={64}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:border-primary"
          />
          {(() => {
            const previewName =
              newPublic && newName && !newName.startsWith("EXPO_PUBLIC_")
                ? `EXPO_PUBLIC_${newName}`
                : newName;
            const liveError =
              previewName
                ? validateEnvName(previewName, {
                    requirePublic: newPublic,
                    existing: vars.map((v) => v.name),
                  })
                : null;
            return (
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                <span className="text-muted-foreground truncate">
                  {previewName ? `→ ${previewName}` : "UPPER_SNAKE_CASE, A–Z 0–9 _"}
                </span>
                {liveError && newName && (
                  <span className="text-destructive truncate">{liveError}</span>
                )}
              </div>
            );
          })()}
          <button
            type="button"
            onClick={() => setNewPublic((p) => !p)}
            className={`w-full px-3 py-2 rounded-md border text-xs flex items-center justify-between gap-1.5 transition-colors ${
              newPublic
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-border hover:bg-muted/50 text-muted-foreground"
            }`}
            title="Expose this variable to the client app (Expo requires the EXPO_PUBLIC_ prefix)"
          >
            <span className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Public (EXPO_PUBLIC_ prefix)
            </span>
            <span className="text-[10px] uppercase tracking-widest">{newPublic ? "On" : "Off"}</span>
          </button>
          <div className="flex gap-2">
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value…"
              maxLength={4000}
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setNewVisible((v) => !v)}
              className="px-3 py-2 rounded-md border border-border text-xs flex items-center gap-1.5 hover:bg-muted/50"
              title="Toggle whether value is shown in plain text"
            >
              {newVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {newVisible ? "Visible" : "Hidden"}
            </button>
            <button
              type="button"
              onClick={addVar}
              disabled={saving || !newName.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  );
}

type AssetKind = "icon" | "splash";

function AssetCard({
  kind,
  title,
  description,
  projectId,
  url,
  onUploaded,
}: {
  kind: AssetKind;
  title: string;
  description: string;
  projectId: string;
  url: string | null;
  onUploaded: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runGenerate = useServerFn(generateAsset);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function uploadBlob(blob: Blob, ext: "png" | "jpg") {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) throw new Error("Not signed in");
    const path = `${uid}/${projectId}/${kind}.${ext}`;
    await supabase.storage
      .from("project-attachments")
      .remove([`${uid}/${projectId}/${kind}.png`, `${uid}/${projectId}/${kind}.jpg`]);
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const { error: upErr } = await supabase.storage
      .from("project-attachments")
      .upload(path, blob, { upsert: true, contentType });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage.from("project-attachments").getPublicUrl(path);
    onUploaded(`${pub.publicUrl}?t=${Date.now()}`);
  }

  async function handleGenerate() {
    setErr(null);
    const prompt = aiPrompt.trim();
    if (prompt.length < 3) {
      setErr("Describe what to generate (at least 3 characters)");
      return;
    }
    setGenerating(true);
    try {
      const res = await runGenerate({ data: { kind, prompt } });
      if (!res.ok) throw new Error(res.error);
      const dataUrl = res.dataUrl;
      const match = /^data:(image\/(png|jpe?g));base64,(.+)$/.exec(dataUrl);
      if (!match) throw new Error("Unsupported image format");
      const mime = match[1];
      const ext: "png" | "jpg" = mime === "image/png" ? "png" : "jpg";
      const bin = atob(match[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await uploadBlob(new Blob([bytes], { type: mime }), ext);
      setAiOpen(false);
      setAiPrompt("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }


  async function handleFile(file: File) {
    setErr(null);
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setErr("Use a PNG or JPG file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Max 5MB");
      return;
    }
    setBusy(true);
    try {
      const ext: "png" | "jpg" = file.type === "image/png" ? "png" : "jpg";
      await uploadBlob(file, ext);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      await supabase.storage
        .from("project-attachments")
        .remove([`${uid}/${projectId}/${kind}.png`, `${uid}/${projectId}/${kind}.jpg`]);
      onUploaded(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
          <ImageIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {url ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 p-4 grid place-items-center">
            <img src={url} alt={title} className="max-h-48 w-auto rounded-md object-contain" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex-1 px-3 py-2 rounded-md border border-border text-xs hover:bg-muted/50 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={removeAsset}
              className="px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-destructive disabled:opacity-40 flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-primary/40 rounded-lg p-8 text-center hover:bg-primary/5 transition-colors disabled:opacity-40"
        >
          <Upload className="h-6 w-6 mx-auto text-primary mb-2" />
          <p className="text-sm font-medium">
            {busy ? "Uploading…" : `Click to upload ${kind === "icon" ? "icon" : "splash screen"}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG (max 5MB)</p>
        </button>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        {!aiOpen ? (
          <button
            type="button"
            disabled={busy || generating}
            onClick={() => setAiOpen(true)}
            className="w-full px-3 py-2 rounded-md border border-primary/40 text-xs flex items-center justify-center gap-1.5 text-primary hover:bg-primary/5 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate with AI
          </button>
        ) : (
          <div className="space-y-2">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={
                kind === "icon"
                  ? "e.g. minimalist purple diamond crystal logo"
                  : "e.g. soft gradient sunrise with subtle mountain silhouette"
              }
              rows={2}
              maxLength={500}
              disabled={generating}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiOpen(false);
                  setAiPrompt("");
                  setErr(null);
                }}
                disabled={generating}
                className="px-3 py-2 rounded-md border border-border text-xs hover:bg-muted/50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || aiPrompt.trim().length < 3}
                className="flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function AssetsPanel({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged?: () => void }) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [splashUrl, setSplashUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: files } = await supabase.storage
        .from("project-attachments")
        .list(`${uid}/${projectId}`, { limit: 100 });
      if (cancelled) return;
      const find = (kind: AssetKind) =>
        files?.find((f) => f.name === `${kind}.png` || f.name === `${kind}.jpg`);
      const iconFile = find("icon");
      const splashFile = find("splash");
      const bust = `?t=${Date.now()}`;
      setIconUrl(
        iconFile
          ? supabase.storage
              .from("project-attachments")
              .getPublicUrl(`${uid}/${projectId}/${iconFile.name}`).data.publicUrl + bust
          : null,
      );
      setSplashUrl(
        splashFile
          ? supabase.storage
              .from("project-attachments")
              .getPublicUrl(`${uid}/${projectId}/${splashFile.name}`).data.publicUrl + bust
          : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <header className="p-5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
            <ImageIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg truncate">Assets</h2>
            <p className="text-xs text-muted-foreground truncate">
              Manage app icon and splash screen
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <AssetCard
              kind="icon"
              title="App Icon"
              description="Upload a custom icon · 1024x1024 PNG recommended"
              projectId={projectId}
              url={iconUrl}
              onUploaded={(u) => { setIconUrl(u); onChanged?.(); }}
            />
            <AssetCard
              kind="splash"
              title="Splash Screen"
              description="Upload a custom splash screen · 1024x1024 PNG recommended"
              projectId={projectId}
              url={splashUrl}
              onUploaded={(u) => { setSplashUrl(u); onChanged?.(); }}
            />
          </>
        )}
      </div>
    </section>
  );
}

type KnowledgeRow = {
  id: string;
  title: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  updated_at: string;
};

function KnowledgeDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<KnowledgeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftFileUrl, setDraftFileUrl] = useState<string | null>(null);
  const [draftFileName, setDraftFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const db = supabase as unknown as {
    from: (t: string) => any;
    storage: { from: (b: string) => any };
  };

  async function load() {
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) {
      setErr("Not signed in");
      setRows([]);
      return;
    }
    const { data, error } = await db
      .from("knowledge_items")
      .select("id, title, content, file_url, file_name, updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as KnowledgeRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setDraftTitle("");
    setDraftContent("");
    setDraftFileUrl(null);
    setDraftFileName(null);
  }
  function startEdit(r: KnowledgeRow) {
    setCreating(false);
    setEditing(r);
    setDraftTitle(r.title);
    setDraftContent(r.content);
    setDraftFileUrl(r.file_url);
    setDraftFileName(r.file_name);
  }
  function cancelDraft() {
    setEditing(null);
    setCreating(false);
  }

  async function handleUpload(file: File) {
    if (!uid) return;
    setUploading(true);
    try {
      const path = `${uid}/knowledge/${Date.now()}-${file.name}`;
      const { error } = await db.storage
        .from("project-attachments")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = db.storage.from("project-attachments").getPublicUrl(path);
      setDraftFileUrl(data.publicUrl as string);
      setDraftFileName(file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!uid) return;
    if (!draftTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setSavingId(editing?.id ?? "new");
    try {
      if (editing) {
        const { error } = await db
          .from("knowledge_items")
          .update({
            title: draftTitle.trim(),
            content: draftContent,
            file_url: draftFileUrl,
            file_name: draftFileName,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast("Knowledge updated");
      } else {
        const { error } = await db.from("knowledge_items").insert({
          user_id: uid,
          title: draftTitle.trim(),
          content: draftContent,
          file_url: draftFileUrl,
          file_name: draftFileName,
        });
        if (error) throw error;
        toast("Knowledge added");
      }
      cancelDraft();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this knowledge item?")) return;
    setSavingId(id);
    try {
      const { error } = await db.from("knowledge_items").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      toast("Knowledge deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSavingId(null);
    }
  }

  const isDrafting = creating || !!editing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Knowledge</h2>
            <span className="text-xs text-muted-foreground">
              Reference snippets and files the AI can use
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isDrafting ? (
            <div className="rounded-xl border border-border p-3 space-y-3 bg-background/40">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Title (e.g. Brand voice, API spec)"
                className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Reference snippet the AI should remember…"
                rows={6}
                className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border border-border hover:bg-background disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  {draftFileName ? "Replace file" : "Attach file"}
                </button>
                {draftFileName && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <a
                      href={draftFileUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="underline truncate max-w-[200px]"
                    >
                      {draftFileName}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftFileUrl(null);
                        setDraftFileName(null);
                      }}
                      className="h-6 w-6 grid place-items-center rounded hover:bg-background"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelDraft}
                    className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium hover:bg-muted/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={savingId !== null}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {savingId !== null && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {editing ? "Save changes" : "Add knowledge"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40"
            >
              <Plus className="h-3.5 w-3.5" />
              New knowledge item
            </button>
          )}

          {rows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No knowledge items yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="group flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    {r.content && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                        {r.content}
                      </p>
                    )}
                    {r.file_name && (
                      <a
                        href={r.file_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground/90 underline"
                      >
                        <Paperclip className="h-3 w-3" />
                        {r.file_name}
                      </a>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      Updated {new Date(r.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      disabled={savingId === r.id}
                      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background disabled:opacity-50"
                      aria-label="Delete"
                    >
                      {savingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

type ConnectorRow = {
  id: string;
  provider: string;
  label: string;
  token: string;
  account: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

const PROVIDERS: { id: string; name: string; help: string; tokenLabel: string }[] = [
  {
    id: "github",
    name: "GitHub",
    help: "Create a fine-grained PAT with repo:read at github.com/settings/tokens.",
    tokenLabel: "Personal access token",
  },
  {
    id: "gitlab",
    name: "GitLab",
    help: "Create a token with read_api scope at gitlab.com/-/profile/personal_access_tokens.",
    tokenLabel: "Personal access token",
  },
  {
    id: "custom",
    name: "Custom",
    help: "Store any API key for later use by the AI.",
    tokenLabel: "API key / token",
  },
];

function ConnectorsDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ConnectorRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConnectorRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [draftProvider, setDraftProvider] = useState<string>("github");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [reposByConn, setReposByConn] = useState<Record<string, { name: string; full_name: string; html_url: string; private: boolean }[]>>({});
  const [reposLoading, setReposLoading] = useState<string | null>(null);
  const [reposErr, setReposErr] = useState<Record<string, string>>({});

  const db = supabase as unknown as { from: (t: string) => any };

  async function load() {
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) {
      setErr("Not signed in");
      setRows([]);
      return;
    }
    const { data, error } = await db
      .from("user_connectors")
      .select("id, provider, label, token, account, metadata, updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as ConnectorRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setDraftProvider("github");
    setDraftLabel("");
    setDraftToken("");
    setShowToken(false);
  }
  function startEdit(r: ConnectorRow) {
    setCreating(false);
    setEditing(r);
    setDraftProvider(r.provider);
    setDraftLabel(r.label);
    setDraftToken(r.token);
    setShowToken(false);
  }
  function cancelDraft() {
    setEditing(null);
    setCreating(false);
  }

  async function handleSave() {
    if (!uid) return;
    if (!draftLabel.trim() || !draftToken.trim()) {
      toast.error("Label and token are required");
      return;
    }
    setSavingId(editing?.id ?? "new");
    let account: string | null = null;
    if (draftProvider === "github") {
      try {
        const r = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${draftToken.trim()}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (r.ok) {
          const j = (await r.json()) as { login?: string };
          account = j.login ?? null;
        } else if (r.status === 401) {
          toast.error("GitHub rejected this token");
          setSavingId(null);
          return;
        }
      } catch {
        // Ignore network errors and still save
      }
    }
    try {
      if (editing) {
        const { error } = await db
          .from("user_connectors")
          .update({
            provider: draftProvider,
            label: draftLabel.trim(),
            token: draftToken.trim(),
            account,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast("Connector updated");
      } else {
        const { error } = await db.from("user_connectors").insert({
          user_id: uid,
          provider: draftProvider,
          label: draftLabel.trim(),
          token: draftToken.trim(),
          account,
        });
        if (error) throw error;
        toast("Connector added");
      }
      cancelDraft();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Disconnect and remove this connector?")) return;
    setSavingId(id);
    try {
      const { error } = await db.from("user_connectors").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      setReposByConn((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      toast("Connector removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setSavingId(null);
    }
  }

  async function fetchRepos(r: ConnectorRow) {
    if (r.provider !== "github") return;
    setReposLoading(r.id);
    setReposErr((e) => ({ ...e, [r.id]: "" }));
    try {
      const res = await fetch(
        "https://api.github.com/user/repos?per_page=30&sort=updated",
        {
          headers: {
            Authorization: `Bearer ${r.token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const list = (await res.json()) as ConnectorRow["metadata"] as any;
      setReposByConn((m) => ({ ...m, [r.id]: list }));
    } catch (e) {
      setReposErr((m) => ({
        ...m,
        [r.id]: e instanceof Error ? e.message : "Failed to load repos",
      }));
    } finally {
      setReposLoading(null);
    }
  }

  const isDrafting = creating || !!editing;
  const providerMeta = PROVIDERS.find((p) => p.id === draftProvider) ?? PROVIDERS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Connectors</h2>
            <span className="text-xs text-muted-foreground">
              Connect accounts so the AI can fetch their data
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isDrafting ? (
            <div className="rounded-xl border border-border p-3 space-y-3 bg-background/40">
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDraftProvider(p.id)}
                    className={`h-9 rounded-md border text-xs font-medium transition-colors ${
                      draftProvider === p.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Label (e.g. Personal GitHub)"
                className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="relative">
                <input
                  value={draftToken}
                  onChange={(e) => setDraftToken(e.target.value)}
                  placeholder={providerMeta.tokenLabel}
                  type={showToken ? "text" : "password"}
                  className="w-full bg-transparent border border-border rounded-md pl-3 pr-10 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-1 top-1 h-7 w-7 grid place-items-center rounded text-muted-foreground hover:bg-background"
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">{providerMeta.help}</p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDraft}
                  className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium hover:bg-muted/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={savingId !== null}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {savingId !== null && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {editing ? "Save changes" : "Connect"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startCreate}
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add connector
            </button>
          )}

          {rows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No connectors yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const repos = reposByConn[r.id];
                const rerr = reposErr[r.id];
                const Icon = r.provider === "github" ? Github : Workflow;
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-border/60 bg-background/30"
                  >
                    <div className="flex items-start gap-3 px-3 py-2.5">
                      <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{r.label}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {r.provider}
                          </span>
                        </div>
                        {r.account && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            @{r.account}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          Updated {new Date(r.updated_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.provider === "github" && (
                          <button
                            type="button"
                            onClick={() => fetchRepos(r)}
                            disabled={reposLoading === r.id}
                            className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium border border-border hover:bg-background disabled:opacity-50"
                          >
                            {reposLoading === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Fetch repos
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={savingId === r.id}
                          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background disabled:opacity-50"
                          aria-label="Disconnect"
                        >
                          {savingId === r.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    {rerr && (
                      <div className="px-3 pb-2 text-xs text-destructive">{rerr}</div>
                    )}
                    {repos && (
                      <div className="px-3 pb-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                          {repos.length} repositories
                        </div>
                        <ul className="max-h-48 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
                          {repos.map((repo) => (
                            <li
                              key={repo.full_name}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-accent/30"
                            >
                              <a
                                href={repo.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="truncate underline-offset-2 hover:underline"
                              >
                                {repo.full_name}
                              </a>
                              {repo.private && (
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  private
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
