import { useState } from "react";
import { Loader2, Plus, Smartphone, Sparkles, Trash2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ingestAppStore, type StoreListing } from "@/lib/ingest-app-store.functions";
import { analyzeAppScreens, type CloneSpec, type Confidence } from "@/lib/analyze-app-screens.functions";
import { generateProject } from "@/lib/generate-project.functions";

const FALLBACK_MODEL = "Gemini 3 Flash";

type Stage = "input" | "analyzing" | "review" | "generating";

function confidenceClass(c: Confidence): string {
  if (c === "high") return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (c === "medium") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-rose-500/15 text-rose-500 border-rose-500/30";
}

function ConfidenceBadge({ c }: { c: Confidence }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${confidenceClass(c)}`}>
      {c}
    </span>
  );
}

export function CloneAppDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const ingestFn = useServerFn(ingestAppStore);
  const analyzeFn = useServerFn(analyzeAppScreens);
  const generateFn = useServerFn(generateProject);

  const [stage, setStage] = useState<Stage>("input");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<StoreListing | null>(null);
  const [spec, setSpec] = useState<CloneSpec | null>(null);

  function model(): string {
    try {
      const saved = localStorage.getItem("preferred-model");
      if (saved) return saved;
    } catch {}
    return FALLBACK_MODEL;
  }

  async function handleScrapeAndAnalyze() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ing = await ingestFn({ data: { url: u } });
      if (!ing.ok) {
        setError(ing.error);
        setBusy(false);
        return;
      }
      setListing(ing.listing);
      setStage("analyzing");

      const an = await analyzeFn({
        data: {
          title: ing.listing.title,
          description: ing.listing.description,
          category: ing.listing.category,
          screenshotUrls: ing.listing.screenshotUrls,
          model: model(),
        },
      });
      if (!an.ok) {
        setError(an.error);
        setStage("input");
        setBusy(false);
        return;
      }
      setSpec(an.spec);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze the listing.");
      setStage("input");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!spec || !listing || busy) return;
    setBusy(true);
    setError(null);
    setStage("generating");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setError("You must be signed in.");
        setStage("review");
        setBusy(false);
        return;
      }
      const storeName = listing.store === "apple" ? "App Store" : "Google Play";
      const { data: proj, error: insErr } = await supabase
        .from("projects")
        .insert({
          user_id: u.user.id,
          name: `Clone of ${spec.appName}`,
          prompt: `Clone of ${spec.appName} — a visual + functional approximation reverse-engineered from its ${storeName} listing.`,
          model: model(),
          status: "building",
        })
        .select("id")
        .single();
      if (insErr || !proj) {
        setError(insErr?.message ?? "Failed to create project.");
        setStage("review");
        setBusy(false);
        return;
      }

      // Run generation here (passing the confirmed spec as the design brief)
      // BEFORE navigating, so the project page doesn't re-trigger generation
      // without the brief and discard the user's corrections.
      const gen = await generateFn({
        data: { projectId: proj.id, designBrief: JSON.stringify(spec) },
      });
      if (!gen.ok) {
        // Project exists but generation failed; let the user open it and retry.
        toast.error(`Generation failed: ${gen.error}`);
      }
      navigate({ to: "/projects/$projectId", params: { projectId: proj.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate the clone.");
      setStage("review");
    } finally {
      setBusy(false);
    }
  }

  // ── spec mutation helpers ──
  function patchSpec(p: Partial<CloneSpec>) {
    setSpec((s) => (s ? { ...s, ...p } : s));
  }
  function updateFeature(i: number, patch: Partial<CloneSpec["features"][number]>) {
    setSpec((s) => (s ? { ...s, features: s.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) } : s));
  }
  function updateEntity(i: number, patch: Partial<CloneSpec["dataEntities"][number]>) {
    setSpec((s) => (s ? { ...s, dataEntities: s.dataEntities.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : s));
  }
  function updateFlow(i: number, patch: Partial<CloneSpec["userFlows"][number]>) {
    setSpec((s) => (s ? { ...s, userFlows: s.userFlows.map((f, j) => (j === i ? { ...f, ...patch } : f)) } : s));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Clone an existing app</h2>
            <span className="text-xs text-muted-foreground">From an App Store or Google Play link</span>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          {(stage === "input" || stage === "analyzing") && (
            <>
              <p className="text-sm text-muted-foreground">
                Paste a public store link. We read the marketing screenshots and description, then propose a spec you can
                correct before building. A store listing can't reveal real backend logic, so the functional parts are
                <span className="text-foreground"> inferred</span> — review the confidence flags.
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy && url.trim()) {
                      e.preventDefault();
                      void handleScrapeAndAnalyze();
                    }
                  }}
                  placeholder="https://apps.apple.com/us/app/…/id…  or  https://play.google.com/store/apps/details?id=…"
                  autoFocus
                  disabled={busy}
                  className="flex-1 h-10 rounded-md border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => void handleScrapeAndAnalyze()}
                  disabled={busy || !url.trim()}
                  className="h-10 px-4 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {stage === "analyzing" ? "Analyzing screens…" : busy ? "Reading…" : "Analyze"}
                </button>
              </div>
            </>
          )}

          {stage === "review" && spec && listing && (
            <div className="space-y-5">
              {/* Listing summary */}
              <div className="flex items-start gap-3">
                {listing.iconUrl && (
                  <img src={listing.iconUrl} alt="" className="h-14 w-14 rounded-xl border border-border object-cover" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{listing.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {listing.developer ? `${listing.developer} · ` : ""}
                    {listing.category ?? (listing.store === "apple" ? "App Store" : "Google Play")}
                    {listing.rating != null ? ` · ★ ${listing.rating}` : ""}
                  </div>
                </div>
              </div>

              {listing.screenshotUrls.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {listing.screenshotUrls.map((s) => (
                    <img key={s} src={s} alt="" className="h-40 rounded-lg border border-border object-cover shrink-0" />
                  ))}
                </div>
              )}

              {/* App name */}
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">App name</span>
                <input
                  value={spec.appName}
                  onChange={(e) => patchSpec({ appName: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>

              {/* Design summary (read-only) */}
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Detected design</div>
                <div className="flex items-center gap-1.5">
                  {[spec.palette.primary, spec.palette.accent, spec.palette.background, spec.palette.card, spec.palette.text].map((c, i) => (
                    <span key={i} className="h-6 w-6 rounded border border-border" style={{ backgroundColor: c }} title={c} />
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {spec.palette.mode} · {spec.typography.headingFont} / {spec.typography.bodyFont}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {spec.screens.length} screens · nav: {spec.navigation.join(", ")}
                </div>
              </div>

              {/* Features */}
              <Section
                title="Features"
                hint="Inferred — edit, remove, or add what the clone should do."
                onAdd={() => patchSpec({ features: [...spec.features, { name: "", description: "", confidence: "low" }] })}
              >
                {spec.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ConfidenceBadge c={f.confidence} />
                    <div className="flex-1 space-y-1">
                      <input
                        value={f.name}
                        onChange={(e) => updateFeature(i, { name: e.target.value })}
                        placeholder="Feature name"
                        className="w-full h-8 rounded-md border border-border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        value={f.description}
                        onChange={(e) => updateFeature(i, { description: e.target.value })}
                        placeholder="One-line description"
                        className="w-full h-8 rounded-md border border-border bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <RemoveBtn onClick={() => patchSpec({ features: spec.features.filter((_, j) => j !== i) })} />
                  </div>
                ))}
              </Section>

              {/* Data entities */}
              <Section
                title="Data model"
                hint="Inferred entities. Fields are comma-separated."
                onAdd={() => patchSpec({ dataEntities: [...spec.dataEntities, { name: "", fields: [], confidence: "low" }] })}
              >
                {spec.dataEntities.map((en, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ConfidenceBadge c={en.confidence} />
                    <div className="flex-1 space-y-1">
                      <input
                        value={en.name}
                        onChange={(e) => updateEntity(i, { name: e.target.value })}
                        placeholder="Entity (e.g. Post)"
                        className="w-full h-8 rounded-md border border-border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        value={en.fields.join(", ")}
                        onChange={(e) => updateEntity(i, { fields: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                        placeholder="id, title, createdAt"
                        className="w-full h-8 rounded-md border border-border bg-transparent px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <RemoveBtn onClick={() => patchSpec({ dataEntities: spec.dataEntities.filter((_, j) => j !== i) })} />
                  </div>
                ))}
              </Section>

              {/* User flows */}
              <Section
                title="User flows"
                hint="Inferred task flows. One step per line."
                onAdd={() => patchSpec({ userFlows: [...spec.userFlows, { name: "", steps: [], confidence: "low" }] })}
              >
                {spec.userFlows.map((fl, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ConfidenceBadge c={fl.confidence} />
                    <div className="flex-1 space-y-1">
                      <input
                        value={fl.name}
                        onChange={(e) => updateFlow(i, { name: e.target.value })}
                        placeholder="Flow (e.g. Sign up)"
                        className="w-full h-8 rounded-md border border-border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <textarea
                        value={fl.steps.join("\n")}
                        onChange={(e) => updateFlow(i, { steps: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                        placeholder={"Open app\nEnter email\nVerify code"}
                        rows={2}
                        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <RemoveBtn onClick={() => patchSpec({ userFlows: spec.userFlows.filter((_, j) => j !== i) })} />
                  </div>
                ))}
              </Section>
            </div>
          )}

          {stage === "generating" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="text-sm font-medium">Building your clone…</div>
              <div className="text-xs text-muted-foreground">Composing screens from the confirmed spec. This can take a minute.</div>
            </div>
          )}
        </div>

        {stage === "review" && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border">
            <button type="button" onClick={() => setStage("input")} className="h-9 px-3 inline-flex items-center rounded-md text-sm font-medium hover:bg-muted/60">
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy || !spec?.appName.trim()}
              className="h-9 px-4 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Build this clone
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, onAdd, children }: { title: string; hint: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
        <button type="button" onClick={onAdd} className="h-7 px-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background shrink-0" aria-label="Remove">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
