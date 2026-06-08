import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
// flushSync removed — no longer streaming token-by-token
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { PlanSummary } from "@/components/PlanSummary";
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
  Bell,
  Store,
  CloudUpload,
  Brain,
  BookOpen as BookOpenIcon,
  Rocket,
  Layers,
  LayoutGrid,
  FolderCode,
  Shield,
  Palette,
  Globe,
  FileText,
  Cloud,
  BarChart3,
  MoreHorizontal,
  ArrowUpRight,
  PanelLeft,
  Copy,
  ClipboardCheck,
  ChevronUp,
  Zap,
  RotateCcw,
  GitBranch,
  GitFork,
  LayoutGrid as LayoutGridIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { useCollaboration } from "@/hooks/use-collaboration";
import { PresenceBar, CollaborationOverlay } from "@/components/CollaborationOverlay";
import { generateProject } from "@/lib/generate-project.functions";
import { generateAppImages } from "@/lib/app-images.functions";

import { generateAsset } from "@/lib/generate-asset.functions";
import { sendProjectMessage } from "@/lib/project-chat.functions";
import { ProjectPreview } from "@/components/ProjectPreview";
import { AgentWorkspace } from "@/components/AgentWorkspace";
import { MobileAppRenderer } from "@/components/MobileAppRenderer";
import { DeviceFrame, DEVICE_PRESETS, DeviceToolbar } from "@/components/DeviceFrame";
import { resolveTheme } from "@/lib/mobile-theme";
import { ComponentPalette } from "@/components/ComponentPalette";
import { parseAppSchema } from "@/lib/code-gen";
import { validateAndFixSchema } from "@/lib/schema-validator";
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
// Removed import: KnowledgeBasePanel was a hardcoded-seed placeholder that
// never touched the knowledge_items table. The sidebar now opens the real
// KnowledgeDialog (imported below).
import { DeploymentsPanel } from "@/components/DeploymentsPanel";
import { FigmaImportPanel } from "@/components/FigmaImportPanel";
import { CodeExportPanel } from "@/components/CodeExportPanel";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { CodeViewerPanel } from "@/components/CodeViewerPanel";
import { SecretsPanel } from "@/components/SecretsPanel";
import { TestingPanel } from "@/components/TestingPanel";
import { SandboxPanel } from "@/components/SandboxPanel";
import { PluginStorePanel } from "@/components/PluginStorePanel";
import { inferBackendSpec, applyBackendSchema, getBackendSpec } from "@/lib/backend-provision.functions";
import { exportExpoProject } from "@/lib/export-expo.functions";
import { useTypewriter, APP_TYPED_PHRASES } from "@/hooks/useTypewriter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HistoryDialog } from "@/components/studio/HistoryDialog";
import { BackendPanel } from "@/components/studio/BackendPanel";
import { EnvPanel } from "@/components/studio/EnvPanel";
import { NativeCapabilitiesPanel } from "@/components/studio/NativeCapabilitiesPanel";
import { StoreListingPanel } from "@/components/studio/StoreListingPanel";
import { OtaUpdatesPanel } from "@/components/studio/OtaUpdatesPanel";
import { AssetsPanel } from "@/components/studio/AssetsPanel";
import { KnowledgeDialog } from "@/components/studio/KnowledgeDialog";
import { ConnectorsDialog } from "@/components/studio/ConnectorsDialog";
import TemplateGallery from "@/components/TemplateGallery";
import { DesignBriefCard } from "@/components/DesignBriefCard";

// ── Conversation branching types (inspired by Dyad) ───────────────────
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; pending?: boolean; agentRole?: AgentRole | null; agentName?: string; phase?: string; collapsed?: boolean; designBrief?: Record<string, unknown>; mockupUrl?: string | null; planSteps?: string[]; briefAppName?: string };
type ConversationBranch = {
  id: string;
  label: string;
  forkIndex: number; // index in messages where fork happened
  messages: ChatMessage[];
  createdAt: number;
};

// ── Enhanced Code Block for chat (inspired by Bolt.diy) ──────────────────
function ChatCodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-border/50 bg-background/80">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/40">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? <ClipboardCheck className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed font-mono">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// ── Custom ReactMarkdown components for enhanced rendering ──────────────
const markdownComponents = {
  code({ className, children, ...props }: { className?: string; children?: React.ReactNode; [k: string]: unknown }) {
    const match = /language-(\w+)/.exec(className || "");
    const codeStr = String(children).replace(/\n$/, "");
    // Inline code (no language class, short)
    if (!match && codeStr.length < 80 && !codeStr.includes("\n")) {
      return <code className="px-1.5 py-0.5 rounded-md bg-muted/60 font-mono text-xs text-primary/90 border border-border/30" {...props}>{children}</code>;
    }
    return <ChatCodeBlock language={match?.[1]}>{codeStr}</ChatCodeBlock>;
  },
  pre({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  },
};

// ── Starter prompts for empty chat state (inspired by VibeSDK) ──────────
const STARTER_PROMPTS = [
  { emoji: "🎨", label: "Design the screens", prompt: "Design all the screens for this app with premium UI elements, color palette, and typography" },
  { emoji: "🗄️", label: "Set up the database", prompt: "Design the database schema with tables, relationships, indexes, and RLS policies" },
  { emoji: "⚙️", label: "Build the backend", prompt: "Design the backend architecture with auth, storage, and edge functions" },
  { emoji: "🧪", label: "Write test cases", prompt: "Write a comprehensive test plan with test cases for all critical flows" },
  { emoji: "🚀", label: "Plan the launch", prompt: "Create a launch plan with app store listing, CI/CD pipeline, and release checklist" },
  { emoji: "🧠", label: "Add AI features", prompt: "Recommend AI features that make sense for this app with model choices and prompt designs" },
];


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

function proxiedImageUrl(url?: string) {
  if (!url || url.startsWith("/") || url.startsWith("data:")) return url;
  return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
}

function normalizeSchemaImages(schema: MobileAppSchema): MobileAppSchema {
  const clone = JSON.parse(JSON.stringify(schema)) as MobileAppSchema;

  for (const screen of clone.screens ?? []) {
    const screenWithBackground = screen as MobileAppSchema["screens"][number] & {
      background?: { type?: string; image?: string };
    };

    if (screenWithBackground.background?.type === "image" && screenWithBackground.background.image) {
      screenWithBackground.background.image = proxiedImageUrl(screenWithBackground.background.image);
    }

    for (const element of screen.elements ?? []) {
      const props = (element as { props?: { src?: string; image?: string } }).props;
      if (!props) continue;
      if (props.src) props.src = proxiedImageUrl(props.src);
      if (props.image) props.image = proxiedImageUrl(props.image);
    }
  }

  return clone;
}

function resolveRenderableSchema(
  result: string | null | undefined,
  liveSchema: MobileAppSchema | null,
  demoApp: string,
): MobileAppSchema {
  const parsed = result ? parseAppSchema(result) : null;
  const base = liveSchema ?? parsed ?? SAMPLE_APPS[demoApp] ?? SAMPLE_FITTRACK;
  const normalized = normalizeSchemaImages(base);
  return validateAndFixSchema(normalized).schema ?? normalized;
}

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectPage,
  head: () => ({
    meta: [{ title: "Workspace — Mobivable" }],
  }),
});

type SidebarChild = {
  icon: typeof MessageSquare;
  label: string;
  panelKey: string | null;
  proOnly?: boolean;
};
type SidebarSection = {
  icon: typeof MessageSquare;
  label: string;
  children: SidebarChild[];
};

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    icon: MessageSquare,
    label: "Chat",
    children: [{ icon: MessageSquare, label: "Chat", panelKey: null }],
  },
  {
    icon: Palette,
    label: "Design",
    children: [
      { icon: LayoutGrid, label: "Components", panelKey: "components" },
      { icon: Layers, label: "Figma Import", panelKey: "figma" },
      { icon: ImageIcon, label: "Assets", panelKey: "assets" },
    ],
  },
  {
    icon: Brain,
    label: "AI Studio",
    children: [
      { icon: Brain, label: "AI Studio", panelKey: "aistudio" },
      { icon: BookOpenIcon, label: "Knowledge", panelKey: "knowledge" },
    ],
  },
  {
    icon: Code2,
    label: "Code",
    children: [
      { icon: Code2, label: "Editor", panelKey: "code" },
      { icon: FolderCode, label: "Viewer", panelKey: "code_viewer" },
      { icon: Terminal, label: "Console", panelKey: "console" },
      { icon: Smartphone, label: "Export", panelKey: "code_export" },
    ],
  },
  {
    icon: Database,
    label: "Backend & Data",
    children: [
      { icon: Database, label: "Backend", panelKey: "backend", proOnly: true },
      { icon: Sparkles, label: "AI & Env Keys", panelKey: "env" },
      { icon: Shield, label: "Secrets", panelKey: "secrets" },
    ],
  },
  {
    icon: Rocket,
    label: "Publish",
    children: [
      { icon: Store, label: "Store Listing", panelKey: "store" },
      { icon: Rocket, label: "Deployments", panelKey: "deployments" },
      { icon: CloudUpload, label: "OTA Updates", panelKey: "ota" },
      { icon: Bell, label: "Native", panelKey: "native" },
      { icon: DollarSign, label: "Monetization", panelKey: "monetization" },
    ],
  },
  {
    icon: Shield,
    label: "Testing",
    children: [
      { icon: Shield, label: "Testing & QA", panelKey: "testing" },
      { icon: Shield, label: "E2B Sandbox", panelKey: "sandbox" },
      { icon: Shield, label: "Plugin Store", panelKey: "plugins" },
    ],
  },
  {
    icon: History,
    label: "History",
    children: [{ icon: History, label: "Version Control", panelKey: "history" }],
  },
  {
    icon: Settings,
    label: "Settings & Help",
    children: [
      { icon: Settings, label: "Settings", panelKey: "settings" },
      { icon: LifeBuoy, label: "Get Support", panelKey: "support" },
    ],
  },
];

function ProjectPage() {
  const { status, session } = useRequiredSession();
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const agentStorageKey = `mobivable:selectedAgent:${projectId}`;
  const [selectedAgent, setSelectedAgent] = useState<AgentRole | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(`mobivable:selectedAgent:${projectId}`);
    if (saved === "__team__" || !saved) return null;
    return saved && (ALL_ROLES as string[]).includes(saved)
      ? (saved as AgentRole)
      : null;
  });
  const agentHydratedRef = useRef(false);
  // Hydrate from localStorage immediately, then reconcile with the cloud-synced value.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(agentStorageKey);
    const local: AgentRole | null =
      saved === "__team__" || !saved
        ? null
        : saved && (ALL_ROLES as string[]).includes(saved)
          ? (saved as AgentRole)
          : null;
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
      if (remote === "__team__") {
        setSelectedAgent(null);
        window.localStorage.setItem(agentStorageKey, "__team__");
      } else if (remote && (ALL_ROLES as string[]).includes(remote) && remote !== (local ?? "__team__")) {
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
    window.localStorage.setItem(agentStorageKey, selectedAgent ?? "__team__");
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
          { user_id: uid, project_id: projectId, selected_agent: selectedAgent ?? "__team__" },
          { onConflict: "user_id,project_id" },
        );
    })();
  }, [agentStorageKey, selectedAgent, projectId]);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [briefOpen, setBriefOpen] = useState(false);
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
  // "Pro" gates anything above free_beta/starter. scale and business are
  // higher tiers than pro and should also have access. Previously this only
  // matched "pro" exactly, locking scale/business users out of Backend etc.
  const isPro = userPlan === "pro" || userPlan === "scale" || userPlan === "business" || isAdmin;
  const [sidePanel, setSidePanel] = useState<null | "backend" | "env" | "assets" | "code" | "console" | "monetization" | "native" | "store" | "ota" | "history" | "support" | "settings" | "aistudio" | "knowledge" | "deployments" | "code_export" | "figma" | "components" | "code_viewer" | "secrets" | "testing" | "sandbox" | "plugins">(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const { entries: consoleEntries, addEntry: addConsoleEntry, clear: clearConsole } = useConsoleCapture();
  const [appAssets, setAppAssets] = useState<{ icon: string | null; splash: string | null }>({ icon: null, splash: null });
  const [assetsTick, setAssetsTick] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [agentsMdOpen, setAgentsMdOpen] = useState(false);
  const [exportingExpo, setExportingExpo] = useState(false);
  const [projectIntegration, setProjectIntegration] = useState<{ supabase_url: string | null; supabase_anon_key: string | null }>({ supabase_url: null, supabase_anon_key: null });
  // Monetization config (provider + provider-specific keys) loaded from
  // project_env_vars so the Export panel can bake them into the generated
  // Expo project. Same allow-list used by the server-side exportExpoProject.
  const [monetizationConfig, setMonetizationConfig] = useState<{ provider: string | null; keys: Record<string, string> }>({ provider: null, keys: {} });
  const [selectedDevice, setSelectedDevice] = useState("iPhone 16");
  const [landscape, setLandscape] = useState(false);
  const [renderMode, setRenderMode] = useState<'react' | 'flutter'>('react');
  // Phase B: per-screen PNG capture from the preview toolbar. Single handler
  // for both render modes — React uses captureSimple on previewRootRef,
  // Flutter uses the postMessage protocol exposed by flutter-bridge.ts.
  const [capturingScreen, setCapturingScreen] = useState(false);
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [teamBanner, setTeamBanner] = useState<{ phaseLabel: string; agents: { role: AgentRole; name: string }[] } | null>(null);
  const [input, setInput] = useState("");
  const typedHint = useTypewriter(APP_TYPED_PHRASES, !input);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Auto-grow textarea to fit content (capped by max-h class).
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);
  // Focus composer on mount.
  useEffect(() => {
    composerRef.current?.focus();
  }, []);
  const [plusOpen, setPlusOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [studioGalleryOpen, setStudioGalleryOpen] = useState(false);

  // ── Conversation branching state (inspired by Dyad) ─────────────────
  const branchStorageKey = `mobivable:branches:${projectId}`;
  const [branches, setBranches] = useState<ConversationBranch[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(`mobivable:branches:${projectId}`) ?? "[]");
    } catch { return []; }
  });
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [branchBarOpen, setBranchBarOpen] = useState(false);

  // Persist branches to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(branchStorageKey, JSON.stringify(branches));
    } catch { /* ignore */ }
  }, [branches, branchStorageKey]);

  // Fork conversation at a specific message index
  const forkConversation = useCallback((atIndex: number) => {
    const branchMessages = messages.slice(0, atIndex);
    const branchId = `branch-${Date.now()}`;
    const newBranch: ConversationBranch = {
      id: branchId,
      label: `Branch ${branches.length + 1}`,
      forkIndex: atIndex,
      messages: branchMessages,
      createdAt: Date.now(),
    };
    setBranches((prev) => [...prev, newBranch]);
    // Trim current messages to the fork point
    setMessages(branchMessages);
    setActiveBranch(branchId);
    setBranchBarOpen(true);
    toast(`Forked at message ${atIndex + 1} — now on Branch ${branches.length + 1}`);
    // Focus composer for the new branch
    setTimeout(() => composerRef.current?.focus(), 100);
  }, [messages, branches]);

  // Switch to a branch
  const switchToBranch = useCallback((branchId: string | null) => {
    if (branchId === null) {
      // Switch back to main — reload messages from server
      setActiveBranch(null);
      loadMessages();
      toast("Switched to main conversation");
      return;
    }
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return;
    setMessages(branch.messages);
    setActiveBranch(branchId);
    toast(`Switched to ${branch.label}`);
  }, [branches]);

  // Delete a branch
  const deleteBranch = useCallback((branchId: string) => {
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
    if (activeBranch === branchId) {
      setActiveBranch(null);
      loadMessages();
    }
    toast("Branch deleted");
  }, [activeBranch]);
  const draftStorageKey = (role: AgentRole) => `mobivable:chatDraft:${projectId}:${role}`;
  const draftHydratedRef = useRef(false);
  // When the selected agent changes (or on mount), restore that role's draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = selectedAgent ? window.localStorage.getItem(draftStorageKey(selectedAgent)) : null;
    setInput(saved ?? "");
    // Mark hydrated on next tick so the persist effect doesn't immediately overwrite.
    draftHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent, projectId]);
  // Persist the current draft per agent role.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!draftHydratedRef.current) return;
    if (!selectedAgent) return;
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
  const studioBodyRef = useRef<HTMLDivElement | null>(null);

  // ─── Collaboration ──────────────────────────────────────────
  const {
    collaborators,
    broadcastCursor,
    broadcastSelection,
    isConnected: collabConnected,
    connectionStatus: collabStatus,
    onlineCount: collabOnlineCount,
  } = useCollaboration(projectId, session ?? null);
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
  const scrollTickRef = useRef<number | null>(null);

  // Smooth auto-scroll during streaming — uses rAF to avoid jank
  const scrollToBottom = useCallback((instant?: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    // Only auto-scroll if the user is near the bottom (within 150px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom || instant) {
      el.scrollTo({ top: el.scrollHeight, behavior: instant ? "instant" : "smooth" });
    }
  }, []);
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

        // Monetization config — filtered to the export-safe allow-list so
        // sensitive entries (e.g. stripe_webhook_secret) never reach the
        // exported zip.
        const { MONETIZATION_ENV_KEYS } = await import("@/lib/export-project");
        const { data: monRows } = await (sb as any)
          .from("project_env_vars")
          .select("name,value")
          .eq("project_id", projectId)
          .eq("user_id", u.user.id)
          .in("name", MONETIZATION_ENV_KEYS as readonly string[] as string[]);
        if (monRows && Array.isArray(monRows)) {
          const keys: Record<string, string> = {};
          let provider: string | null = null;
          for (const r of monRows as Array<{ name: string; value: string }>) {
            if (typeof r.value !== "string") continue;
            if (r.name === "monetization_provider") provider = r.value || null;
            else keys[r.name] = r.value;
          }
          setMonetizationConfig({ provider, keys });
        }
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

  /**
   * Capture the current preview screen as a PNG and download it. Works for
   * both renderModes — for `react`, captures previewRootRef via SVG
   * foreignObject (existing screenshot.ts lib); for `flutter`, sends a
   * SCREENSHOT_REQUEST postMessage and awaits the FLUTTER_SCREENSHOT reply.
   *
   * Filename includes the project name + active screen title when known so
   * a "capture-all" loop later can produce a sensible bundle.
   */
  async function handleCaptureScreen() {
    if (capturingScreen) return;
    setCapturingScreen(true);
    try {
      let dataUrl: string;
      if (renderMode === 'flutter') {
        const { captureFlutterScreenshot } = await import('@/lib/flutter-bridge');
        const iframe = document.querySelector<HTMLIFrameElement>(
          'iframe[title="Flutter Preview"]',
        );
        dataUrl = await captureFlutterScreenshot(iframe);
      } else {
        const root = previewRootRef.current;
        if (!root) throw new Error('Preview not mounted yet.');
        const { captureSimple } = await import('@/lib/screenshot');
        // Hard timeout — captureSimple uses an SVG foreignObject → <img>
        // pipeline that hangs indefinitely when the preview contains
        // cross-origin images without CORS (the SVG → image load just
        // never fires onload/onerror). 10 s is plenty for a real render;
        // beyond that we want the toast, not "Capturing…" forever.
        dataUrl = await Promise.race([
          captureSimple(root),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error('Capture timed out after 10 s. The screen may contain cross-origin images without CORS headers — try Flutter preview mode, which captures via the Flutter engine and isn\'t affected.')),
              10_000,
            ),
          ),
        ]);
      }

      const { downloadDataUrl } = await import('@/lib/screenshot');
      const schema = project?.result ? parseAppSchema(project.result) : null;
      const projectSlug = (project?.name || schema?.name || 'app')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40);
      const screenTitle = (() => {
        // The route tracks the active screen by ID, not index. Resolve to
        // index for a clean filename fallback when the screen has no title.
        const screens = schema?.screens ?? [];
        const idx = activeScreenId ? screens.findIndex((s) => s.id === activeScreenId) : 0;
        const safeIdx = idx >= 0 ? idx : 0;
        const s = screens[safeIdx];
        if (!s) return `screen-${safeIdx + 1}`;
        const raw = (s.title ?? s.id ?? '').toString();
        return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `screen-${safeIdx + 1}`;
      })();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadDataUrl(dataUrl, `${projectSlug}-${screenTitle}-${stamp}.png`);
      toast.success('Screenshot saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Capture failed');
    } finally {
      setCapturingScreen(false);
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
    // Keep composer focused so the user can keep typing while the AI streams.
    requestAnimationFrame(() => composerRef.current?.focus());
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await chatFn({ data: { projectId, content, ...(selectedAgent ? { agentRole: selectedAgent } : {}) } }) as AsyncIterable<any>;
      streamRef.current = stream as unknown as AsyncIterator<unknown>;
      let errored = false;
      for await (const event of stream) {
        if (cancelRef.current) break;
        if (event.type === "agent_start") {
          // Single agent starting — show working indicator
          const id = `${tempId}-agent-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id,
              role: "assistant",
              content: "",
              pending: true,
              agentName: event.name ?? "Studio Agent",
              agentRole: "developer" as AgentRole,
              phase: event.phase,
              collapsed: true,
            },
          ]);
          scrollToBottom();
        } else if ((event as { type: string }).type === "agent_complete") {
          // Agent finished — fill content
          const ev = event as { role: string; name: string; content: string };
          setMessages((prev) => {
            const idx = prev.findIndex(
              (m) => m.agentName === "Studio Agent" && m.pending,
            );
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: ev.content, pending: false, collapsed: false };
            return updated;
          });
          scrollToBottom();
        } else if (event.type === "agent_error") {
          errored = true;
          setMessages((prev) =>
            prev.map((m) =>
              m.agentName === "Studio Agent" && m.pending
                ? { ...m, content: `⚠️ ${event.error}`, pending: false }
                : m,
            ),
          );
        } else if (event.type === "error") {
          errored = true;
          setMessages((prev) => [
            ...prev,
            { id: `${tempId}-err`, role: "assistant", content: `⚠️ ${event.error}` },
          ]);
        } else if ((event as { type: string }).type === "design_brief") {
          // ── Plan-First: Show design brief card ──
          const ev = event as { planSteps: string[]; briefJson: string; mockupUrl: string; appName: string };
          let parsedBrief: Record<string, unknown> = {};
          try { parsedBrief = JSON.parse(ev.briefJson); } catch { /* */ }
          const briefId = `${tempId}-brief-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: briefId,
              role: "assistant",
              content: "",
              designBrief: parsedBrief,
              mockupUrl: ev.mockupUrl || null,
              planSteps: ev.planSteps ?? [],
              briefAppName: ev.appName ?? "App",
              agentName: "Plan Creator",
              agentRole: "developer" as AgentRole,
            },
          ]);
          scrollToBottom();
        } else if (event.type === "project_updated") {
          await reloadProject();
          scrollToBottom();
        } else if ((event as { type: string }).type === "tool_call") {
          const ev = event as { name: string; argsJson: string };
          const toolId = `${tempId}-tool-${ev.name}-${Date.now()}`;
          const toolLabels: Record<string, string> = {
            list_screens: "📋 Reading screens…",
            get_screen: "🔍 Inspecting screen…",
            get_project: "📂 Loading project…",
            list_projects: "📂 Loading projects…",
            update_screen: "✏️ Updating screen…",
            add_element: "➕ Adding element…",
            update_element: "🔧 Updating element…",
            remove_element: "🗑️ Removing element…",
            update_theme: "🎨 Updating theme…",
            update_navigation: "🧭 Updating navigation…",
            verify_schema: "✅ Verifying…",
            research_and_plan: "🔬 Researching & planning…",
            generate_app: "🤖 Generating app…",
            create_project: "🆕 Creating project…",
            generate_code: "💻 Generating code…",
            export_project_code: "📦 Exporting project…",
          };
          setMessages((prev) => [
            ...prev,
            {
              id: toolId,
              role: "assistant",
              content: toolLabels[ev.name] ?? `🔧 ${ev.name}…`,
              pending: true,
              agentName: "Studio Agent",
              collapsed: true,
            },
          ]);
          scrollToBottom();
        } else if ((event as { type: string }).type === "tool_done") {
          const ev = event as { toolName: string; success: boolean };
          setMessages((prev) => {
            const idx = [...prev].reverse().findIndex(
              m => m.pending && m.agentName === "Studio Agent",
            );
            if (idx === -1) return prev;
            const realIdx = prev.length - 1 - idx;
            const updated = [...prev];
            const old = updated[realIdx];
            updated[realIdx] = {
              ...old,
              content: ev.success ? old.content.replace("…", " ✓") : old.content.replace("…", " ✗"),
              pending: false,
            };
            return updated;
          });
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
    scrollToBottom(true);
  }, [messages.length, project?.result, scrollToBottom]);

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

  if (status === "loading") return <AuthHydrating />;
  if (status === "unauthenticated") return null;

  const isBuilding = !!project && (project.status === "building" || generating);
  const isReady = !!project && project.status === "ready" && !!project.result;
  const isFailed = !!project && project.status === "failed";

  return (
    <div className="min-h-screen lg:h-screen w-full lg:overflow-hidden bg-background text-foreground flex flex-col">
      {/* Top header bar — compact Lovable-style toolbar */}
      <header className="shrink-0 h-12 border-b border-border bg-background flex items-center gap-1 px-2 lg:px-3">
        {/* ── Left cluster: nav + tool icons + Preview pill ── */}
        <Link
          to="/dashboard"
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Back to dashboard"
          title="Dashboard"
        >
          <History className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => setLeftSidebarOpen((v) => !v)}
          aria-pressed={leftSidebarOpen}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Toggle sidebar"
          title={leftSidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        {/* Preview pill (active) */}
        <button
          type="button"
          className="ml-1 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary/15 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          title="Preview"
        >
          <Globe className="h-3.5 w-3.5" />
          Preview
        </button>

        {/* Tool icons */}
        <button
          type="button"
          onClick={() => setAgentsMdOpen(true)}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Agents.md"
          title="Agents.md"
        >
          <FileText className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPaneTab("export")}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Cloud"
          title="Cloud / Secrets"
        >
          <Cloud className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPaneTab("code")}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Code"
          title="Code editor"
        >
          <Code2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPaneTab("screenshots")}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Analytics"
          title="Testing & analytics"
        >
          <BarChart3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleExportExpo}
          disabled={exportingExpo}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          aria-label="More"
          title={exportingExpo ? "Packaging…" : "Export Expo project"}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {/* ── Center: URL pill ── */}
        <div className="hidden md:flex flex-1 justify-center px-4 min-w-0">
          <div className="flex items-center gap-1 h-8 max-w-md w-full rounded-full border border-border bg-muted/40 px-3 text-xs text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate flex-1 font-mono">
              /projects/{project?.id ?? "…"}
            </span>
            <button
              type="button"
              onClick={() => project?.id && window.open(`/projects/${project.id}`, "_blank")}
              className="h-6 w-6 grid place-items-center rounded-full hover:bg-muted/60 hover:text-foreground transition-colors"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewKey((k) => k + 1)}
              className="h-6 w-6 grid place-items-center rounded-full hover:bg-muted/60 hover:text-foreground transition-colors"
              aria-label="Reload preview"
              title="Reload preview"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Right cluster ── */}
        <div className="ml-auto md:ml-0 flex items-center gap-1">
          <SDLCProgressBar projectId={projectId} compact />
          <button
            type="button"
            onClick={() => toast.info("Comments coming soon")}
            className="hidden sm:grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Comments"
            title="Comments"
          >
            <MessageSquare className="h-4 w-4" />
          </button>

          {/* Theme toggle (compact) */}
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="hidden sm:grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User avatar menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="h-8 w-8 grid place-items-center rounded-full bg-primary/20 text-primary text-[11px] font-semibold uppercase hover:opacity-90 transition-opacity"
              aria-label="Account"
              title={userEmail || "Account"}
            >
              {(userEmail[0] ?? "U")}
            </button>
            {userMenuOpen && (
              <div
                className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-border bg-card shadow-lg p-1"
                onMouseLeave={() => setUserMenuOpen(false)}
              >
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium truncate">{userEmail || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!isPro) setUpgradeOpen(true); else toast.info("You're already on Pro!"); setUserMenuOpen(false); }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted/50"
                >
                  <Crown className="h-3.5 w-3.5" /> Upgrade
                </button>
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

          {/* Collaboration presence bar */}
          <PresenceBar
            collaborators={collaborators}
            connectionStatus={collabStatus}
            onlineCount={collabOnlineCount}
          />

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="hidden sm:inline">Share</span>
            <Share2 className="h-3.5 w-3.5 sm:hidden" />
          </button>

          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Publish
          </button>
        </div>
      </header>


      <div
        ref={studioBodyRef}
        className="flex-1 min-h-0 w-full lg:overflow-hidden flex flex-col lg:flex-row pb-16 lg:pb-0 relative"
        onMouseMove={(e) => {
          if (!studioBodyRef.current) return;
          const rect = studioBodyRef.current.getBoundingClientRect();
          broadcastCursor({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            area: "preview",
          });
        }}
      >
      {/* Live collaboration cursors overlay */}
      <CollaborationOverlay
        collaborators={collaborators}
        connectionStatus={collabStatus}
        onlineCount={collabOnlineCount}
        containerRef={studioBodyRef}
      />
      {/* Left rail */}
      <aside className={`${leftSidebarOpen ? "hidden lg:flex" : "hidden"} w-52 shrink-0 border-r border-border flex-col`}>
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
          {SIDEBAR_SECTIONS.map((section) => {
            const { icon: SectionIcon, label: sectionLabel, children } = section;
            const isSingleItem = children.length === 1;
            const isExpanded = expandedSection === sectionLabel;
            // Section is active if any child panel matches the current sidePanel
            const sectionActive = children.some(
              (c) => (c.panelKey === null && sidePanel === null) || (c.panelKey !== null && sidePanel === c.panelKey),
            );

            return (
              <div key={sectionLabel}>
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => {
                    if (isSingleItem) {
                      // Direct navigation for single-child sections
                      const child = children[0];
                      if (child.proOnly && !isPro) {
                        setUpgradeOpen(true);
                      } else {
                        setSidePanel(child.panelKey as any);
                      }
                    } else {
                      setExpandedSection(isExpanded ? null : sectionLabel);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    sectionActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <SectionIcon className="h-4 w-4" />
                  <span className="flex-1 text-left">{sectionLabel}</span>
                  {!isSingleItem && (
                    <ChevronRight
                      className={`h-3 w-3 transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  )}
                </button>

                {/* Expandable children */}
                {!isSingleItem && isExpanded && (
                  <div className="ml-3 pl-3 border-l border-border/50 mt-0.5 space-y-0.5">
                    {children.map((child) => {
                      const ChildIcon = child.icon;
                      const isChildActive =
                        (child.panelKey === null && sidePanel === null) ||
                        (child.panelKey !== null && sidePanel === child.panelKey);
                      const locked = child.proOnly && !isPro;
                      return (
                        <button
                          key={child.label}
                          type="button"
                          onClick={() => {
                            if (locked) {
                              setUpgradeOpen(true);
                            } else {
                              setSidePanel(child.panelKey as any);
                            }
                          }}
                          title={locked ? "This is a Pro feature" : undefined}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
                            isChildActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          <ChildIcon className="h-3.5 w-3.5" />
                          <span className="flex-1 text-left">{child.label}</span>
                          {locked && (
                            <span className="text-[8px] font-mono uppercase tracking-widest px-1 py-0.5 rounded bg-primary/15 text-primary">
                              Pro
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Chat thread */}
      <section className={`${sidePanel !== null ? "hidden" : mobileView === "chat" ? "flex" : "hidden"} ${sidePanel !== null || !leftSidebarOpen ? "lg:hidden" : "lg:flex"} flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col`}>
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
                  Talking to · <span className="text-primary">{selectedAgent ? AGENTS[selectedAgent].name : "Entire Team"}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <p className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Select an agent
                </p>
                <div className="max-h-80 overflow-y-auto space-y-0.5">
                  {/* Entire Team option */}
                  <button
                    type="button"
                    onClick={() => setSelectedAgent(null)}
                    className={`w-full text-left px-2 py-2 rounded-md text-sm transition-colors border ${
                      selectedAgent === null
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "border-transparent hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          selectedAgent === null ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                        }`}
                      />
                      <span className={`truncate ${selectedAgent === null ? "font-semibold" : "font-medium"}`}>
                        🏢 Entire Team
                      </span>
                      {selectedAgent === null && (
                        <span className="ml-auto shrink-0 text-[9px] font-mono uppercase tracking-widest text-primary">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 pl-3.5 truncate">
                      AI auto-routes your message to the best agents
                    </p>
                  </button>
                  <div className="my-1 h-px bg-border/60" />
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





        {/* Agent brief: functionalities + templates */}
        {(() => {
          if (!selectedAgent) {
            // Team mode — show a compact team summary
            return (
              <div className="px-4 py-2.5 border-b border-border bg-card/40">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-primary/15 grid place-items-center shrink-0">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm leading-tight">Entire Team</p>
                    <p className="text-[11px] text-muted-foreground leading-snug truncate">AI auto-routes your message to the best agents for each task</p>
                  </div>
                </div>
              </div>
            );
          }
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
            <div className="px-4 py-2.5 border-b border-border bg-card/40">
              <button
                type="button"
                onClick={() => setBriefOpen((v) => !v)}
                className="w-full flex items-center gap-2 text-left"
                aria-expanded={briefOpen}
              >
                <div className="h-6 w-6 rounded-md bg-primary/15 grid place-items-center shrink-0">
                  <Users className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm leading-tight truncate">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug truncate">{a.short}</p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${briefOpen ? "rotate-180" : ""}`}
                />
              </button>
              {briefOpen && (
                <>
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
                </>
              )}
            </div>
          );
        })()}


        {/* Conversation branching bar (inspired by Dyad) */}
        {branches.length > 0 && (
          <div className="px-3 py-1.5 border-b border-border bg-card/30 flex items-center gap-2" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            <button
              type="button"
              onClick={() => setBranchBarOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
              <GitBranch className="h-3 w-3" />
              {activeBranch
                ? branches.find((b) => b.id === activeBranch)?.label ?? "Branch"
                : "Main"}
              <span className="px-1 py-0.5 rounded bg-muted text-[9px]">{branches.length + 1}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${branchBarOpen ? "rotate-180" : ""}`} />
            </button>

            {branchBarOpen && (
              <div className="flex items-center gap-1 ml-auto overflow-x-auto">
                {/* Main branch */}
                <button
                  type="button"
                  onClick={() => switchToBranch(null)}
                  className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-colors ${
                    activeBranch === null
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  Main
                </button>
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => switchToBranch(b.id)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-colors ${
                        activeBranch === b.id
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {b.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBranch(b.id)}
                      className="h-4 w-4 grid place-items-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                      title="Delete branch"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 relative scroll-smooth" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>

          {/* Streaming progress indicator (inspired by Bolt.diy) */}
          {sending && (
            <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 px-4 py-2 bg-gradient-to-b from-background via-background/95 to-transparent" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full" style={{ animation: 'streamingProgress 2s ease-in-out infinite' }} />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-primary shrink-0 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Generating
                </span>
              </div>
            </div>
          )}

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
              {/* Empty state with starter prompts (inspired by VibeSDK) */}
              {messages.length === 0 && !project.result && (
                <div className="flex flex-col items-center justify-center py-8 px-2" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center mb-4 shadow-lg shadow-primary/10">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="font-display text-xl uppercase tracking-tight text-center mb-1">
                    {project.name ?? "Your App"}
                  </h2>
                  <p className="text-sm text-muted-foreground text-center mb-6 max-w-[280px]">
                    What would you like to build? Pick a starting point or describe your vision.
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-[360px]">
                    {STARTER_PROMPTS.map((sp) => (
                      <button
                        key={sp.label}
                        type="button"
                        onClick={() => handleSend(undefined, sp.prompt)}
                        disabled={sending}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/60 bg-card/60 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 text-left group disabled:opacity-50"
                      >
                        <span className="text-lg shrink-0">{sp.emoji}</span>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{sp.label}</span>
                      </button>
                    ))}
                  </div>
                  {/* Browse Templates button */}
                  <button
                    type="button"
                    onClick={() => setStudioGalleryOpen(true)}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-border/60 bg-card/30 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <LayoutGridIcon className="h-4 w-4" />
                    Or browse template gallery
                  </button>
                </div>
              )}

              {/* Initial user prompt */}
              <div className="flex justify-end gap-2" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
                <div className="max-w-[80%] rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border border-primary/20 px-4 py-3 shadow-sm hover:shadow-md transition-shadow duration-300">
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
                          className="h-16 w-16 rounded-lg overflow-hidden border border-primary/20 hover:border-primary/50 transition-colors shadow-sm"
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
                  <p className="mt-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
                    {(() => {
                      if (!project.created_at) return "Just now";
                      const d = new Date(project.created_at);
                      return isNaN(d.getTime()) ? "Just now" : d.toLocaleTimeString();
                    })()}{" "}
                    · {project.model}
                  </p>
                </div>
              </div>

              {/* Initial plan from generation */}
              {(isBuilding || isFailed || (isReady && project.result)) && (
                <div className="flex justify-start">
                  <div className="max-w-[90%] w-full rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
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
                      <PlanSummary content={project.result} />
                    )}
                  </div>
                </div>
              )}

              {/* Team chat messages (multi-agent) */}
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end gap-2 group/msg" style={{ animation: 'fadeInUp 0.35s ease-out' }}>
                      <div className="max-w-[80%] rounded-2xl bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border border-primary/20 px-4 py-3 shadow-sm hover:shadow-md transition-shadow duration-300">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        {/* Message actions on user messages */}
                        <div className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                              toast("Copied to clipboard");
                            }}
                            className="h-5 w-5 grid place-items-center rounded text-muted-foreground/50 hover:text-primary transition-colors"
                            title="Copy message"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          {/* Fork conversation (inspired by Dyad) */}
                          <button
                            type="button"
                            onClick={() => {
                              const idx = messages.indexOf(m);
                              if (idx >= 0) forkConversation(idx);
                            }}
                            className="h-5 w-5 grid place-items-center rounded text-muted-foreground/50 hover:text-primary transition-colors"
                            title="Fork conversation from here"
                          >
                            <GitFork className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                const role = m.agentRole;
                const badge = role ? AGENT_BADGE[role] : null;
                const name = m.agentName ?? (role ? AGENTS[role].name : "Assistant");
                return (
                  <div key={m.id} className="flex justify-start gap-2.5 group/msg" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                    <div
                      className={`h-8 w-8 shrink-0 rounded-full border-2 grid place-items-center text-base shadow-sm mt-1 ${
                        badge?.tint ?? "bg-muted/40 text-muted-foreground border-border"
                      }`}
                      aria-hidden
                    >
                      {badge?.emoji ?? "🤖"}
                    </div>
                    <div className="max-w-[85%] w-full rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition-shadow duration-300" style={{ borderLeftWidth: '3px', borderLeftColor: badge ? undefined : 'var(--primary)' }}>
                      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                        <span className={`text-[11px] font-display uppercase tracking-widest px-2 py-0.5 rounded-md border ${badge?.tint ?? "border-border text-muted-foreground"}`}>
                          {name}
                        </span>
                        {m.phase && (
                          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">
                            · {m.phase}
                          </span>
                        )}
                      </div>
                      {m.pending ? (
                        /* #8: Step-by-step action card — working state */
                        <div className="flex items-center gap-3 py-1.5">
                          <div className="relative h-4 w-4 shrink-0">
                            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent" style={{ animation: 'spin 0.8s linear infinite' }} />
                          </div>
                          <span className="text-xs font-mono uppercase tracking-wider text-primary/70">Working…</span>
                        </div>
                      ) : m.designBrief ? (
                        /* Plan-First: Design Brief Card */
                        <DesignBriefCard
                          appName={m.briefAppName ?? "App"}
                          planSteps={m.planSteps ?? []}
                          brief={m.designBrief}
                          mockupUrl={m.mockupUrl ?? null}
                          onApprove={() => {
                            handleSend(undefined, "Approved! Build the app exactly as planned.");
                          }}
                          onEdit={(feedback) => {
                            handleSend(undefined, `Update the plan: ${feedback}`);
                          }}
                          onRegenerate={() => {
                            handleSend(undefined, "Create a completely new design plan with different style and approach.");
                          }}
                        />
                      ) : (
                        /* #3: Collapsible card — collapsed by default */
                        <div>
                          <button
                            type="button"
                            className="flex items-center gap-2 w-full text-left group/expand"
                            onClick={() => {
                              setMessages((prev) =>
                                prev.map((msg) =>
                                  msg.id === m.id ? { ...msg, collapsed: !msg.collapsed } : msg,
                                ),
                              );
                            }}
                          >
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${m.collapsed ? '-rotate-90' : ''}`} />
                            <span className="text-xs text-muted-foreground truncate flex-1">
                              {m.content.slice(0, 80)}{m.content.length > 80 ? "…" : ""}
                            </span>
                          </button>
                          {!m.collapsed && (
                            <div className="mt-2 pt-2 border-t border-border/20 prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground" style={{ animation: 'fadeInUp 0.2s ease-out' }}>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              <ReactMarkdown components={markdownComponents as any}>{m.content || "…"}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Message actions (inspired by Bolt.diy) */}
                      {!m.pending && m.content && (
                        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border/20 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                              toast("Copied to clipboard");
                            }}
                            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                            title="Copy message"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Find the last user message before this assistant message
                              const idx = messages.indexOf(m);
                              for (let i = idx - 1; i >= 0; i--) {
                                if (messages[i].role === "user") {
                                  handleSend(undefined, messages[i].content);
                                  break;
                                }
                              }
                            }}
                            disabled={sending}
                            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                            title="Retry this response"
                          >
                            <RotateCcw className="h-3 w-3" /> Retry
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Live "team is collaborating" banner */}
              {teamBanner && (
                <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-4 shadow-sm" style={{ animation: 'fadeInUp 0.4s ease-out' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
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
                          className={`inline-flex items-center gap-1 text-[10px] font-display uppercase tracking-widest px-2 py-1 rounded-full border shadow-sm ${b.tint}`}
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
          className="border-t border-border/50 p-4 bg-gradient-to-t from-background via-background to-transparent"
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
          <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-md px-4 py-3 shadow-lg transition-all duration-300 focus-within:border-primary/50 focus-within:shadow-primary/10 focus-within:shadow-xl" style={{ boxShadow: input.trim() ? '0 0 0 1px var(--primary-10, rgba(155,230,70,0.1)), 0 8px 32px -8px rgba(0,0,0,0.2)' : undefined }}>
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={typedHint ? `Ask Mobivable to ${typedHint}` : "Describe what you want to build…"}
              disabled={!project}
              className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50 max-h-40 leading-relaxed"
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
                    className="h-9 w-9 grid place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
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

      {sidePanel === "native" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <Bell className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Native</h2>
                <p className="text-[10px] text-muted-foreground truncate">
                  Push, payments, camera, biometrics — wired on export
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidePanel(null)}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">
            <NativeCapabilitiesPanel projectId={projectId} />
          </div>
        </section>
      )}

      {sidePanel === "store" && (
        <section className="flex flex-1 lg:flex-none lg:w-[520px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <Store className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">Store Listing</h2>
                <p className="text-[10px] text-muted-foreground truncate">
                  Icon, metadata, screenshots — bundled into the next export
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidePanel(null)}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">
            <StoreListingPanel projectId={projectId} />
          </div>
        </section>
      )}

      {sidePanel === "ota" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <header className="p-4 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <CloudUpload className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base truncate">OTA Updates</h2>
                <p className="text-[10px] text-muted-foreground truncate">
                  Ship JS-only fixes via EAS Update — no store review
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidePanel(null)}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">
            <OtaUpdatesPanel projectId={projectId} />
          </div>
        </section>
      )}

      {/* ─── Version History Panel ─── */}
      {sidePanel === "history" && (
        <VersionHistoryPanel
          projectId={projectId}
          currentSchema={project?.result ?? null}
          onClose={() => setSidePanel(null)}
          onRestore={() => reloadProject()}
        />
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
        // KnowledgeDialog (the real, DB-backed one) is rendered as a modal —
        // it's `fixed inset-0` and closes itself. We render it directly here
        // when the sidebar route asks for Knowledge so users get the
        // real-data feature, not the previous KnowledgeBasePanel placeholder
        // (which never read or wrote knowledge_items).
        <KnowledgeDialog onClose={() => setSidePanel(null)} />
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

      {/* ─── Code Viewer Panel ─── */}
      {sidePanel === "code_viewer" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <CodeViewerPanel
            projectId={projectId}
            onClose={() => setSidePanel(null)}
          />
        </section>
      )}

      {/* ─── Secrets Panel ─── */}
      {sidePanel === "secrets" && (
        <SecretsPanel
          projectId={projectId}
          onClose={() => setSidePanel(null)}
        />
      )}

      {/* ─── Testing Panel ─── */}
      {sidePanel === "testing" && (
        <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
          <TestingPanel
            projectId={projectId}
            onClose={() => setSidePanel(null)}
          />
        </section>
      )}

      {/* ─── E2B Sandbox Panel ─── */}
      {sidePanel === "sandbox" && (
        <SandboxPanel
          projectId={projectId}
          code={project?.result ?? ""}
          language="typescript"
          onClose={() => setSidePanel(null)}
        />
      )}

      {/* ─── Plugin Store Panel ─── */}
      {sidePanel === "plugins" && (
        <PluginStorePanel
          projectId={projectId}
          onClose={() => setSidePanel(null)}
        />
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
      <section className={`${mobileView === "preview" ? "grid" : "hidden"} lg:grid flex-1 relative place-items-center bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden py-24 lg:py-28 min-h-[720px] lg:min-h-0`}>
        {/* Top toolbar: segmented pane tabs on the left, status + actions on the right */}
        <div className="absolute top-4 inset-x-4 z-30 flex flex-col gap-3 pointer-events-none xl:flex-row xl:items-start xl:justify-between">
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
          <div className="pointer-events-auto ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 xl:max-w-[calc(100%-16rem)]">
            {/* Device Selector Toolbar */}
            <DeviceToolbar
              selectedDevice={selectedDevice}
              onDeviceChange={(name) => {
                setSelectedDevice(name);
                const preset = DEVICE_PRESETS.find((d) => d.name === name);
                if (preset) setDeviceOS(preset.os);
              }}
              landscape={landscape}
              onLandscapeToggle={() => setLandscape((l) => !l)}
            />
            {/* Render Mode Toggle */}
            <div className="inline-flex items-center gap-0.5 h-9 p-0.5 rounded-full border border-border bg-background/90 text-xs shadow-lg backdrop-blur">
              <button
                type="button"
                onClick={() => setRenderMode('react')}
                className={`px-3 py-1.5 rounded-full font-medium transition-all ${
                  renderMode === 'react'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                React
              </button>
              <button
                type="button"
                onClick={() => setRenderMode('flutter')}
                className={`px-3 py-1.5 rounded-full font-medium transition-all ${
                  renderMode === 'flutter'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Flutter
              </button>
            </div>
            {/* Regenerate assets */}
            <button
              type="button"
              onClick={() => regenerateAssets()}
              disabled={genAssetsState === "running"}
              title={genAssetsMsg || "Regenerate hero images, icons, and illustrations with AI"}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-background/90 text-xs text-foreground/90 hover:text-foreground hover:bg-background shadow-lg backdrop-blur transition-colors disabled:opacity-60"
            >
              <Sparkles className={`h-3.5 w-3.5 ${genAssetsState === "running" ? "animate-pulse" : ""}`} />
              <span className="hidden md:inline">{genAssetsState === "running" ? "Generating..." : "Regenerate assets"}</span>
              <span className="md:hidden">{genAssetsState === "running" ? "Generating" : "Assets"}</span>
            </button>

            {/* Per-screen PNG capture. Works for both renderModes (React =
                DOM capture, Flutter = postMessage round-trip). */}
            <button
              type="button"
              onClick={() => void handleCaptureScreen()}
              disabled={capturingScreen}
              title="Save the current screen as a PNG"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-background/90 text-xs text-foreground/90 hover:text-foreground hover:bg-background shadow-lg backdrop-blur transition-colors disabled:opacity-60"
            >
              <Camera className={`h-3.5 w-3.5 ${capturingScreen ? "animate-pulse" : ""}`} />
              <span className="hidden md:inline">{capturingScreen ? "Capturing…" : "Capture screen"}</span>
              <span className="md:hidden">{capturingScreen ? "…" : "Capture"}</span>
            </button>

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
              <span className="hidden md:inline">{restarting ? "Restarting..." : "Restart"}</span>
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
              <span className="hidden md:inline">Real Device</span>
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
              monetizationProvider={monetizationConfig.provider ?? undefined}
              monetizationKeys={monetizationConfig.provider ? monetizationConfig.keys : undefined}
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
        <div className="absolute left-4 top-[5.75rem] flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:top-[6.25rem]">
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
          <DeviceFrame
            os={deviceOS}
            width={(() => {
              const preset = DEVICE_PRESETS.find((d) => d.name === selectedDevice);
              if (!preset) return undefined;
              return landscape ? preset.height : preset.width;
            })()}
            height={(() => {
              const preset = DEVICE_PRESETS.find((d) => d.name === selectedDevice);
              if (!preset) return undefined;
              return landscape ? preset.width : preset.height;
            })()}
            screenBg={(() => {
              try {
                const s = resolveRenderableSchema(project?.result, liveSchema, demoApp);
                return s ? resolveTheme(s.theme).background : undefined;
              } catch { return undefined; }
            })()}
            renderMode={renderMode}
            schema={resolveRenderableSchema(project?.result, liveSchema, demoApp)}
            theme={(() => {
              try {
                const s = resolveRenderableSchema(project?.result, liveSchema, demoApp);
                return s ? resolveTheme(s.theme) : undefined;
              } catch { return undefined; }
            })()}
            activeScreenIndex={(() => {
              const schema = resolveRenderableSchema(project?.result, liveSchema, demoApp);
              if (!schema?.screens?.length) return 0;
              const index = schema.screens.findIndex((screen) => screen.id === activeScreenId);
              return index >= 0 ? index : 0;
            })()}
          >
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
                  const baseSchema = resolveRenderableSchema(project?.result, liveSchema, demoApp);
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
                        hideStatusBar
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
          </DeviceFrame>
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
      {studioGalleryOpen && (
        <TemplateGallery
          onSelect={(newProjectId) => {
            setStudioGalleryOpen(false);
            window.location.href = `/projects/${newProjectId}`;
          }}
          onClose={() => setStudioGalleryOpen(false)}
        />
      )}
    </div>
  );
}

