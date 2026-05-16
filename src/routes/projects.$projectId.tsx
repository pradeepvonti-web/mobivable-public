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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { generateProject } from "@/lib/generate-project.functions";
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
  const generateFn = useServerFn(generateProject);
  const triggeredRef = useRef(false);

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

  useEffect(() => {
    if (status !== "authenticated") return;
    loadRecent();
    (async () => {
      const p = await reloadProject();
      if (p && p.status === "building" && !p.result && !triggeredRef.current) {
        triggeredRef.current = true;
        runGeneration();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status]);

  if (status !== "authenticated") return <AuthHydrating />;

  const isBuilding = !!project && (project.status === "building" || generating);
  const isReady = !!project && project.status === "ready" && !!project.result;
  const isFailed = !!project && project.status === "failed";

  return (
    <div className="min-h-screen lg:h-screen w-full lg:overflow-hidden bg-background text-foreground flex flex-col lg:flex-row">
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
      <section className="flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col">
        <header className="p-4 border-b border-border flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-primary/20 grid place-items-center">
            <span className="h-2 w-2 rounded-full bg-primary" />
          </div>
          <h1 className="font-display text-lg uppercase tracking-tight truncate">
            {project?.name ?? "Loading…"}
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              {/* User prompt bubble */}
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

              {/* Status / assistant bubble */}
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
                      {isFailed
                        ? "Failed"
                        : isBuilding
                          ? "Building plan…"
                          : "Plan ready"}
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
                    <>
                      <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary">
                        <ReactMarkdown>{project.result}</ReactMarkdown>
                      </div>
                      <button
                        onClick={runGeneration}
                        disabled={generating}
                        className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 border border-border text-[11px] font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" />
                        {generating ? "Regenerating…" : "Regenerate"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Preview pane */}
      <section className="flex-1 relative grid place-items-center bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden py-10 lg:py-0 min-h-[720px] lg:min-h-0">
        <div className="absolute top-4 left-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isReady ? "bg-primary" : "bg-muted-foreground"
            }`}
          />
          {isReady ? "Preview" : "Offline"}
        </div>

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
              <div className="h-full w-full relative">
                <FitTrackApp />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
