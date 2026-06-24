import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Send, ChevronDown, Loader2, X, Smartphone, Sparkles, Zap } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CloneAppDialog } from "@/components/CloneAppDialog";
import { matchTemplates, createProjectFromTemplate, type TemplateMatch } from "@/lib/templates.functions";
import { MOBILE_THEMES } from "@/lib/mobile-theme";

const SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Fitness Tracker",
    prompt:
      "Build a fitness tracker app to help me track my progress. I can log my activities every day and it will count my calories and show weekly summaries. Use athletic blue theme.",
  },
  {
    label: "Recipe Finder",
    prompt:
      "Make a recipe app where I can search for recipes by ingredients I have at home. Show cooking time and difficulty level. Let me save my favorite recipes. Use warm kitchen colors.",
  },
  { label: "Habit Coach", prompt: "habit coach app" },
  { label: "Mood Journal", prompt: "mood journal app" },
];
const FALLBACK_DEFAULT_MODEL = "Gemini 3.1 Pro";
const MODELS = [
  "Gemini 3.1 Pro",
  "Gemini 2.5 Pro",
  "Claude Opus 4.6",
];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 4;
const TYPED_PHRASES = [
  "recipe finder app",
  "meal planner app",
  "fitness tracker app",
  "habit coach app",
  "mood journal app",
  "workout scheduler app",
  "sleep tracker app",
  "budget planner app",
  "language learning app",
  "meditation timer app",
];

type Attachment = { path: string; url: string; name: string };

function useTypewriter(phrases: string[], active: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const current = phrases[phraseIdx];
      if (!deleting) {
        charIdx++;
        setText(current.slice(0, charIdx));
        if (charIdx === current.length) {
          deleting = true;
          timeout = setTimeout(tick, 1400);
          return;
        }
        timeout = setTimeout(tick, 55 + Math.random() * 50);
      } else {
        charIdx--;
        setText(current.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
          timeout = setTimeout(tick, 350);
          return;
        }
        timeout = setTimeout(tick, 28);
      }
    };
    timeout = setTimeout(tick, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [phrases, active]);
  return text;
}


function deriveName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Untitled app";
  const firstLine = trimmed.split(/[.\n]/)[0];
  const words = firstLine.split(" ").slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function AppPromptComposer() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("prompt");
    if (p) {
      setPrompt(p);
      const url = new URL(window.location.href);
      url.searchParams.delete("prompt");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const [defaultModel, setDefaultModel] = useState(FALLBACK_DEFAULT_MODEL);
  const [model, setModelState] = useState(FALLBACK_DEFAULT_MODEL);
  const [userPicked, setUserPicked] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("preferred-model");
      if (saved && MODELS.includes(saved)) {
        setModelState(saved);
        setUserPicked(true);
      }
    } catch {}
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "default_model")
        .maybeSingle();
      const v = typeof data?.value === "string" ? data.value : null;
      if (v && MODELS.includes(v)) {
        setDefaultModel(v);
        setModelState((curr) => (userPicked ? curr : v));
      }
    })();
  }, [userPicked]);
  const setModel = (m: string) => {
    setModelState(m);
    setUserPicked(true);
    try {
      localStorage.setItem("preferred-model", m);
    } catch {}
  };
  const [modelOpen, setModelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const typedPlaceholder = useTypewriter(TYPED_PHRASES, !prompt && !submitting);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("You must be signed in to attach images.");
      return;
    }
    const remaining = MAX_ATTACHMENTS - attachments.length;
    const picked = Array.from(files).slice(0, remaining);
    setUploading(true);
    const uploaded: Attachment[] = [];
    for (const file of picked) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} is not an image.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is larger than 10 MB.`);
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("project-attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      const { data: pub } = supabase.storage.from("project-attachments").getPublicUrl(path);
      uploaded.push({ path, url: pub.publicUrl, name: file.name });
    }
    if (uploaded.length) setAttachments((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeAttachment(att: Attachment) {
    setAttachments((prev) => prev.filter((a) => a.path !== att.path));
    await supabase.storage.from("project-attachments").remove([att.path]);
  }

  // Template-first creation: strong vault matches are offered before any AI
  // generation runs (instantiating a template costs ZERO AI credits).
  const [templateMatches, setTemplateMatches] = useState<TemplateMatch[] | null>(null);
  const [themeVariants, setThemeVariants] = useState<string[]>([]);
  const [pickedTheme, setPickedTheme] = useState<Record<string, string>>({});
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);

  async function useTemplate(t: TemplateMatch) {
    if (usingTemplate) return;
    setUsingTemplate(t.id);
    setError(null);
    try {
      const r = await createProjectFromTemplate({
        data: {
          templateId: t.id,
          projectName: t.name,
          themeVariant: pickedTheme[t.id],
          originalPrompt: prompt.trim() || undefined,
        },
      });
      navigate({ to: "/projects/$projectId", params: { projectId: r.projectId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create from template.");
      setUsingTemplate(null);
    }
  }

  async function handleSubmit() {
    const text = prompt.trim();
    if (!text || submitting || uploading) return;
    // Template-first: check the vault before spending AI credits — unless the
    // user attached images (a mockup means they want a custom AI build) or
    // they already saw suggestions for this prompt and chose to proceed.
    if (attachments.length === 0 && templateMatches === null) {
      setSubmitting(true);
      setError(null);
      try {
        const res = await matchTemplates({ data: { prompt: text, limit: 3 } });
        if (res.matches.length > 0) {
          setTemplateMatches(res.matches);
          setThemeVariants((res as { themeVariants?: string[] }).themeVariants ?? []);
          setSubmitting(false);
          return; // show suggestions; "Generate with AI" proceeds past this
        }
      } catch {
        // Matching is best-effort — fall through to the normal AI path.
      }
      setSubmitting(false);
    }
    await createWithAI(text);
  }

  async function createWithAI(text: string) {
    if (submitting || uploading) return;
    setSubmitting(true);
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setError("You must be signed in.");
      setSubmitting(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("projects")
      .insert({
        user_id: u.user.id,
        name: deriveName(text),
        prompt: text,
        model,
        status: "building",
        attachments: attachments.map((a) => ({ path: a.path, url: a.url, name: a.name })),
      })
      .select("id")
      .single();
    if (insertError || !data) {
      const msg = insertError?.message ?? "Failed to create project";
      // Surface the quota trigger error in user-friendly form.
      if (msg.includes("APP_QUOTA_EXCEEDED")) {
        setError(
          "You've hit your plan's app limit. Upgrade your subscription to create more apps.",
        );
      } else {
        setError(msg);
      }
      setSubmitting(false);
      return;
    }
    navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
  }

  return (
    <section className="relative">
      {/* Headline */}
      <h1 className="font-display text-5xl md:text-6xl lg:text-7xl text-center tracking-tight leading-[0.95] mb-10 text-foreground">
        Make awesome mobile apps
        <br />
        <span className="text-muted-foreground">No code required</span>
      </h1>

      {/* Glow frame */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--primary) 70%, transparent), color-mix(in oklab, var(--primary) 20%, transparent) 40%, transparent 70%)",
            filter: "blur(14px)",
            opacity: 0.65,
          }}
        />
        <div className="relative rounded-2xl border border-primary/40 bg-card/60 backdrop-blur-sm p-5 md:p-6">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); if (templateMatches) setTemplateMatches(null); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder=""
              rows={6}
              disabled={submitting}
              className="relative w-full bg-transparent text-lg md:text-xl text-foreground focus:outline-none resize-none disabled:opacity-60"
            />
            {!prompt && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 text-lg md:text-xl text-muted-foreground select-none"
              >
                <span>{typedPlaceholder}</span>
                <span
                  className={`inline-block w-[2px] h-[1.1em] ml-0.5 align-middle bg-primary ${
                    focused ? "" : "animate-pulse"
                  }`}
                  style={{ animation: focused ? "none" : undefined }}
                />
              </div>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3">
              {attachments.map((a) => (
                <div
                  key={a.path}
                  className="relative h-20 w-20 rounded-lg overflow-hidden border border-primary/40 bg-background"
                >
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeAttachment(a)}
                    className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-background/80 hover:bg-background text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="h-20 w-20 grid place-items-center rounded-lg border border-primary/40 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {error && (
            <p className="mt-2 text-sm text-destructive font-mono">{error}</p>
          )}

          {/* Template-first suggestions: instant, zero AI credits */}
          {templateMatches && templateMatches.length > 0 && (
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-semibold">
                  Start instantly from a ready-made template — <span className="text-primary">0 AI credits</span>
                </p>
              </div>
              <div className="grid gap-2">
                {templateMatches.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/70 px-3 py-2.5">
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm font-medium leading-tight">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">{t.description}</p>
                      <p className="text-[10px] text-muted-foreground/70 font-mono uppercase mt-0.5">{t.category}{t.use_count > 0 ? ` · used ${t.use_count}×` : ""}</p>
                    </div>
                    {/* Theme variant swatches (deterministic recolor — still 0 credits) */}
                    {themeVariants.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {themeVariants.map((v) => {
                          const th = MOBILE_THEMES[v];
                          if (!th) return null;
                          const active = pickedTheme[t.id] === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              title={v.replace(/_/g, " ")}
                              onClick={() => setPickedTheme((p) => ({ ...p, [t.id]: active ? "" : v }))}
                              className={`h-5 w-5 rounded-full border-2 transition-transform ${active ? "scale-125 border-primary" : "border-border hover:scale-110"}`}
                              style={{ background: `linear-gradient(135deg, ${th.primary} 50%, ${th.background} 50%)` }}
                            />
                          );
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => useTemplate(t)}
                      disabled={!!usingTemplate}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                      {usingTemplate === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Use template
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => createWithAI(prompt.trim())}
                disabled={submitting || !!usingTemplate}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
              >
                <Sparkles className="h-3 w-3" />
                {submitting ? "Generating…" : "None of these fit — generate a custom app with AI instead"}
              </button>
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6">
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.slice(0, 2).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setPrompt(s.prompt)}
                  className="px-4 py-2 rounded-full border border-primary/40 font-display text-xs uppercase tracking-wider text-primary hover:border-primary hover:bg-primary/10 transition-colors"
                >
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCloneOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-primary/40 font-display text-xs uppercase tracking-wider text-primary hover:border-primary hover:bg-primary/10 transition-colors"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Clone an app
              </button>
            </div>

            {/* Right cluster */}
            <div className="flex items-center gap-2">
              {/* Model picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelOpen((v) => !v)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 text-sm text-foreground hover:border-primary transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{model}</span>
                  {model === defaultModel && (
                    <span className="text-[10px] uppercase tracking-wider text-primary/80 font-display">
                      Default
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {modelOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg z-10 overflow-hidden">
                    {MODELS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setModel(m);
                          setModelOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-primary/10 ${
                          m === model ? "text-primary" : "text-foreground"
                        }`}
                      >
                        <span>{m}</span>
                        {m === defaultModel && (
                          <span className="text-[10px] uppercase tracking-wider text-primary/80 font-display">
                            Recommended
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                aria-label="Attach image"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || submitting || attachments.length >= MAX_ATTACHMENTS}
                className="h-10 w-10 grid place-items-center rounded-full border border-primary/40 text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                aria-label="Send"
                onClick={handleSubmit}
                disabled={!prompt.trim() || submitting}
                className="h-10 w-10 grid place-items-center rounded-full bg-primary text-primary-foreground hover:invert transition-all disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {cloneOpen && <CloneAppDialog onClose={() => setCloneOpen(false)} />}
    </section>
  );
}
