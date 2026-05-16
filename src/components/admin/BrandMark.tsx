type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  xs: "size-2.5",
  sm: "size-3",
  md: "size-6",
  lg: "size-10",
};

/**
 * Shared primary-square brand mark used across the Admin UI
 * (sidebar, mobile tabs, header logo, empty states).
 * Single source of truth so every admin route stays consistent.
 */
export function BrandMark({
  size = "sm",
  active = true,
  className = "",
}: {
  size?: Size;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`${SIZE_CLASSES[size]} rounded-sm shrink-0 ${
        active ? "bg-primary" : "bg-muted-foreground/40"
      } ${className}`}
    />
  );
}
