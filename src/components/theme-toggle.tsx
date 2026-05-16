import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";
const STORAGE_KEY = "mobivable:theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

// Global theme store — single source of truth shared by every useTheme() caller.
let currentTheme: Theme = typeof window === "undefined" ? "dark" : readInitialTheme();
const listeners = new Set<(t: Theme) => void>();

function setThemeGlobal(theme: Theme) {
  currentTheme = theme;
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore quota errors
  }
  listeners.forEach((l) => l(theme));
}

if (typeof window !== "undefined") {
  // Cross-tab sync.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark") && e.newValue !== currentTheme) {
      currentTheme = e.newValue;
      applyTheme(currentTheme);
      listeners.forEach((l) => l(currentTheme));
    }
  });
  // Follow system changes when user has no explicit pref.
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", (e) => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== "light" && saved !== "dark") {
      const next: Theme = e.matches ? "dark" : "light";
      currentTheme = next;
      applyTheme(next);
      listeners.forEach((l) => l(next));
    }
  });
  // Ensure DOM reflects initial value (covers SSR hydration).
  applyTheme(currentTheme);
}

export function useTheme() {
  const [theme, setLocal] = useState<Theme>(currentTheme);

  useEffect(() => {
    // Resync in case the module-level value changed before mount.
    if (theme !== currentTheme) setLocal(currentTheme);
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    theme,
    setTheme: setThemeGlobal,
    toggleTheme: () => setThemeGlobal(currentTheme === "dark" ? "light" : "dark"),
  };
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      className={`inline-flex items-center rounded-full border border-border bg-background/80 backdrop-blur p-0.5 ${className}`}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Light theme"
        aria-pressed={theme === "light"}
        className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors ${
          theme === "light" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Dark theme"
        aria-pressed={theme === "dark"}
        className={`inline-flex items-center justify-center h-7 w-7 rounded-full transition-colors ${
          theme === "dark" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Inline no-flash script. Inject early in <body> so the dark class is set
 * before React hydrates, avoiding a light-to-dark flash on reload.
 */
export const themeNoFlashScript = `
(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k);var d=s==='dark'||(!s&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var el=document.documentElement;if(d)el.classList.add('dark');el.style.colorScheme=d?'dark':'light';}catch(e){}})();
`.trim();
