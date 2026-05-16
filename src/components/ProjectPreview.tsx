import { useMemo } from "react";
import {
  Sparkles,
  Layers,
  Database,
  Palette,
  MessageSquare,
  Clock,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  prompt: string;
  model: string;
  status: string;
  created_at: string;
  result: string | null;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Section = { title: string; body: string };

function parseSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of lines) {
    const m = raw.match(/^#{2,4}\s+(.+?)\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1].trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + raw;
    }
  }
  if (current) sections.push(current);
  return sections;
}

function bulletItems(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function pickSection(sections: Section[], keywords: string[]): Section | null {
  const lower = keywords.map((k) => k.toLowerCase());
  return (
    sections.find((s) =>
      lower.some((k) => s.title.toLowerCase().includes(k)),
    ) ?? null
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SECTION_ICONS = {
  pitch: Sparkles,
  features: Layers,
  screens: Layers,
  data: Database,
  palette: Palette,
} as const;

export function ProjectPreview({
  project,
  messages,
}: {
  project: Project | null;
  messages: Message[];
}) {
  const sections = useMemo(
    () => (project?.result ? parseSections(project.result) : []),
    [project?.result],
  );

  const pitch = pickSection(sections, ["pitch", "summary", "overview"]);
  const features = pickSection(sections, ["feature", "core"]);
  const screens = pickSection(sections, ["screen", "page"]);
  const dataModel = pickSection(sections, ["data", "model", "schema"]);
  const palette = pickSection(sections, ["palette", "color"]);

  const featureItems = features ? bulletItems(features.body).slice(0, 6) : [];
  const screenItems = screens ? bulletItems(screens.body) : [];
  const dataItems = dataModel ? bulletItems(dataModel.body) : [];

  const flatScreens = useMemo(() => {
    if (screenItems.length === 1 && screenItems[0].includes(",")) {
      return screenItems[0].split(",").map((s) => s.trim()).filter(Boolean);
    }
    return screenItems;
  }, [screenItems]);

  const swatches = useMemo(() => {
    if (!palette) return [];
    const re = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(palette.body))) out.push(`#${m[1]}`);
    return out.slice(0, 6);
  }, [palette]);

  const recentChat = messages.slice(-4);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-gradient-to-br from-background via-background to-muted/30 p-6">
      {/* App-shell header */}
      <header className="rounded-2xl border border-border bg-card/80 backdrop-blur p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              <span>{project.model}</span>
              <span>•</span>
              <span>{project.status}</span>
            </div>
            <h1 className="mt-2 truncate font-display text-2xl font-semibold tracking-tight text-foreground">
              {project.name}
            </h1>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {project.prompt}
            </p>
          </div>
          <div className="hidden md:flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTime(project.created_at)}
          </div>
        </div>
      </header>

      {/* Pitch */}
      {pitch && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={SECTION_ICONS.pitch} label="Pitch" />
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {pitch.body.trim()}
          </p>
        </section>
      )}

      {/* Features */}
      {featureItems.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={SECTION_ICONS.features} label="Core features" />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {featureItems.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm text-foreground"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Screens */}
      {flatScreens.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={SECTION_ICONS.screens} label="Screens" />
          <div className="mt-3 flex flex-wrap gap-2">
            {flatScreens.map((s, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Palette */}
      {swatches.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={SECTION_ICONS.palette} label="Palette" />
          <div className="mt-3 flex gap-3">
            {swatches.map((hex, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="h-12 w-12 rounded-lg border border-border shadow-inner"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-[10px] font-mono text-muted-foreground">
                  {hex}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data model */}
      {dataItems.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={SECTION_ICONS.data} label="Data model" />
          <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
            {dataItems.join("\n")}
          </pre>
        </section>
      )}

      {/* Recent design conversation */}
      {recentChat.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <SectionHeader icon={MessageSquare} label="Recent design notes" />
          <ul className="mt-3 space-y-3">
            {recentChat.map((m) => (
              <li key={m.id} className="flex gap-3 text-sm">
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold uppercase ${
                    m.role === "user"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.role === "user" ? "You" : "AI"}
                </span>
                <p className="line-clamp-3 leading-relaxed text-foreground/90">
                  {m.content}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sections.length === 0 && (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No generated plan yet. Send a message in the chat to start building this app.
          </p>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof Sparkles;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}
