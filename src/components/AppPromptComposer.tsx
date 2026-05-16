import { useState } from "react";
import { Image as ImageIcon, Send, ChevronDown } from "lucide-react";

const SUGGESTIONS = ["Fitness Tracker", "Recipe Finder", "Habit Coach", "Mood Journal"];
const MODELS = ["Opus 4.7", "Sonnet 4.7", "Haiku 4.7"];

export function AppPromptComposer() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [modelOpen, setModelOpen] = useState(false);

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
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="recipe finder app"
            rows={6}
            className="w-full bg-transparent text-lg md:text-xl text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
          />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-6">
            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.slice(0, 2).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s.toLowerCase() + " app")}
                  className="px-4 py-2 rounded-full border border-primary/40 font-display text-xs uppercase tracking-wider text-primary hover:border-primary hover:bg-primary/10 transition-colors"
                >
                  {s}
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
                className="h-10 w-10 grid place-items-center rounded-full border border-primary/40 text-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <ImageIcon className="h-4 w-4" />
              </button>

              <button
                type="button"
                aria-label="Send"
                disabled={!prompt.trim()}
                className="h-10 w-10 grid place-items-center rounded-full bg-primary text-primary-foreground hover:invert transition-all disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
