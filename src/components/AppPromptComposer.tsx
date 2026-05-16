import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Send, ChevronDown, Loader2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Fitness Tracker",
    prompt:
      "Build a fitness tracker app to help me track my progress. I can log my activities every day and it will count my calories and show weekly summaries. Use athletic blue theme.",
  },
  { label: "Recipe Finder", prompt: "recipe finder app" },
  { label: "Habit Coach", prompt: "habit coach app" },
  { label: "Mood Journal", prompt: "mood journal app" },
];
const MODELS = ["Opus 4.7", "Sonnet 4.7", "Haiku 4.7"];
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
  const [model, setModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
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

  async function handleSubmit() {
    const text = prompt.trim();
    if (!text || submitting || uploading) return;
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
      setError(insertError?.message ?? "Failed to create project");
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
              onChange={(e) => setPrompt(e.target.value)}
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
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
                {modelOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-card shadow-lg z-10 overflow-hidden">
                    {MODELS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setModel(m);
                          setModelOpen(false);
                        }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-primary/10 ${
                          m === model ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {m}
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
    </section>
  );
}
