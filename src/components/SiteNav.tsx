import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const sectionLinks = [
  { id: "engine", label: "Engine" },
  { id: "process", label: "Process" },
  { id: "infrastructure", label: "Infrastructure" },
];

const pageLinks = [
  { to: "/docs", label: "Docs" },
  { to: "/pricing", label: "Pricing" },
  { to: "/gallery", label: "Gallery" },
  { to: "/blog", label: "Blog" },
  { to: "/community", label: "Community" },
] as const;

function useActiveSection(ids: string[], enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setActive(null);
      return;
    }

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        let best: { id: string; ratio: number } | null = null;
        for (const [id, ratio] of visibility) {
          if (ratio > 0 && (!best || ratio > best.ratio)) {
            best = { id, ratio };
          }
        }
        setActive(best?.id ?? null);
      },
      {
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, enabled]);

  return active;
}

export function SiteNav() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const activeSection = useActiveSection(
    sectionLinks.map((s) => s.id),
    isHome,
  );
  const [open, setOpen] = useState(false);

  // Close the mobile sheet whenever route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-6 bg-primary rounded-sm" />
          <span className="font-display text-2xl tracking-tighter uppercase">Mobivable</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex gap-6 text-xs font-mono uppercase tracking-widest text-muted">
          {sectionLinks.map((l) => {
            const isActive = isHome && activeSection === l.id;
            return (
              <a
                key={l.id}
                href={`/#${l.id}`}
                className={`transition-colors hover:text-primary ${
                  isActive ? "text-primary" : ""
                }`}
                aria-current={isActive ? "true" : undefined}
              >
                {l.label}
              </a>
            );
          })}
          {pageLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="hover:text-primary transition-colors"
              activeProps={{ className: "text-primary" }}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button className="hidden sm:inline-block px-4 py-2 bg-primary text-background font-display text-sm uppercase tracking-wider hover:bg-foreground transition-colors">
            Start Building
          </button>
          <button
            type="button"
            className="md:hidden p-2 text-foreground hover:text-primary transition-colors"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          id="mobile-nav"
          className="md:hidden border-t border-border bg-background/95 backdrop-blur-md"
        >
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1 text-sm font-mono uppercase tracking-widest">
            {sectionLinks.map((l) => {
              const isActive = isHome && activeSection === l.id;
              return (
                <a
                  key={l.id}
                  href={`/#${l.id}`}
                  onClick={() => setOpen(false)}
                  className={`py-3 border-b border-border flex items-center justify-between transition-colors hover:text-primary ${
                    isActive ? "text-primary" : "text-muted"
                  }`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span>{l.label}</span>
                  {isActive && (
                    <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </a>
              );
            })}
            {pageLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setOpen(false)}
                className="py-3 border-b border-border text-muted hover:text-primary transition-colors"
                activeProps={{ className: "py-3 border-b border-border text-primary" }}
              >
                {l.label}
              </Link>
            ))}
            <button className="mt-4 px-4 py-3 bg-primary text-background font-display text-sm uppercase tracking-wider hover:bg-foreground transition-colors">
              Start Building
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
