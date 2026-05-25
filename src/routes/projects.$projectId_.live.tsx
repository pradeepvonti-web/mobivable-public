import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Sparkles, Smartphone, ExternalLink } from "lucide-react";
import { generateExpoSnack, getExpoSnack, type SnackPayload } from "@/lib/snack.functions";

export const Route = createFileRoute("/projects/$projectId_/live")({
  component: LivePreviewPage,
});

function LivePreviewPage() {
  const { projectId } = Route.useParams();
  const generateFn = useServerFn(generateExpoSnack);
  const getFn = useServerFn(getExpoSnack);

  const [snack, setSnack] = useState<SnackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"web" | "ios" | "android">("web");

  useEffect(() => {
    getFn({ data: { projectId } })
      .then((r) => setSnack(r.snack))
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await generateFn({ data: { projectId } });
      setSnack(result);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setGenerating(false);
    }
  }

  const embedUrl = snack
    ? `https://snack.expo.dev/embedded/@snack/${snack.hashId}?platform=${platform}&preview=true&theme=dark`
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to project
          </Link>
          <span className="text-border">/</span>
          <h1 className="font-display text-lg uppercase tracking-tight">Live App Preview</h1>
        </div>
        <div className="flex items-center gap-2">
          {snack && (
            <>
              <div className="flex rounded-md border border-border overflow-hidden text-[10px] font-mono uppercase">
                {(["web", "ios", "android"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-3 py-1.5 transition-colors ${
                      platform === p
                        ? "bg-primary text-primary-foreground"
                        : "bg-card hover:bg-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <a
                href={`https://snack.expo.dev/@snack/${snack.hashId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase border border-border rounded-md hover:bg-muted"
              >
                Open in Snack <ExternalLink className="h-3 w-3" />
              </a>
            </>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-mono uppercase tracking-widest bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {snack ? "Regenerate" : "Generate live app"}
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">
        {loading && (
          <div className="grid place-items-center py-32 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {!loading && !snack && !generating && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center max-w-2xl mx-auto">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="font-display text-2xl uppercase tracking-tight mb-2">
              No live app yet
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Generate a real, runnable Expo / React Native project from your idea.
              Lovable AI writes the code, we push it to Expo Snack, and you can
              interact with it right here — or scan a QR code to run it on your
              phone.
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-mono uppercase tracking-widest bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Generate live app
            </button>
          </div>
        )}

        {generating && (
          <div className="grid place-items-center py-32 text-muted-foreground">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="font-mono text-[11px] uppercase tracking-widest">
                Generating Expo project & pushing to Snack…
              </p>
              <p className="text-xs text-muted-foreground/70">
                This can take 30–60 seconds for the first build.
              </p>
            </div>
          </div>
        )}

        {snack && embedUrl && !generating && (
          <div className="grid lg:grid-cols-[1fr,360px] gap-6">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <iframe
                key={`${snack.hashId}-${platform}`}
                src={embedUrl}
                title="Live Expo preview"
                className="w-full h-[80vh] border-0 bg-black"
                allow="geolocation; camera; microphone"
              />
            </div>
            <aside className="rounded-lg border border-border bg-card p-4 space-y-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Snack ID
                </p>
                <p className="font-mono text-xs break-all">{snack.hashId}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Files ({Object.keys(snack.files).length})
                </p>
                <ul className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono">
                  {Object.keys(snack.files).map((f) => (
                    <li key={f} className="truncate text-muted-foreground">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Dependencies ({Object.keys(snack.dependencies).length})
                </p>
                <ul className="text-xs space-y-1 max-h-48 overflow-y-auto font-mono">
                  {Object.entries(snack.dependencies).map(([name, v]) => (
                    <li key={name} className="truncate text-muted-foreground">
                      {name}@{v.version}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                Tip: open the Snack link above to scan a QR code and run the app
                on your physical iOS / Android device via Expo Go.
              </p>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
