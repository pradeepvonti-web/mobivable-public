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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { generateProject } from "@/lib/generate-project.functions";
import { sendProjectMessage } from "@/lib/project-chat.functions";
import { ProjectPreview } from "@/components/ProjectPreview";
import { AgentWorkspace } from "@/components/AgentWorkspace";
import { usePreviewConfig, aliasedSelect } from "@/lib/preview-config";
import { AGENTS, ALL_ROLES, type AgentRole } from "@/lib/agents";

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
  { icon: Database, label: "Backend" },
  { icon: Code2, label: "Env Variables" },
  { icon: ImageIcon, label: "Assets" },
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
  const [selectedAgent, setSelectedAgent] = useState<AgentRole>("product_manager");
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [paneTab, setPaneTab] = useState<"preview" | "agents">("preview");
  const [messages, setMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string; pending?: boolean }[]
  >([]);
  const [input, setInput] = useState("");
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
  const [newClassInput, setNewClassInput] = useState("");
  const [pending, setPending] = useState<{ name: string; url: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generateFn = useServerFn(generateProject);
  const chatFn = useServerFn(sendProjectMessage);
  const triggeredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef(false);
  const streamRef = useRef<AsyncIterator<unknown> | null>(null);

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
    return row;
  }



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
      ((data as { id: string; role: "user" | "assistant"; content: string }[] | null) ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })),
    );
  }

  function handleCancel() {
    cancelRef.current = true;
    streamRef.current?.return?.(undefined);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const uploaded: { name: string; url: string; type: string }[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          setError(`${file.name} is over 20MB`);
          continue;
        }
        const path = `${uid}/${projectId}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("project-attachments")
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) {
          setError(upErr.message);
          continue;
        }
        const { data: pub } = supabase.storage.from("project-attachments").getPublicUrl(path);
        uploaded.push({ name: file.name, url: pub.publicUrl, type: file.type || "file" });
      }
      setPending((p) => [...p, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const raw = input.trim();
    if ((!raw && pending.length === 0) || sending) return;
    const attachBlock = pending.length
      ? `\n\nAttachments:\n${pending.map((p) => `- [${p.name}](${p.url})`).join("\n")}`
      : "";
    const base = raw || "(see attachments)";
    const content = selectedEl
      ? `[Visual edit target: <${selectedEl.tag}>${selectedEl.text ? ` "${selectedEl.text}"` : ""}]\n\n${base}${attachBlock}`
      : `${base}${attachBlock}`;
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
      { id: `${tempId}-a`, role: "assistant", content: "", pending: true },
    ]);
    try {
      const stream = await chatFn({ data: { projectId, content } });
      streamRef.current = stream as unknown as AsyncIterator<unknown>;
      let acc = "";
      let errored = false;
      for await (const event of stream) {
        if (cancelRef.current) break;
        if (event.type === "delta") {
          acc += event.delta;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `${tempId}-a` ? { ...m, content: acc, pending: false } : m,
            ),
          );
        } else if (event.type === "error") {
          errored = true;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === `${tempId}-a`
                ? { ...m, content: `⚠️ ${event.error}`, pending: false }
                : m,
            ),
          );
        }
      }
      if (cancelRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === `${tempId}-a`
              ? { ...m, content: `${acc}${acc ? "\n\n" : ""}_Stopped._`, pending: false }
              : m,
          ),
        );
      } else if (!errored) {
        await loadMessages();
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === `${tempId}-a`
            ? {
                ...m,
                content: `⚠️ ${err instanceof Error ? err.message : "Failed to send"}`,
                pending: false,
              }
            : m,
        ),
      );
    } finally {
      streamRef.current = null;
      cancelRef.current = false;
      setSending(false);
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
    <div className="min-h-screen lg:h-screen w-full lg:overflow-hidden bg-background text-foreground flex flex-col lg:flex-row pb-16 lg:pb-0">
      {/* Left rail */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Link
            to="/dashboard"
            className="h-9 w-9 grid place-items-center rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Link
            to="/dashboard"
            className="font-display text-sm uppercase tracking-wider hover:text-primary transition-colors"
          >
            Mobivable
          </Link>
        </div>
        <div className="p-4">
          <Link
            to="/"
            className="block w-full text-center px-4 py-2 rounded-full border border-primary/40 text-primary font-display text-xs uppercase tracking-wider hover:bg-primary/10 transition-colors"
          >
            + New Project
          </Link>
        </div>
        <div className="px-2 pb-3">
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Recent
          </p>
          <nav className="space-y-0.5">
            {recent.map((r) => (
              <Link
                key={r.id}
                to="/projects/$projectId"
                params={{ projectId: r.id }}
                className={`block px-3 py-2 rounded-md text-sm truncate transition-colors ${
                  r.id === projectId
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted/40"
                }`}
              >
                {r.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-border p-2">
          {SIDE_ITEMS.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              type="button"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat thread */}
      <section className={`${mobileView === "chat" ? "flex" : "hidden"} lg:flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col`}>
        <header className="p-4 border-b border-border flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-primary/20 grid place-items-center">
            <span className="h-2 w-2 rounded-full bg-primary" />
          </div>
          <h1 className="font-display text-lg uppercase tracking-tight truncate">
            {project?.name ?? "Loading…"}
          </h1>
        </header>

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

              {/* Iterative chat messages */}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl border border-primary/30 bg-card p-3">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[90%] w-full rounded-2xl border border-border bg-card/60 p-3">
                      {m.pending && !m.content ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Thinking…</span>
                        </div>
                      ) : (
                        <>
                          <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary">
                            <ReactMarkdown>{m.content}</ReactMarkdown>
                          </div>
                          {sending && m.id.endsWith("-a") && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-primary">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                              </span>
                              <span>Streaming…</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ),
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
              {pending.map((a, i) => (
                <div
                  key={a.url}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-2 py-1.5 text-xs"
                >
                  {a.type.startsWith("image/") ? (
                    <img src={a.url} alt={a.name} className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <div className="h-8 w-8 grid place-items-center rounded bg-muted text-muted-foreground">
                      <Plus className="h-3 w-3 rotate-45" />
                    </div>
                  )}
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                    aria-label={`Remove ${a.name}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ))}
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
              placeholder="Ask Mobivable…"
              disabled={sending || !project}
              className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 max-h-32 leading-relaxed"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || sending}
                  aria-label="Add attachment"
                  className="h-8 w-8 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
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
                    disabled={(!input.trim() && pending.length === 0) || !project}
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

      {/* Preview pane */}
      <section className={`${mobileView === "preview" ? "grid" : "hidden"} lg:grid flex-1 relative place-items-center bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden py-10 lg:py-0 min-h-[720px] lg:min-h-0`}>
        {/* Pane tab toggle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full border border-border bg-background/90 px-1 py-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setPaneTab("preview")}
            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs transition-colors ${paneTab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            type="button"
            onClick={() => setPaneTab("agents")}
            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs transition-colors ${paneTab === "agents" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Users className="h-3.5 w-3.5" /> Agents
          </button>
        </div>
        {paneTab === "agents" && <AgentWorkspace projectId={projectId} />}
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

        {/* Phone frame */}
        <div className="relative">
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
            ) : isFailed ? (
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
                <ProjectPreview key={previewKey} project={project} messages={messages} visibility={previewConfig.visibility} />
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
  );
}
