/**
 * /agent — In-studio MCP agent chat with side-by-side preview.
 *
 * Cross-project chat where the user talks to an LLM that has access to
 * the same 14-tool MCP_TOOLS dispatch table the external MCP server
 * exposes. Streams turn-by-turn through `sendAgentTurn`.
 *
 * Layout:
 *   ┌──────────┬────────────────────┬──────────────────┐
 *   │ Threads  │  Message list      │  Active project  │
 *   │          │                    │  Flutter preview │
 *   │ + New    │  (md + tool cards) │                  │
 *   │          │                    │  (live iframe)   │
 *   │          │  ──────────────    │                  │
 *   │          │  Composer          │                  │
 *   └──────────┴────────────────────┴──────────────────┘
 *
 * The user picks an active project from the chat-header dropdown. When
 * one is set, we render the Flutter preview in the right pane and
 * auto-capture a screenshot on each send so the agent gets a multimodal
 * snapshot of what the user is looking at.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  Loader2,
  Plus,
  Send,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Smartphone,
  Camera,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { supabase } from "@/integrations/supabase/client";
import { parseAppSchema } from "@/lib/code-gen";
import {
  getFlutterPreviewUrl,
  sendSchemaToFlutter,
  sendDeviceInfoToFlutter,
  captureFlutterScreenshot,
} from "@/lib/flutter-bridge";
import {
  listAgentThreads,
  createAgentThread,
  getAgentThread,
  archiveAgentThread,
  sendAgentTurn,
  type AgentEvent,
} from "@/lib/mcp-agent.functions";
import { createSnackSession } from "@/lib/snack-preview.functions";

export const Route = createFileRoute("/agent")({
  component: AgentPage,
  head: () => ({
    meta: [
      { title: "Agent — Mobivable" },
      { name: "description", content: "Chat with the Mobivable agent across all your projects." },
    ],
  }),
});

type Thread = {
  id: string;
  title: string;
  model: string | null;
  created_at: string;
  updated_at: string;
};

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  // Filled in by the matching tool_result message:
  result?: string;
  isError?: boolean;
  /** UI-only — true while waiting on tool_result for this call. */
  pending?: boolean;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  isError?: boolean;
};

type ProjectOpt = { id: string; name: string; result: string | null };

function AgentPage() {
  const { status, session } = useRequiredSession();
  const listFn = useServerFn(listAgentThreads);
  const createFn = useServerFn(createAgentThread);
  const getFn = useServerFn(getAgentThread);
  const archiveFn = useServerFn(archiveAgentThread);
  const turnFn = useServerFn(sendAgentTurn);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ── Preview pane state ──
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  const [previewReady, setPreviewReady] = useState(false);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  /**
   * "web"   — the existing Flutter web preview (live, schema-driven, fast).
   * "device" — Snack-based real RN runtime; iframe + QR for Expo Go.
   * Web stays the default because the agent's screenshot capture only
   * works against the Flutter iframe. Device mode is a user-initiated
   * "show me on a real phone" moment.
   */
  const [previewMode, setPreviewMode] = useState<"web" | "device">("web");
  const [snack, setSnack] = useState<
    { hashId: string; embedUrl: string; deviceUrl: string } | null
  >(null);
  const [snackLoading, setSnackLoading] = useState(false);
  const [snackError, setSnackError] = useState<string | null>(null);
  const createSnackFn = useServerFn(createSnackSession);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  // Load threads on mount + auto-select most recent.
  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const res = await listFn({ data: undefined });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setThreads(res.threads);
        if (res.threads.length > 0 && !activeId) setActiveId(res.threads[0].id);
      } finally {
        setLoadingThreads(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Load the project list once for the picker. We hit Supabase directly
  // because there's no listProjects server fn yet; RLS scopes us to own.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, result")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      setProjects((data as ProjectOpt[] | null) ?? []);
    })();
  }, [status, session?.user?.id]);

  // When the active project changes, reset the iframe-ready flag — the new
  // project's schema needs to land before screenshot capture is meaningful.
  useEffect(() => {
    setPreviewReady(false);
    // Snack session is per-project; drop it on switch so we don't render
    // a stale iframe with the previous project's theme.
    setSnack(null);
    setSnackError(null);
  }, [activeProjectId]);

  // When the user flips to Device mode, mint a Snack session for the
  // active project (or reuse the in-memory one if we just made it). The
  // server fn is cheap (~1 s) but we still gate on an explicit toggle so
  // the user controls when the Snack quota is consumed.
  useEffect(() => {
    if (previewMode !== "device" || !activeProjectId) return;
    if (snack || snackLoading) return;
    setSnackLoading(true);
    setSnackError(null);
    (async () => {
      try {
        const res = await createSnackFn({ data: { projectId: activeProjectId } });
        if (!res.ok) {
          setSnackError(res.error);
          return;
        }
        setSnack({
          hashId: res.hashId,
          embedUrl: res.embedUrl,
          deviceUrl: res.deviceUrl,
        });
      } catch (e) {
        setSnackError(e instanceof Error ? e.message : "Failed to create Snack.");
      } finally {
        setSnackLoading(false);
      }
    })();
    // We deliberately omit `snack` from deps — see the guard above; this
    // effect should fire only on mode+project change, not on snack-state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, activeProjectId]);

  // Listen for FLUTTER_READY so we know when to start pushing schema.
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string };
      if (data?.type === "FLUTTER_READY") setPreviewReady(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Push schema + device info to the iframe whenever the active project's
  // schema changes (or the iframe just announced READY).
  useEffect(() => {
    if (!previewReady || !activeProject) return;
    const schema = parseAppSchema(activeProject.result ?? "");
    if (!schema) return;
    sendSchemaToFlutter(previewIframeRef.current, schema);
    // Reasonable iPhone-ish defaults; the preview pane is narrow so the
    // smaller dimensions also help the rendered output fit without scroll.
    sendDeviceInfoToFlutter(previewIframeRef.current, 390, 844, "ios");
  }, [previewReady, activeProject]);

  // Hydrate the active thread whenever the selection changes.
  useEffect(() => {
    if (!activeId) return;
    setLoadingThread(true);
    setMessages([]);
    (async () => {
      try {
        // TanStack server-fn responses surface as `unknown` because the
        // function is also valid to call from non-typed contexts. Narrow
        // to the discriminated union the handler actually returns.
        type GetThreadResult =
          | { ok: false; error: string }
          | {
              ok: true;
              thread: Thread;
              messages: {
                id: string;
                role: "user" | "assistant" | "tool";
                content: string;
                tool_calls_json: string | null;
                tool_call_id: string | null;
                is_error: boolean;
                created_at: string;
              }[];
            };
        const res = (await getFn({ data: { threadId: activeId } })) as GetThreadResult;
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        // Stitch tool messages back onto their assistant turn so the UI
        // can render the inline timeline. Tool rows on their own would
        // just look like loose JSON bricks in the transcript.
        const flat: Msg[] = [];
        for (const row of res.messages) {
          if (row.role === "tool") {
            const target = [...flat].reverse().find(
              (m) => m.role === "assistant" && m.toolCalls?.some((tc) => tc.id === row.tool_call_id),
            );
            if (target?.toolCalls) {
              const tc = target.toolCalls.find((t) => t.id === row.tool_call_id);
              if (tc) {
                tc.result = row.content;
                tc.isError = row.is_error;
              }
            }
            continue;
          }
          // tool_calls travels as a JSON string across the wire.
          let parsedCalls:
            | { id: string; name: string; arguments: Record<string, unknown> }[]
            | null = null;
          if (row.tool_calls_json) {
            try {
              parsedCalls = JSON.parse(row.tool_calls_json);
            } catch {
              parsedCalls = null;
            }
          }
          flat.push({
            id: row.id,
            role: row.role,
            content: row.content,
            toolCalls: parsedCalls
              ? parsedCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                  pending: false,
                }))
              : undefined,
          });
        }
        setMessages(flat);
      } finally {
        setLoadingThread(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Autoscroll to the latest message as the stream lands deltas.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function startNewThread() {
    const res = await createFn({ data: {} });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setThreads((t) => [
      { ...res.thread, model: res.thread.model ?? null },
      ...t,
    ]);
    setActiveId(res.thread.id);
    setMessages([]);
    setInput("");
  }

  async function archiveThread(id: string) {
    if (!window.confirm("Archive this thread? You won't see it in the sidebar anymore.")) return;
    const res = await archiveFn({ data: { threadId: id } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setThreads((t) => t.filter((th) => th.id !== id));
    if (activeId === id) setActiveId(threads.find((th) => th.id !== id)?.id ?? null);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    if (!activeId) {
      // First message in a fresh session — auto-mint a thread.
      const res = await createFn({ data: {} });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setThreads((t) => [{ ...res.thread, model: res.thread.model ?? null }, ...t]);
      setActiveId(res.thread.id);
      // The effect that hydrates on activeId change would clobber our
      // in-flight stream — short-circuit by calling sendInternal with
      // the new id directly.
      await sendInternal(res.thread.id, content);
      return;
    }
    await sendInternal(activeId, content);
  }

  async function sendInternal(threadId: string, content: string) {
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, role: "user", content },
    ]);
    let assistantMsgId: string | null = null;

    // Best-effort screenshot of the active preview. Times out cheap so a
    // stuck Flutter engine never blocks the chat turn. We only attempt
    // capture when the preview pane is visible, the iframe is mounted, and
    // FLUTTER_READY has fired — otherwise the iframe would just respond
    // with "iframe not mounted yet" anyway.
    let screenshotDataUrl: string | undefined;
    let screenshotAltText: string | undefined;
    if (activeProject && previewVisible && previewReady && previewIframeRef.current) {
      try {
        screenshotDataUrl = await captureFlutterScreenshot(
          previewIframeRef.current,
          5_000,
        );
        screenshotAltText = `${activeProject.name} — current preview`;
      } catch (e) {
        // Don't block sending; just toast and continue without the image.
        toast.error(
          `Couldn't capture preview: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    }

    const handleEvent = (ev: AgentEvent) => {
      switch (ev.type) {
        case "model": {
          setModelLabel(`${ev.provider} · ${ev.model}`);
          break;
        }
        case "iteration": {
          // Each iteration is a fresh assistant message bubble — the
          // user can read the agent's commentary between tool batches.
          assistantMsgId = `asst-${Date.now()}-${ev.n}`;
          setMessages((prev) => [
            ...prev,
            { id: assistantMsgId!, role: "assistant", content: "" },
          ]);
          break;
        }
        case "delta": {
          if (!assistantMsgId) break;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: m.content + ev.text } : m,
            ),
          );
          break;
        }
        case "tool_start": {
          if (!assistantMsgId) break;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(ev.argumentsJson);
          } catch {
            // Malformed JSON from model — render raw string so the user
            // can still see what was attempted.
            parsedArgs = { _raw: ev.argumentsJson };
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      {
                        id: ev.id,
                        name: ev.name,
                        arguments: parsedArgs,
                        pending: true,
                      },
                    ],
                  }
                : m,
            ),
          );
          break;
        }
        case "tool_result": {
          setMessages((prev) =>
            prev.map((m) =>
              m.toolCalls?.some((tc) => tc.id === ev.id)
                ? {
                    ...m,
                    toolCalls: m.toolCalls.map((tc) =>
                      tc.id === ev.id
                        ? { ...tc, result: ev.content, isError: ev.isError, pending: false }
                        : tc,
                    ),
                  }
                : m,
            ),
          );
          break;
        }
        case "error": {
          toast.error(ev.error);
          if (assistantMsgId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content:
                        m.content +
                        (m.content ? "\n\n" : "") +
                        `**Error:** ${ev.error}`,
                    }
                  : m,
              ),
            );
          }
          break;
        }
        case "thread":
        case "done":
        default:
          break;
      }
    };

    try {
      const stream = await turnFn({
        data: {
          threadId,
          content,
          activeProjectId: activeProject?.id,
          screenshotDataUrl,
          screenshotAltText,
        },
      });
      for await (const ev of stream as AsyncIterable<AgentEvent>) {
        handleEvent(ev);
      }
      // Refresh thread title in case the first-message autotitle ran.
      const refreshed = await listFn({ data: undefined });
      if (refreshed.ok) setThreads(refreshed.threads);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stream failed");
    } finally {
      setSending(false);
    }
  }

  if (status === "loading") {
    return (
      <PageShell eyebrow="ASSISTANT" title="Agent" intro="Loading…">
        <div className="mx-auto max-w-7xl px-6 py-16 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="ASSISTANT"
      title="Agent"
      intro="Chat with the Mobivable agent across all your projects. It can list, read, create, and edit using the same 14 MCP tools Cursor would see."
    >
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        <div
          className={
            "grid gap-6 h-[calc(100vh-280px)] min-h-[560px] " +
            (previewVisible && activeProjectId
              ? "grid-cols-[220px_1fr_360px]"
              : "grid-cols-[260px_1fr]")
          }
        >
          {/* ── Threads sidebar ── */}
          <aside className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
            <div className="p-3 border-b border-border">
              <button
                type="button"
                onClick={startNewThread}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> New thread
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingThreads && (
                <p className="px-2 py-3 text-xs text-muted-foreground">Loading threads…</p>
              )}
              {!loadingThreads && threads.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No threads yet. Start one and ask the agent something.
                </p>
              )}
              {threads.map((t) => {
                const active = t.id === activeId;
                return (
                  <div
                    key={t.id}
                    className={
                      "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer " +
                      (active
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted text-muted-foreground")
                    }
                    onClick={() => setActiveId(t.id)}
                  >
                    <span className="flex-1 truncate">{t.title}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveThread(t.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition h-6 w-6 grid place-items-center rounded hover:bg-background text-muted-foreground hover:text-destructive"
                      aria-label="Archive thread"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {modelLabel && (
              <div className="border-t border-border px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {modelLabel}
              </div>
            )}
          </aside>

          {/* ── Chat panel ── */}
          <section className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
            {/* Project picker + preview toggle */}
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-3">
              <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
              <select
                value={activeProjectId ?? ""}
                onChange={(e) => setActiveProjectId(e.target.value || null)}
                className="flex-1 min-w-0 bg-background border border-border rounded-md px-2 py-1 text-xs"
                aria-label="Active project"
              >
                <option value="">No active project (general chat)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {activeProjectId && (
                <button
                  type="button"
                  onClick={() => setPreviewVisible((v) => !v)}
                  className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-border hover:bg-muted text-xs text-muted-foreground"
                  aria-label={previewVisible ? "Hide preview" : "Show preview"}
                >
                  {previewVisible ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {previewVisible ? "Hide preview" : "Show preview"}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              {loadingThread && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading thread…
                </div>
              )}
              {!loadingThread && messages.length === 0 && (
                <EmptyState />
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sending && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Composer ── */}
            <div className="border-t border-border bg-background/50 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask the agent to do something — e.g. 'list my projects' or 'create a new project from this idea: …'"
                  rows={3}
                  disabled={sending}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-sans resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send
                </button>
              </form>
              <p className="mt-2 text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter to send.
                {activeProject && previewVisible && previewMode === "web"
                  ? " A preview screenshot is attached so the agent can see what you see."
                  : " Each turn consumes 1 AI credit."}
              </p>
            </div>
          </section>

          {/* ── Preview pane ── */}
          {previewVisible && activeProjectId && (
            <aside className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="border-b border-border px-3 py-2 flex items-center gap-2">
                <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium truncate flex-1">
                  {activeProject?.name ?? "Preview"}
                </span>
                {/* Web / Device mode toggle — a tiny segmented control. */}
                <div
                  role="tablist"
                  aria-label="Preview mode"
                  className="inline-flex rounded-md border border-border bg-background p-0.5 text-[10px] uppercase tracking-wider"
                >
                  {(["web", "device"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={previewMode === m}
                      onClick={() => setPreviewMode(m)}
                      className={
                        "px-2 py-0.5 rounded transition-colors " +
                        (previewMode === m
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {m === "web" ? "Web" : "Device"}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {previewMode === "web"
                    ? previewReady
                      ? "ready"
                      : "loading…"
                    : snackLoading
                      ? "building…"
                      : snack
                        ? "ready"
                        : snackError
                          ? "error"
                          : "idle"}
                </span>
              </div>

              {previewMode === "web" ? (
                <>
                  <div className="flex-1 bg-black grid place-items-center overflow-hidden">
                    <iframe
                      // keyed on activeProjectId so switching projects
                      // hard-resets the Flutter engine state (theme/schema
                      // are pushed via postMessage but the engine doesn't
                      // gracefully swap apps).
                      key={activeProjectId}
                      ref={previewIframeRef}
                      title="Flutter Preview"
                      src={getFlutterPreviewUrl()}
                      className="w-full h-full border-0"
                    />
                  </div>
                  <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                    Auto-captured on send. Visible to the agent as image input.
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 bg-black overflow-hidden">
                    {snackLoading && (
                      <div className="h-full grid place-items-center text-xs text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Spinning up a Snack…
                      </div>
                    )}
                    {!snackLoading && snackError && (
                      <div className="h-full grid place-items-center text-xs text-destructive p-4 text-center">
                        Couldn’t reach Snack: {snackError}
                      </div>
                    )}
                    {!snackLoading && !snackError && snack && (
                      <iframe
                        key={snack.hashId}
                        title="Snack Device Preview"
                        src={snack.embedUrl}
                        // Snack needs popups for the Expo Go deep-link.
                        allow="clipboard-read; clipboard-write; geolocation; camera; microphone"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                        className="w-full h-full border-0"
                      />
                    )}
                  </div>
                  <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                    <span className="truncate">
                      Real RN runtime · scan the QR in the iframe with Expo Go.
                    </span>
                    {snack && (
                      <button
                        type="button"
                        onClick={() => setSnack(null)}
                        className="shrink-0 underline-offset-2 hover:underline"
                      >
                        Rebuild
                      </button>
                    )}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 text-sm text-muted-foreground">
      <p className="font-medium text-foreground mb-2">What would you like to do?</p>
      <ul className="space-y-1 text-xs">
        <li>“List my projects, then summarize the one I touched most recently.”</li>
        <li>“Create a new project from this idea: a meditation timer with streak tracking.”</li>
        <li>“Ingest this URL into my knowledge base: https://example.com/prd”</li>
      </ul>
    </div>
  );
}

function MessageBubble({ message }: { message: Msg }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant — markdown + optional tool-call timeline.
  return (
    <div className="flex flex-col gap-2">
      {message.content && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      )}
      {message.toolCalls?.map((tc) => (
        <ToolCallCard key={tc.id} call={tc} />
      ))}
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const status = call.pending
    ? "pending"
    : call.isError
      ? "error"
      : "ok";
  const StatusIcon =
    status === "pending" ? Loader2 : status === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div
      className={
        "rounded-lg border text-xs overflow-hidden " +
        (status === "error"
          ? "border-destructive/40 bg-destructive/5"
          : status === "pending"
            ? "border-border bg-muted/40"
            : "border-border bg-muted/20")
      }
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <Wrench className="h-3 w-3 text-muted-foreground" />
        <code className="font-mono">{call.name}</code>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider">
          <StatusIcon
            className={
              "h-3 w-3 " +
              (status === "pending"
                ? "animate-spin text-muted-foreground"
                : status === "error"
                  ? "text-destructive"
                  : "text-emerald-500")
            }
          />
          {status === "pending" ? "running" : status === "error" ? "error" : "ok"}
        </span>
      </button>
      {open && (
        <div className="border-t border-border bg-background/50 p-3 space-y-2 font-mono text-[11px]">
          <div>
            <div className="text-muted-foreground mb-1">arguments</div>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          </div>
          {call.result !== undefined && (
            <div>
              <div className="text-muted-foreground mb-1">result</div>
              <pre className="whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                {call.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
