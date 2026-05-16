import { Link } from "@tanstack/react-router";

const sectionLinks = [
  { href: "/#engine", label: "Engine" },
  { href: "/#process", label: "Process" },
  { href: "/#infrastructure", label: "Infrastructure" },
];

const pageLinks = [
  { to: "/docs", label: "Docs" },
  { to: "/pricing", label: "Pricing" },
  { to: "/gallery", label: "Gallery" },
  { to: "/blog", label: "Blog" },
  { to: "/community", label: "Community" },
] as const;

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-6 bg-primary rounded-sm" />
          <span className="font-display text-2xl tracking-tighter uppercase">Mobivable</span>
        </Link>
        <div className="hidden md:flex gap-6 text-xs font-mono uppercase tracking-widest text-muted">
          {sectionLinks.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-primary transition-colors">
              {l.label}
            </a>
          ))}
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
        <button className="px-4 py-2 bg-primary text-background font-display text-sm uppercase tracking-wider hover:bg-foreground transition-colors">
          Start Building
        </button>
      </div>
    </nav>
  );
}
