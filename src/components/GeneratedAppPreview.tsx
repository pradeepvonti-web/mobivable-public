/**
 * Live preview of the generated Vite+React+TS source for this project.
 *
 * Loads files from `project_file_overrides`, hands them to Sandpack, and
 * renders the running app in an iframe. This replaces the schema-driven
 * MobileAppRenderer as the canonical preview — what you see is the
 * actual React source that gets committed to GitHub.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sandpack } from "@codesandbox/sandpack-react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Github, RefreshCw, Code2, Eye, ExternalLink } from "lucide-react";
import { buildCodeForProject, pushProjectToGithub } from "@/lib/code-gen-build.functions";

type FileRow = { file_path: string; content: string };

export function GeneratedAppPreview({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [busy, setBusy] = useState<"none" | "regen" | "push">("none");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  const buildFn = useServerFn(buildCodeForProject);
  const pushFn = useServerFn(pushProjectToGithub);

  async function load() {
    setLoading(true);
    const { data, error: e } = await supabase
      .from("project_file_overrides")
      .select("file_path, content")
      .eq("project_id", projectId)
      .order("file_path", { ascending: true });
    if (e) setError(e.message);
    setFiles((data ?? []) as FileRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // Live-refresh when files change.
    const ch = supabase
      .channel(`pfo_${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_file_overrides", filter: `project_id=eq.${projectId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [projectId]);

  const sandpackFiles = useMemo(() => {
    if (!files) return {};
    const map: Record<string, string> = {};
    for (const f of files) map[`/${f.file_path}`] = f.content;
    return map;
  }, [files]);

  async function handleRegen() {
    setBusy("regen");
    setError(null);
    setStatus(null);
    try {
      const r = await buildFn({ data: { projectId } });
      if (r.ok) {
        setStatus(`Regenerated ${r.fileCount} files (${r.screenCount} screens).`);
        await load();
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("none");
    }
  }

  async function handlePush() {
    const repoName = window.prompt("GitHub repo name (will create if missing):", `mobivable-${projectId.slice(0, 8)}`);
    if (!repoName) return;
    setBusy("push");
    setError(null);
    setStatus(null);
    setRepoUrl(null);
    try {
      const r = await pushFn({ data: { projectId, repoName, private: true } });
      if (r.ok) {
        setStatus(`Pushed ${r.fileCount} files. Commit ${r.commitSha.slice(0, 7)}.`);
        setRepoUrl(r.repoUrl);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("none");
    }
  }

  if (loading) {
    return (
      <div className="h-full w-full grid place-items-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="h-full w-full grid place-items-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-sm text-muted-foreground">
            No generated source yet. Run the agent build to produce real React code, or click below to generate from the current schema.
          </p>
          <button
            onClick={handleRegen}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy === "regen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
            Generate code now
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-card/40">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-0.5">
          <button
            onClick={() => setView("preview")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest ${view === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
          <button
            onClick={() => setView("code")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest ${view === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Code2 className="h-3 w-3" /> Code ({files.length})
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="text-xs text-emerald-500 truncate max-w-[260px]">{status}</span>}
          {repoUrl && (
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> repo
            </a>
          )}
          <button
            onClick={handleRegen}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary/40 disabled:opacity-60"
            title="Regenerate code from latest schema"
          >
            {busy === "regen" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate
          </button>
          <button
            onClick={handlePush}
            disabled={busy !== "none"}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {busy === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
            Push to GitHub
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3 py-2 text-xs text-destructive border-b border-destructive/20 bg-destructive/5">
          {error}
        </div>
      )}

      {/* Sandpack */}
      <div className="flex-1 min-h-0">
        <Sandpack
          template="vite-react-ts"
          files={sandpackFiles}
          theme="dark"
          options={{
            showNavigator: false,
            showLineNumbers: true,
            showTabs: view === "code",
            editorHeight: "100%",
            editorWidthPercentage: view === "code" ? 60 : 0,
            activeFile: "/src/App.tsx",
            visibleFiles: files.slice(0, 12).map((f) => `/${f.file_path}`),
          }}
          customSetup={{
            dependencies: {
              react: "^18.3.1",
              "react-dom": "^18.3.1",
            },
            devDependencies: {
              "@types/react": "^18.3.3",
              "@types/react-dom": "^18.3.0",
              tailwindcss: "^3.4.10",
              autoprefixer: "^10.4.20",
              postcss: "^8.4.41",
            },
          }}
        />
      </div>
    </div>
  );
}
