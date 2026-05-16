import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { AuthHydrating } from "@/components/AuthHydrating";
import { useRequiredSession } from "@/hooks/useRequiredSession";

type Attachment = { path: string; url: string; name: string };

type Project = {
  id: string;
  name: string;
  prompt: string;
  model: string;
  status: string;
  created_at: string;
  attachments: Attachment[] | null;
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

  useEffect(() => {
    if (status !== "authenticated") return;

    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, prompt, model, status, created_at, attachments")
        .eq("id", projectId)
        .maybeSingle();
      if (error) setError(error.message);
      setProject(data as Project | null);
      setLoading(false);
    })();
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

  if (error || !project) {
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

  return (
    <PageShell eyebrow="PROJECT" title={project.name} intro="Your new mobile app project.">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="border border-border p-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Status
          </p>
          <div className="flex items-center gap-3 mb-6">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-display text-2xl uppercase tracking-tight">
              {project.status === "building" ? "Building…" : project.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We're generating your app from your prompt. This usually takes a few minutes.
          </p>
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
