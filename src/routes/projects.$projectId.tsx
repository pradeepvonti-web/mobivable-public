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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { generateProject } from "@/lib/generate-project.functions";
import { sendProjectMessage } from "@/lib/project-chat.functions";
import { FitTrackApp } from "@/components/FitTrackApp";

type Attachment = { path: string; url: string; name: string };

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
};

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
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([]);
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat");
  const [messages, setMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string; pending?: boolean }[]
  >([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"build" | "plan">("build");
  const [modeOpen, setModeOpen] = useState(false);
  const [visualEdit, setVisualEdit] = useState(false);
  const [selectedEl, setSelectedEl] = useState<{ tag: string; text: string; classes: string } | null>(null);
  const [pending, setPending] = useState<{ name: string; url: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const generateFn = useServerFn(generateProject);
  const chatFn = useServerFn(sendProjectMessage);
  const triggeredRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef(false);
  const streamRef = useRef<AsyncIterator<unknown> | null>(null);

  async function reloadProject() {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, name, prompt, model, status, created_at, attachments, result, error_text",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (error) setError(error.message);
    setProject(data as Project | null);
    setLoading(false);
    return data as Project | null;
  }

  async function loadRecent() {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(8);
    setRecent((data as { id: string; name: string }[]) ?? []);
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
    const { data } = await supabase
      .from("project_messages")
      .select("id, role, content")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    setMessages(
      ((data as { id: string; role: "user" | "assistant"; content: string }[]) ?? []).map((m) => ({
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
    setSelectedEl(null);
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
    loadRecent();
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
            to="/"
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
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <MousePointerClick className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-primary font-mono uppercase shrink-0">{selectedEl.tag}</span>
                {selectedEl.text && (
                  <span className="text-muted-foreground truncate">"{selectedEl.text}"</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedEl(null)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Clear selection"
              >
                ✕
              </button>
            </div>
          )}
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
                  aria-label="Add attachment"
                  className="h-8 w-8 grid place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  <Plus className="h-4 w-4" />
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
                    disabled={!input.trim() || !project}
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
        <div className="absolute top-4 left-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isReady ? "bg-primary" : "bg-muted-foreground"
            }`}
          />
          {isReady ? "Preview" : "Offline"}
        </div>

        {visualEdit && (
          <div className="absolute top-4 right-4 z-30 flex items-center gap-2 rounded-full border border-primary bg-primary/15 px-3 py-1.5 text-xs text-primary font-medium shadow-lg backdrop-blur">
            <MousePointerClick className="h-3.5 w-3.5" />
            Click any element to select
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
                className={`h-full w-full relative ${visualEdit ? "visual-edit-mode" : ""}`}
                onClickCapture={(e) => {
                  if (!visualEdit) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const t = e.target as HTMLElement;
                  setSelectedEl({
                    tag: t.tagName.toLowerCase(),
                    text: (t.innerText || "").trim().slice(0, 80),
                    classes: t.className?.toString().slice(0, 200) || "",
                  });
                  setVisualEdit(false);
                  setMobileView("chat");
                }}
              >
                <FitTrackApp />
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
