import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SiteNav } from "./SiteNav";

export function PageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground font-body">
      <SiteNav />
      <header className="relative border-b border-border py-24 overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-primary" />
        </div>
        <div className="max-w-7xl mx-auto px-6 relative z-10 animate-reveal">
          <div className="inline-block px-2 py-1 border border-primary text-primary text-[10px] font-mono uppercase tracking-[0.2em] mb-6">
            {eyebrow}
          </div>
          <h1 className="font-display text-6xl md:text-8xl uppercase leading-[0.9] tracking-tighter text-balance mb-6">
            {title}
          </h1>
          <p className="text-lg text-muted-foreground max-w-[60ch] text-pretty leading-relaxed">{intro}</p>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-20">{children}</main>
      <footer className="border-t border-border py-10 px-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div>AksData AI Corp © {new Date().getFullYear()} — Mobivable</div>
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/refund" className="hover:text-foreground transition-colors">Refunds</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

