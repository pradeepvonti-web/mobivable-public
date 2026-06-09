/**
 * Schema → real React source code.
 *
 * Takes a `MobileAppSchema` (the JSON the agent pipeline produces) and emits
 * an honest-to-goodness Vite + React + TypeScript project as a file map:
 * `{ "src/App.tsx": "...", "package.json": "...", ... }`.
 *
 * The output is rendered live by the in-app Sandpack preview AND can be
 * committed to a real GitHub repo verbatim. The user gets actual reactive
 * code, not a JSON schema interpreted at runtime.
 *
 * Deterministic, no AI calls — fast, cheap, reproducible.
 */
import type { MobileAppSchema, MElement, MScreen, MAction } from "./mobile-app-schema";
import type { MobileTheme } from "./mobile-theme";

export type FileMap = Record<string, string>;

// ─── Helpers ────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function jsx(s: unknown): string {
  // Safe inside JSX text content: escape braces & angle brackets.
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

function resolveTheme(theme: MobileAppSchema["theme"]): MobileTheme {
  if (theme && typeof theme === "object") return theme as MobileTheme;
  // String preset name — provide a sensible default. The renderer maps
  // string names to themes, but we don't need that level of fidelity in
  // generated code; the schema almost always inlines a MobileTheme.
  return {
    mode: "dark",
    palette: {
      primary: "#6366f1",
      accent: "#a78bfa",
      background: "#0a0a0f",
      card: "#161622",
      text: "#f5f5fa",
      muted: "#a1a1b3",
      border: "#27273a",
      danger: "#ef4444",
      success: "#22c55e",
      gradient: ["#6366f1", "#a78bfa"],
    },
    typography: { headingFont: "Inter", bodyFont: "Inter", scale: "default" },
  } as unknown as MobileTheme;
}

// ─── Element renderer ───────────────────────────────────────────────

function actionHandler(a: MAction | undefined): string {
  if (!a) return "";
  switch (a.type) {
    case "navigate":
      return ` onClick={() => setScreen(${JSON.stringify(a.screen)})}`;
    case "url":
      return ` onClick={() => window.open(${JSON.stringify(a.href)}, '_blank')}`;
    case "dialog":
      return ` onClick={() => alert(${JSON.stringify(a.message ?? "")})}`;
    default:
      return "";
  }
}

function renderElement(el: MElement, depth = 0): string {
  const pad = "  ".repeat(depth + 4);
  const t = (el as { type?: string }).type ?? "text";
  const e = el as Record<string, unknown>;
  const action = actionHandler(e.action as MAction | undefined);

  switch (t) {
    case "header":
      return `${pad}<header className="px-5 pt-8 pb-3">
${pad}  <h1 className="text-2xl font-bold text-[var(--c-text)]">${jsx(e.title)}</h1>
${pad}  ${e.subtitle ? `<p className="text-sm text-[var(--c-muted)] mt-1">${jsx(e.subtitle)}</p>` : ""}
${pad}</header>`;
    case "greeting":
      return `${pad}<div className="px-5 py-4">
${pad}  <p className="text-xs uppercase tracking-widest text-[var(--c-muted)]">${jsx(e.eyebrow ?? "Welcome")}</p>
${pad}  <h2 className="text-xl font-semibold text-[var(--c-text)] mt-1">${jsx(e.title ?? e.text)}</h2>
${pad}</div>`;
    case "text":
      return `${pad}<p className="px-5 py-1.5 text-[15px] leading-relaxed text-[var(--c-text)]">${jsx(e.text ?? e.content)}</p>`;
    case "section":
      return `${pad}<section className="px-5 pt-5 pb-2">
${pad}  <h3 className="text-xs uppercase tracking-widest text-[var(--c-muted)] font-semibold">${jsx(e.title)}</h3>
${pad}  ${e.subtitle ? `<p className="text-sm text-[var(--c-muted)]/80 mt-0.5">${jsx(e.subtitle)}</p>` : ""}
${pad}</section>`;
    case "button":
      return `${pad}<div className="px-5 py-2">
${pad}  <button${action} className="w-full rounded-2xl bg-[var(--c-primary)] text-white font-semibold py-3.5 active:scale-[0.98] transition-transform">${jsx(e.label ?? e.text ?? "Continue")}</button>
${pad}</div>`;
    case "input":
    case "textarea":
      return `${pad}<div className="px-5 py-2">
${pad}  <input placeholder=${JSON.stringify(String(e.placeholder ?? e.label ?? ""))} className="w-full rounded-xl bg-[var(--c-card)] border border-[var(--c-border)] px-4 py-3 text-[var(--c-text)] placeholder:text-[var(--c-muted)]" />
${pad}</div>`;
    case "search-bar":
    case "searchbar":
      return `${pad}<div className="px-5 py-2">
${pad}  <input placeholder=${JSON.stringify(String(e.placeholder ?? "Search"))} className="w-full rounded-full bg-[var(--c-card)] border border-[var(--c-border)] px-4 py-2.5 text-[var(--c-text)] placeholder:text-[var(--c-muted)]" />
${pad}</div>`;
    case "card": {
      const children = Array.isArray(e.elements) ? (e.elements as MElement[]) : [];
      const inner = children.map((c) => renderElement(c, depth + 1)).join("\n");
      return `${pad}<div${action} className="mx-5 my-2 rounded-2xl bg-[var(--c-card)] border border-[var(--c-border)] p-4">
${pad}  ${e.title ? `<h4 className="font-semibold text-[var(--c-text)] mb-1">${jsx(e.title)}</h4>` : ""}
${pad}  ${e.subtitle ? `<p className="text-sm text-[var(--c-muted)] mb-2">${jsx(e.subtitle)}</p>` : ""}
${inner}
${pad}</div>`;
    }
    case "glass-card":
    case "hero-banner":
    case "parallax-hero":
    case "hero":
    case "banner":
    case "onboarding-slide":
    case "slide":
    case "feature-card":
    case "promo-card":
      return `${pad}<div className="mx-5 my-3 rounded-3xl p-6 bg-gradient-to-br from-[var(--c-primary)] to-[var(--c-accent)] text-white shadow-lg">
${pad}  ${e.eyebrow ? `<p className="text-[10px] uppercase tracking-widest opacity-80 mb-2">${jsx(e.eyebrow)}</p>` : ""}
${pad}  <h3 className="text-2xl font-bold leading-tight">${jsx(e.title ?? e.heading ?? "Welcome")}</h3>
${pad}  ${e.subtitle || e.description ? `<p className="text-sm opacity-90 mt-2 leading-relaxed">${jsx(e.subtitle ?? e.description)}</p>` : ""}
${pad}</div>`;
    case "image":
      return `${pad}<img src=${JSON.stringify(String(e.src ?? e.url ?? ""))} alt=${JSON.stringify(String(e.alt ?? ""))} className="mx-5 my-2 rounded-2xl w-[calc(100%-2.5rem)] object-cover" />`;
    case "avatar":
      return `${pad}<div className="px-5 py-2"><div className="h-12 w-12 rounded-full bg-[var(--c-card)] border border-[var(--c-border)] grid place-items-center text-[var(--c-text)] font-semibold">${jsx(String(e.initials ?? e.name ?? "U").toString().slice(0, 2))}</div></div>`;
    case "badge":
      return `${pad}<span className="inline-flex items-center rounded-full bg-[var(--c-primary)]/15 text-[var(--c-primary)] px-2.5 py-0.5 text-xs font-medium mx-5 my-1">${jsx(e.text ?? e.label)}</span>`;
    case "divider":
      return `${pad}<div className="mx-5 my-3 h-px bg-[var(--c-border)]" />`;
    case "spacer":
      return `${pad}<div style={{ height: ${JSON.stringify(typeof e.height === "number" ? e.height : 16)} }} />`;
    case "list": {
      const items = Array.isArray(e.items) ? (e.items as Array<Record<string, unknown>>) : [];
      const itemJsx = items
        .map(
          (it, i) =>
            `${pad}    <li key={${i}} className="flex items-center gap-3 rounded-xl bg-[var(--c-card)] border border-[var(--c-border)] p-3"><div className="flex-1 min-w-0"><p className="text-sm font-medium text-[var(--c-text)] truncate">${jsx(it.title ?? it.label ?? it.name)}</p>${it.subtitle ? `<p className="text-xs text-[var(--c-muted)] truncate">${jsx(it.subtitle)}</p>` : ""}</div>${it.value ? `<span className="text-sm text-[var(--c-muted)]">${jsx(it.value)}</span>` : ""}</li>`,
        )
        .join("\n");
      return `${pad}<ul className="px-5 py-2 space-y-2">
${itemJsx}
${pad}</ul>`;
    }
    case "stat-row": {
      const stats = Array.isArray(e.stats) ? (e.stats as Array<Record<string, unknown>>) : [];
      const cells = stats
        .map(
          (s, i) =>
            `${pad}    <div key={${i}} className="flex-1 rounded-2xl bg-[var(--c-card)] border border-[var(--c-border)] p-4"><p className="text-2xl font-bold text-[var(--c-text)]">${jsx(s.value)}</p><p className="text-xs text-[var(--c-muted)] mt-1">${jsx(s.label)}</p></div>`,
        )
        .join("\n");
      return `${pad}<div className="px-5 py-2 flex gap-3">
${cells}
${pad}</div>`;
    }
    case "progress-bar":
    case "progress-ring":
      return `${pad}<div className="px-5 py-2"><div className="h-2 rounded-full bg-[var(--c-border)] overflow-hidden"><div className="h-full bg-[var(--c-primary)] rounded-full" style={{ width: ${JSON.stringify(`${Math.max(0, Math.min(100, Number(e.value ?? e.progress ?? 0)))}%`)} }} /></div>${e.label ? `<p className="text-xs text-[var(--c-muted)] mt-1.5">${jsx(e.label)}</p>` : ""}</div>`;
    case "chip-group": {
      const chips = Array.isArray(e.chips) ? (e.chips as Array<string | Record<string, unknown>>) : [];
      const items = chips
        .map((c, i) => {
          const label = typeof c === "string" ? c : (c.label ?? c.text);
          return `${pad}    <span key={${i}} className="rounded-full bg-[var(--c-card)] border border-[var(--c-border)] px-3 py-1.5 text-xs text-[var(--c-text)]">${jsx(label)}</span>`;
        })
        .join("\n");
      return `${pad}<div className="px-5 py-2 flex flex-wrap gap-2">
${items}
${pad}</div>`;
    }
    case "toggle":
    case "checkbox":
      return `${pad}<label className="px-5 py-2 flex items-center justify-between"><span className="text-sm text-[var(--c-text)]">${jsx(e.label)}</span><input type="checkbox" defaultChecked={${Boolean(e.value)}} className="h-5 w-9 rounded-full appearance-none bg-[var(--c-border)] checked:bg-[var(--c-primary)] transition-colors" /></label>`;
    case "empty-state":
      return `${pad}<div className="px-5 py-10 text-center"><h4 className="font-semibold text-[var(--c-text)]">${jsx(e.title ?? "Nothing here yet")}</h4><p className="text-sm text-[var(--c-muted)] mt-1">${jsx(e.subtitle ?? e.message ?? "")}</p></div>`;
    default: {
      // Best-effort fallback: render whatever recognizable fields exist
      // so unknown element types still produce useful UI instead of just
      // showing their type name.
      const title = e.title ?? e.heading ?? e.name;
      const subtitle = e.subtitle ?? e.description ?? e.text ?? e.content;
      const items = Array.isArray(e.items)
        ? (e.items as Array<Record<string, unknown>>)
        : Array.isArray(e.slides)
          ? (e.slides as Array<Record<string, unknown>>)
          : Array.isArray(e.options)
            ? (e.options as Array<Record<string, unknown>>)
            : [];
      const itemsJsx = items
        .map(
          (it, i) =>
            `${pad}    <div key={${i}} className="rounded-xl bg-[var(--c-card)] border border-[var(--c-border)] p-3"><p className="text-sm font-medium text-[var(--c-text)]">${jsx(it.title ?? it.label ?? it.name ?? String(it))}</p>${it.subtitle || it.description ? `<p className="text-xs text-[var(--c-muted)] mt-0.5">${jsx(it.subtitle ?? it.description)}</p>` : ""}</div>`,
        )
        .join("\n");
      return `${pad}<div className="mx-5 my-2 rounded-2xl bg-[var(--c-card)] border border-[var(--c-border)] p-4">
${title ? `${pad}  <h4 className="font-semibold text-[var(--c-text)]">${jsx(title)}</h4>` : ""}
${subtitle ? `${pad}  <p className="text-sm text-[var(--c-muted)] mt-1">${jsx(subtitle)}</p>` : ""}
${items.length ? `${pad}  <div className="mt-3 space-y-2">\n${itemsJsx}\n${pad}  </div>` : ""}
${pad}</div>`;
    }
  }
}

// ─── Screen file ────────────────────────────────────────────────────

function screenFileName(s: MScreen): string {
  return `Screen_${safeId(s.id || s.title || "screen")}`;
}

function renderScreenFile(s: MScreen): string {
  const elements = Array.isArray(s.elements) ? s.elements : [];
  const body = elements.map((el) => renderElement(el)).join("\n");
  return `import type { Dispatch, SetStateAction } from "react";

export default function ${screenFileName(s)}({ setScreen }: { setScreen: Dispatch<SetStateAction<string>> }) {
  // Silence "unused" when a screen has no navigate actions.
  void setScreen;
  return (
    <div className="min-h-full pb-24 bg-[var(--c-bg)]">
${body}
    </div>
  );
}
`;
}

// ─── App.tsx ────────────────────────────────────────────────────────

function renderAppFile(schema: MobileAppSchema): string {
  const screens = schema.screens ?? [];
  const nav = schema.navigation;
  const tabs = nav && Array.isArray(nav.items) ? nav.items : [];

  const imports = screens
    .map((s) => `import ${screenFileName(s)} from "./screens/${screenFileName(s)}";`)
    .join("\n");

  const switchCases = screens
    .map(
      (s) =>
        `    case ${JSON.stringify(s.id)}: return <${screenFileName(s)} setScreen={setScreen} />;`,
    )
    .join("\n");

  const tabsJsx = tabs.length
    ? tabs
        .map(
          (t) =>
            `      <button onClick={() => setScreen(${JSON.stringify(t.screen)})} className={"flex-1 py-3 text-xs font-medium " + (screen === ${JSON.stringify(t.screen)} ? "text-[var(--c-primary)]" : "text-[var(--c-muted)]")}>${jsx(t.label ?? t.screen)}</button>`,
        )
        .join("\n")
    : "";

  const initial = JSON.stringify(screens[0]?.id ?? "");

  return `import { useState } from "react";
${imports}

export default function App() {
  const [screen, setScreen] = useState<string>(${initial});

  function renderScreen() {
    switch (screen) {
${switchCases}
      default: return <div className="p-6 text-[var(--c-muted)]">Screen not found: {screen}</div>;
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-neutral-950">
      <div className="relative h-[844px] w-[390px] rounded-[40px] overflow-hidden shadow-2xl border border-neutral-800 bg-[var(--c-bg)] flex flex-col">
        <div className="flex-1 overflow-y-auto">{renderScreen()}</div>
${
  tabsJsx
    ? `        <nav className="absolute bottom-0 inset-x-0 flex border-t border-[var(--c-border)] bg-[var(--c-card)]/95 backdrop-blur">
${tabsJsx}
        </nav>`
    : ""
}
      </div>
    </div>
  );
}
`;
}

// ─── Static files ───────────────────────────────────────────────────

function renderIndexCss(theme: MobileTheme): string {
  const p = (theme as { palette?: Record<string, unknown> }).palette ?? {};
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --c-primary: ${p.primary ?? "#6366f1"};
  --c-accent: ${p.accent ?? "#a78bfa"};
  --c-bg: ${p.background ?? "#0a0a0f"};
  --c-card: ${p.card ?? "#161622"};
  --c-text: ${p.text ?? "#f5f5fa"};
  --c-muted: ${p.muted ?? "#a1a1b3"};
  --c-border: ${p.border ?? "#27273a"};
  --c-danger: ${p.danger ?? "#ef4444"};
  --c-success: ${p.success ?? "#22c55e"};
}

html, body, #root { height: 100%; margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
body { background: #0a0a0f; color: var(--c-text); }
`;
}

const PACKAGE_JSON = `{
  "name": "generated-app",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.3",
    "vite": "^5.4.1"
  }
}
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
`;

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`;

const POSTCSS_CONFIG = `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`;

// ─── Public entry ───────────────────────────────────────────────────

export interface GeneratedProject {
  files: FileMap;
  /** Files that should be displayed in the preview iframe (subset of `files`). */
  previewFiles: FileMap;
  /** Entry path Sandpack should open by default. */
  entry: string;
  /** Number of generated screen files. */
  screenCount: number;
}

export function generateProjectFromSchema(schema: MobileAppSchema): GeneratedProject {
  const theme = resolveTheme(schema.theme);
  const files: FileMap = {};

  files["package.json"] = PACKAGE_JSON;
  files["vite.config.ts"] = VITE_CONFIG;
  files["tsconfig.json"] = TSCONFIG;
  files["tailwind.config.ts"] = TAILWIND_CONFIG;
  files["postcss.config.js"] = POSTCSS_CONFIG;
  files["index.html"] = INDEX_HTML;
  files["src/main.tsx"] = MAIN_TSX;
  files["src/index.css"] = renderIndexCss(theme);
  files["src/App.tsx"] = renderAppFile(schema);

  const screens = schema.screens ?? [];
  for (const s of screens) {
    files[`src/screens/${screenFileName(s)}.tsx`] = renderScreenFile(s);
  }

  files["README.md"] = `# ${schema.name ?? "Generated App"}\n\nGenerated by Mobivable from the approved design mockup.\n\nRun:\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`;

  return {
    files,
    previewFiles: files,
    entry: "/src/App.tsx",
    screenCount: screens.length,
  };
}

// Mark `esc` as intentionally exported helper-of-last-resort to keep
// future generators from re-rolling string escapes.
export const _internals = { esc };
