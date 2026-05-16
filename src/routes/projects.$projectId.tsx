import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";
import { generateProject } from "@/lib/generate-project.functions";

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
    meta: [{ title: "Project — Mobivable" }],
  }),
});

function ProjectPage() {
  const { status } = useRequiredSession();
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
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
    (async () => {
      const p = await reloadProject();
      if (
        p &&
        p.status === "building" &&
        !p.result &&
        !triggeredRef.current
      ) {
        triggeredRef.current = true;
        runGeneration();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, status]);

  if (status !== "authenticated") {
    return <AuthHydrating />;
  }

  if (loading) {
    return (
      <PageShell eyebrow="PROJECT" title="Loading…" intro="">
        <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">
          [···] Loading
        </p>
      </PageShell>
    );
  }

  if (!project) {
    return (
      <PageShell eyebrow="PROJECT" title="Not found" intro="">
        <p className="text-sm text-muted-foreground mb-4">
          {error ?? "This project doesn't exist or you don't have access."}
        </p>
        <Link
          to="/dashboard"
          className="inline-block px-5 py-3 bg-primary text-background font-display text-xs uppercase tracking-wider hover:invert transition-all"
        >
          Back to dashboard
        </Link>
      </PageShell>
    );
  }

  const isBuilding = project.status === "building" || generating;
  const isFailed = project.status === "failed";
  const statusLabel = generating
    ? "Generating…"
    : project.status === "building"
      ? "Building…"
      : project.status;

  return (
    <PageShell eyebrow="PROJECT" title={project.name} intro="Your new mobile app project.">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="border border-border p-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Status
          </p>
          <div className="flex items-center gap-3 mb-6">
            <span
              className={`h-2 w-2 rounded-full ${
                isFailed
                  ? "bg-destructive"
                  : isBuilding
                    ? "bg-primary animate-pulse"
                    : "bg-primary"
              }`}
            />
            <span className="font-display text-2xl uppercase tracking-tight">
              {statusLabel}
            </span>
          </div>
          {isBuilding && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Running your prompt through {project.model}…
            </p>
          )}
          {isFailed && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                {project.error_text ?? error ?? "Generation failed."}
              </p>
              <button
                onClick={runGeneration}
                disabled={generating}
                className="px-4 py-2 border border-border text-xs font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                Retry generation
              </button>
            </div>
          )}
        </section>

        <section className="border border-border p-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Prompt
          </p>
          <p className="text-lg text-foreground leading-relaxed whitespace-pre-wrap">
            {project.prompt}
          </p>
          {project.attachments && project.attachments.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {project.attachments.map((a) => (
                <a
                  key={a.path}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="h-24 w-24 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
                >
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          <div className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground border-t border-border pt-4">
            Model · {project.model}
          </div>
        </section>

        {project.result && (
          <section className="border border-border p-8">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              Build brief
            </p>
            <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:uppercase prose-headings:tracking-tight prose-a:text-primary">
              <ReactMarkdown>{project.result}</ReactMarkdown>
            </div>
            <button
              onClick={runGeneration}
              disabled={generating}
              className="mt-6 px-4 py-2 border border-border text-xs font-display uppercase tracking-wider hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
          </section>
        )}

        <Link
          to="/dashboard"
          className="inline-block px-5 py-3 border border-border font-display text-xs uppercase tracking-wider hover:border-primary hover:text-primary transition-colors"
        >
          ← Back to dashboard
        </Link>
      </div>
    </PageShell>
  );
}
