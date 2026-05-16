import { RefreshCw, Inbox, Plus, Trash2, Save, X, Check, ExternalLink, Search } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

// Single source of truth for icons used across the Admin UI.
// Sub-components must import from here so every action button and
// empty-state shares the same glyph set.
export const AdminIcons = {
  refresh: RefreshCw,
  empty: Inbox,
  create: Plus,
  delete: Trash2,
  save: Save,
  cancel: X,
  confirm: Check,
  externalLink: ExternalLink,
  search: Search,
} as const;

type Icon = ComponentType<{ className?: string }>;

export function AdminActionButton({
  icon: Icon,
  loading,
  variant = "secondary",
  children,
  ...rest
}: {
  icon: Icon;
  loading?: boolean;
  variant?: "primary" | "secondary" | "destructive";
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const base =
    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "destructive"
      ? "border border-destructive/40 text-destructive hover:bg-destructive/10"
      : "border border-border bg-card text-foreground hover:bg-muted/40";
  return (
    <button type="button" className={`${base} ${styles}`} {...rest}>
      <Icon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      {children}
    </button>
  );
}

export function AdminEmptyState({
  title,
  description,
  icon: Icon = AdminIcons.empty,
}: {
  title: string;
  description?: string;
  icon?: Icon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <div className="size-10 rounded-sm bg-primary grid place-items-center">
        <Icon className="h-5 w-5 text-primary-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}
