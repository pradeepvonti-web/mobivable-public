import { type MIconName } from "@/lib/mobile-app-schema";
import {
  Home, Search, User, Settings, Bell, Heart, Star, Plus, Minus, Check, X,
  ChevronRight, ChevronLeft, ArrowUp, ArrowDown, Calendar, Clock, MapPin,
  Camera, Image, Mic, Play, Pause, SkipForward, Volume2, Wifi, Battery,
  Sun, Moon, Cloud, Umbrella, Zap, Flame, Target, Trophy, Gift, Tag,
  Bookmark, MessageSquare, Mail, Phone, Video, FileText, Folder, Edit,
  Trash2, Download, Upload, Share2, Lock, Unlock, Eye, EyeOff, RefreshCw,
  Filter, List, LayoutGrid, BarChart3, PieChart, Activity, TrendingUp,
  TrendingDown, DollarSign, CreditCard, ShoppingCart, ShoppingBag, Package,
  Truck, Map, Compass, Navigation, Globe, Coffee, UtensilsCrossed, Dumbbell,
  Bike, Footprints, Waves, Leaf, Sparkles, Wand2, Bot,
} from "lucide-react";

const ICON_MAP: Record<string, typeof Home> = {
  home: Home, search: Search, user: User, settings: Settings, bell: Bell,
  heart: Heart, star: Star, plus: Plus, minus: Minus, check: Check, x: X,
  "chevron-right": ChevronRight, "chevron-left": ChevronLeft,
  "arrow-up": ArrowUp, "arrow-down": ArrowDown, calendar: Calendar,
  clock: Clock, "map-pin": MapPin, camera: Camera, image: Image, mic: Mic,
  play: Play, pause: Pause, "skip-forward": SkipForward, volume: Volume2,
  wifi: Wifi, battery: Battery, sun: Sun, moon: Moon, cloud: Cloud,
  umbrella: Umbrella, zap: Zap, flame: Flame, target: Target, trophy: Trophy,
  gift: Gift, tag: Tag, bookmark: Bookmark, message: MessageSquare,
  mail: Mail, phone: Phone, video: Video, file: FileText, folder: Folder,
  edit: Edit, trash: Trash2, download: Download, upload: Upload,
  share: Share2, lock: Lock, unlock: Unlock, eye: Eye, "eye-off": EyeOff,
  refresh: RefreshCw, filter: Filter, list: List, grid: LayoutGrid,
  "bar-chart": BarChart3, "pie-chart": PieChart, activity: Activity,
  "trending-up": TrendingUp, "trending-down": TrendingDown,
  "dollar-sign": DollarSign, "credit-card": CreditCard,
  "shopping-cart": ShoppingCart, "shopping-bag": ShoppingBag,
  package: Package, truck: Truck, map: Map, compass: Compass,
  navigation: Navigation, globe: Globe, coffee: Coffee,
  utensils: UtensilsCrossed, dumbbell: Dumbbell, bike: Bike,
  footprints: Footprints, waves: Waves, leaf: Leaf, sparkles: Sparkles,
  wand: Wand2, robot: Bot,
};

export function MIcon({ name, size = 16, className = "" }: { name: MIconName | string; size?: number; className?: string }) {
  const Icon = ICON_MAP[name] ?? Home;
  return <Icon style={{ width: size, height: size }} className={className} />;
}

/* ─── Status Bar ─────────────────────────────────────── */
export function MobileStatusBar() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div style={{
      height: 44, paddingTop: 8, paddingLeft: 24, paddingRight: 24,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 12, fontWeight: 600, color: "var(--m-text)",
      background: "var(--m-bg)", position: "relative", zIndex: 10,
    }}>
      <span>{time}</span>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <MIcon name="wifi" size={12} />
        <MIcon name="battery" size={12} />
      </div>
    </div>
  );
}

/* ─── Bottom Nav ─────────────────────────────────────── */
export function MobileBottomNav({
  items,
  activeId,
  onSelect,
}: {
  items: Array<{ screen: string; label: string; icon: MIconName | string }>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav style={{
      display: "flex", alignItems: "center", justifyContent: "space-around",
      height: 56, borderTop: "1px solid var(--m-border)",
      background: "var(--m-bg)", flexShrink: 0,
    }}>
      {(items ?? []).map((item) => {
        const active = item.screen === activeId;
        return (
          <button
            key={item.screen}
            type="button"
            onClick={() => onSelect(item.screen)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 2, border: "none", background: "none", cursor: "pointer",
              color: active ? "var(--m-primary)" : "var(--m-muted)",
              fontSize: 9, fontWeight: active ? 600 : 400,
              transition: "color 0.2s",
            }}
          >
            <MIcon name={item.icon as MIconName} size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ─── Progress Ring ──────────────────────────────────── */
export function ProgressRing({
  value, max, label, unit, color, size = "md",
}: {
  value: number; max: number; label: string; unit?: string;
  color?: string; size?: "sm" | "md" | "lg";
}) {
  const dims = size === "sm" ? 100 : size === "lg" ? 180 : 140;
  const stroke = size === "sm" ? 6 : size === "lg" ? 10 : 8;
  const r = (dims - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  const offset = circ * (1 - pct);
  const c = color ?? "var(--m-primary)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 0" }}>
      <div style={{ position: "relative", width: dims, height: dims }}>
        <svg width={dims} height={dims} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={dims / 2} cy={dims / 2} r={r} fill="none"
            stroke="var(--m-border)" strokeWidth={stroke} />
          <circle cx={dims / 2} cy={dims / 2} r={r} fill="none"
            stroke={c} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: size === "sm" ? 16 : size === "lg" ? 28 : 22, fontWeight: 700, color: "var(--m-text)" }}>
            {value.toLocaleString()} / {max.toLocaleString()}
          </span>
          {unit && <span style={{ fontSize: 10, color: "var(--m-muted)", marginTop: 2 }}>{unit}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--m-muted)" }}>
        <span style={{ color: pct > 0 ? "var(--m-success)" : "var(--m-danger)", fontSize: 10 }}>
          {pct > 0 ? "↑" : "↓"} {Math.round(pct * 100)}% Goal
        </span>
      </div>
      <span style={{ fontSize: 11, color: "var(--m-muted)" }}>{label}</span>
    </div>
  );
}

/* ─── Stat Row ───────────────────────────────────────── */
export function StatRow({ stats }: {
  stats: Array<{ icon: MIconName | string; value: string | number; label: string; color?: string }>;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-around", gap: 8,
      padding: "12px 0",
    }}>
      {(stats ?? []).map((s, i) => (
        <div key={i} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: (s.color ?? "var(--m-primary)") + "22",
            display: "grid", placeItems: "center",
          }}>
            <MIcon name={s.icon as MIconName} size={16}
              className="" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--m-text)" }}>{s.value}</span>
          <span style={{ fontSize: 9, color: "var(--m-muted)" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Action Button ──────────────────────────────────── */
export function MobileButton({
  label, icon, variant = "primary", fullWidth = true,
}: {
  label: string; icon?: MIconName | string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; fullWidth?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--m-primary)", color: "#fff", border: "none" },
    secondary: { background: "var(--m-card)", color: "var(--m-text)", border: "1px solid var(--m-border)" },
    outline: { background: "transparent", color: "var(--m-primary)", border: "1px solid var(--m-primary)" },
    ghost: { background: "transparent", color: "var(--m-text)", border: "none" },
    danger: { background: "var(--m-danger)", color: "#fff", border: "none" },
  };

  return (
    <button type="button" style={{
      ...styles[variant],
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 8, padding: "14px 20px", borderRadius: 14, fontSize: 14,
      fontWeight: 600, cursor: "pointer", width: fullWidth ? "100%" : "auto",
      transition: "opacity 0.2s",
    }}>
      {icon && <MIcon name={icon as MIconName} size={16} />}
      {label}
    </button>
  );
}

/* ─── Activity Feed ──────────────────────────────────── */
export function ActivityFeed({
  title, items: rawItems, emptyText,
}: {
  title?: string;
  items: Array<{ icon: MIconName | string; label: string; detail?: string; time?: string; color?: string }>;
  emptyText?: string;
}) {
  const items = rawItems ?? [];
  return (
    <div style={{ padding: "8px 0" }}>
      {title && <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)", marginBottom: 12 }}>{title}</h3>}
      {items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "24px 0", color: "var(--m-muted)", fontSize: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📋</div>
          <p>{emptyText ?? "No activities logged today"}</p>
          <p style={{ fontSize: 10, marginTop: 4 }}>Tap "Log Activity" to get started!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(items ?? []).map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 10,
              background: "var(--m-card)", border: "1px solid var(--m-border)",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: (item.color ?? "var(--m-primary)") + "22",
                display: "grid", placeItems: "center", flexShrink: 0,
              }}>
                <MIcon name={item.icon as MIconName} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--m-text)" }}>{item.label}</div>
                {item.detail && <div style={{ fontSize: 10, color: "var(--m-muted)" }}>{item.detail}</div>}
              </div>
              {item.time && <span style={{ fontSize: 10, color: "var(--m-muted)", flexShrink: 0 }}>{item.time}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Search Bar ─────────────────────────────────────── */
export function MSearchBar({ placeholder }: { placeholder?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px", borderRadius: 12,
      background: "var(--m-card)", border: "1px solid var(--m-border)",
    }}>
      <MIcon name="search" size={14} />
      <span style={{ fontSize: 13, color: "var(--m-muted)" }}>{placeholder ?? "Search..."}</span>
    </div>
  );
}

/* ─── Mobile Input ───────────────────────────────────── */
export function MobileInput({ placeholder, label, icon }: { placeholder: string; label?: string; icon?: MIconName | string }) {
  return (
    <div>
      {label && <label style={{ fontSize: 11, fontWeight: 500, color: "var(--m-muted)", marginBottom: 4, display: "block" }}>{label}</label>}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 14px", borderRadius: 12,
        background: "var(--m-card)", border: "1px solid var(--m-border)",
      }}>
        {icon && <MIcon name={icon as MIconName} size={14} />}
        <span style={{ fontSize: 13, color: "var(--m-muted)" }}>{placeholder}</span>
      </div>
    </div>
  );
}

/* ─── List Component ─────────────────────────────────── */
export function MobileList({ items, dividers = true }: {
  items: Array<{
    icon?: MIconName | string; title: string; subtitle?: string;
    trailing?: string; chevron?: boolean; badge?: string; badgeColor?: string;
  }>;
  dividers?: boolean;
}) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", background: "var(--m-card)", border: "1px solid var(--m-border)" }}>
      {(items ?? []).map((item, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          borderBottom: dividers && i < items.length - 1 ? "1px solid var(--m-border)" : "none",
        }}>
          {item.icon && (
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--m-primary)" + "15", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <MIcon name={item.icon as MIconName} size={14} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--m-text)" }}>{item.title}</div>
            {item.subtitle && <div style={{ fontSize: 10, color: "var(--m-muted)", marginTop: 1 }}>{item.subtitle}</div>}
          </div>
          {item.badge && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 8, background: (item.badgeColor ?? "var(--m-primary)") + "22", color: item.badgeColor ?? "var(--m-primary)" }}>
              {item.badge}
            </span>
          )}
          {item.trailing && <span style={{ fontSize: 12, color: "var(--m-muted)" }}>{item.trailing}</span>}
          {item.chevron && <MIcon name="chevron-right" size={14} />}
        </div>
      ))}
    </div>
  );
}

/* ─── Donut Chart ────────────────────────────────────── */
export function DonutChart({ segments, centerLabel, centerValue, size = 120 }: {
  segments: Array<{ value: number; color: string; label: string }>;
  centerLabel?: string; centerValue?: string; size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const stroke = size * 0.12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--m-border)" strokeWidth={stroke} />
        {(segments ?? []).map((seg, i) => {
          const len = (seg.value / total) * circ;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={seg.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              style={{ transition: "all 0.8s ease" }} />
          );
          offset += len;
          return el;
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {centerValue && <span style={{ fontSize: size * 0.16, fontWeight: 700, color: "var(--m-text)" }}>{centerValue}</span>}
          {centerLabel && <span style={{ fontSize: size * 0.08, color: "var(--m-muted)" }}>{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

/* ─── Bar Chart ──────────────────────────────────────── */
export function BarChartComponent({ bars, maxValue, height = 120 }: {
  bars: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number; height?: number;
}) {
  const mx = maxValue ?? Math.max(...(bars ?? []).map(b => b.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, padding: "0 4px" }}>
      {(bars ?? []).map((bar, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%", maxWidth: 28, borderRadius: 4,
            background: bar.color ?? "var(--m-primary)",
            height: Math.max(4, (bar.value / mx) * (height - 20)),
            transition: "height 0.6s ease",
          }} />
          <span style={{ fontSize: 8, color: "var(--m-muted)" }}>{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────── */
export function SectionHeader({ title, action }: { title: string; subtitle?: string; action?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)" }}>{title}</span>
      {action && <span style={{ fontSize: 11, color: "var(--m-primary)", cursor: "pointer" }}>{action}</span>}
    </div>
  );
}

/* ─── Toggle ─────────────────────────────────────────── */
export function MobileToggle({ label, checked, subtitle }: { label: string; checked?: boolean; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--m-text)" }}>{label}</div>
        {subtitle && <div style={{ fontSize: 10, color: "var(--m-muted)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{
        width: 44, height: 24, borderRadius: 12, padding: 2,
        background: checked ? "var(--m-primary)" : "var(--m-border)",
        transition: "background 0.2s", cursor: "pointer",
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transform: checked ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.2s",
        }} />
      </div>
    </div>
  );
}

/* ─── Carousel ───────────────────────────────────────── */
export function MobileCarousel({ items, height = 140 }: {
  items: Array<{ title: string; subtitle?: string; gradient?: string; image?: string }>;
  height?: number;
}) {
  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
      {(items ?? []).map((item, i) => (
        <div key={i} style={{
          minWidth: 220, height, borderRadius: "var(--m-radius-lg, 14px)", padding: 16,
          background: item.gradient ?? `linear-gradient(135deg, var(--m-gradient-from), var(--m-gradient-to))`,
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          flexShrink: 0, color: "#fff", position: "relative", overflow: "hidden",
          boxShadow: "var(--m-shadow-md)",
        }}>
          {item.image && (
            <>
              <img src={item.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.7) 100%)" }} />
            </>
          )}
          <div style={{ position: "relative", fontSize: 15, fontWeight: 700, fontFamily: "var(--m-font-heading)" }}>{item.title}</div>
          {item.subtitle && <div style={{ position: "relative", fontSize: 10, opacity: 0.9, marginTop: 2 }}>{item.subtitle}</div>}
        </div>
      ))}
    </div>
  );
}


/* ─── Rating Stars ───────────────────────────────────── */
export function MobileRating({ value, max = 5, label, size = "md" }: { value: number; max?: number; label?: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? 14 : size === "lg" ? 24 : 18;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} style={{ fontSize: s, color: i < Math.round(value) ? "#f59e0b" : "var(--m-border)", lineHeight: 1 }}>★</span>
        ))}
      </div>
      {label && <span style={{ fontSize: 11, color: "var(--m-muted)" }}>{label}</span>}
    </div>
  );
}

/* ─── Chip Group ─────────────────────────────────────── */
export function MobileChipGroup({ chips }: { chips: Array<{ label: string; active?: boolean; icon?: string; color?: string }> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {(chips ?? []).map((c, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500,
          background: c.active ? (c.color ?? "var(--m-primary)") : "var(--m-card)",
          color: c.active ? "#fff" : "var(--m-text)",
          border: c.active ? "none" : "1px solid var(--m-border)",
          cursor: "pointer", transition: "all 0.2s",
        }}>
          {c.icon && <MIcon name={c.icon as MIconName} size={12} />}
          {c.label}
        </span>
      ))}
    </div>
  );
}

/* ─── Notification Card ──────────────────────────────── */
export function NotificationCard({ title, message, icon, type = "info", time }: {
  title: string; message: string; icon?: string; type?: "info" | "success" | "warning" | "error"; time?: string;
}) {
  const colors = { info: "var(--m-primary)", success: "var(--m-success)", warning: "#f59e0b", error: "var(--m-danger)" };
  const c = colors[type];
  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 12, background: "var(--m-card)", border: "1px solid var(--m-border)", borderLeft: `3px solid ${c}` }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: c + "18", display: "grid", placeItems: "center", flexShrink: 0 }}>
        <MIcon name={(icon ?? "bell") as MIconName} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--m-text)" }}>{title}</span>
          {time && <span style={{ fontSize: 9, color: "var(--m-muted)" }}>{time}</span>}
        </div>
        <p style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 2, lineHeight: 1.4 }}>{message}</p>
      </div>
    </div>
  );
}

/* ─── Price Tag ──────────────────────────────────────── */
export function PriceTag({ price, originalPrice, label, badge, currency = "$" }: {
  price: string; originalPrice?: string; label?: string; badge?: string; currency?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: "var(--m-text)" }}>{currency}{price}</span>
      {originalPrice && <span style={{ fontSize: 14, color: "var(--m-muted)", textDecoration: "line-through" }}>{currency}{originalPrice}</span>}
      {badge && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: "var(--m-success)" + "22", color: "var(--m-success)" }}>{badge}</span>}
      {label && <span style={{ fontSize: 11, color: "var(--m-muted)", width: "100%" }}>{label}</span>}
    </div>
  );
}

/* ─── Step Indicator ─────────────────────────────────── */
export function StepIndicator({ steps: rawSteps }: { steps: Array<{ label: string; completed?: boolean; active?: boolean }> }) {
  const steps = rawSteps ?? [];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {(steps ?? []).map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600,
              background: s.completed ? "var(--m-success)" : s.active ? "var(--m-primary)" : "var(--m-card)",
              color: s.completed || s.active ? "#fff" : "var(--m-muted)",
              border: !s.completed && !s.active ? "1px solid var(--m-border)" : "none",
            }}>
              {s.completed ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 8, color: s.active ? "var(--m-primary)" : "var(--m-muted)", whiteSpace: "nowrap" }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: s.completed ? "var(--m-success)" : "var(--m-border)", margin: "0 4px", marginBottom: 16 }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Countdown ──────────────────────────────────────── */
export function CountdownTimer({ label, hours, minutes, seconds }: { label: string; hours: number; minutes: number; seconds: number }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      <div style={{ fontSize: 10, color: "var(--m-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        {[{ v: hours, l: "HRS" }, { v: minutes, l: "MIN" }, { v: seconds, l: "SEC" }].map(t => (
          <div key={t.l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--m-text)", fontVariantNumeric: "tabular-nums", background: "var(--m-card)", borderRadius: 8, padding: "4px 10px", border: "1px solid var(--m-border)" }}>{pad(t.v)}</div>
            <div style={{ fontSize: 8, color: "var(--m-muted)", marginTop: 4 }}>{t.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Grid Cards ─────────────────────────────────────── */
export function GridCards({ columns = 2, items }: {
  columns?: 2 | 3; items: Array<{ icon?: string; title: string; subtitle?: string; color?: string; badge?: string }>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 8 }}>
      {(items ?? []).map((item, i) => (
        <div key={i} style={{ background: "var(--m-card)", borderRadius: 14, padding: 14, border: "1px solid var(--m-border)", position: "relative" }}>
          {item.badge && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: "var(--m-primary)" + "22", color: "var(--m-primary)" }}>{item.badge}</span>}
          {item.icon && (
            <div style={{ width: 36, height: 36, borderRadius: 10, background: (item.color ?? "var(--m-primary)") + "18", display: "grid", placeItems: "center", marginBottom: 10 }}>
              <MIcon name={item.icon as MIconName} size={16} />
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m-text)" }}>{item.title}</div>
          {item.subtitle && <div style={{ fontSize: 10, color: "var(--m-muted)", marginTop: 2 }}>{item.subtitle}</div>}
        </div>
      ))}
    </div>
  );
}

/* ─── Hero Banner ────────────────────────────────────── */
export function HeroBanner({ title, subtitle, gradient, height = 160, icon, buttonLabel, image }: {
  title: string; subtitle?: string; gradient?: string; height?: number; icon?: string; buttonLabel?: string; image?: string;
}) {
  return (
    <div style={{
      height, borderRadius: "var(--m-radius-lg, 16px)", padding: 20, display: "flex", flexDirection: "column", justifyContent: "flex-end",
      background: gradient ?? "linear-gradient(135deg, var(--m-gradient-from), var(--m-gradient-to))",
      color: "#fff", position: "relative", overflow: "hidden",
      boxShadow: "var(--m-shadow-md)",
    }}>
      {image && (
        <>
          <img src={image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.65) 100%)" }} />
        </>
      )}
      {!image && icon && <div style={{ position: "absolute", top: 16, right: 16, opacity: 0.2 }}><MIcon name={icon as MIconName} size={48} /></div>}
      <div style={{ position: "relative", fontSize: 22, fontWeight: 700, lineHeight: 1.2, fontFamily: "var(--m-font-heading)" }}>{title}</div>
      {subtitle && <div style={{ position: "relative", fontSize: 11, opacity: 0.9, marginTop: 4 }}>{subtitle}</div>}
      {buttonLabel && (
        <button type="button" style={{
          position: "relative", marginTop: 12, padding: "8px 16px", borderRadius: "var(--m-radius-md, 10px)", border: "1px solid rgba(255,255,255,0.3)",
          background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", width: "fit-content",
        }}>{buttonLabel}</button>
      )}
    </div>
  );
}

/* ─── Glass Card ─────────────────────────────────────── */
export function GlassCard({ title, subtitle, tint = "dark", image, children }: {
  title?: string; subtitle?: string; tint?: "light" | "dark" | "primary" | "accent";
  image?: string; children?: React.ReactNode;
}) {
  const tintBg = {
    light: "rgba(255,255,255,0.12)",
    dark: "rgba(10,10,20,0.45)",
    primary: "color-mix(in oklab, var(--m-primary) 28%, transparent)",
    accent: "color-mix(in oklab, var(--m-accent) 28%, transparent)",
  }[tint];
  return (
    <div style={{
      position: "relative", borderRadius: "var(--m-radius-lg, 18px)",
      padding: 18, overflow: "hidden",
      background: tintBg,
      backdropFilter: "blur(20px) saturate(140%)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "var(--m-shadow-md)",
      color: tint === "light" ? "var(--m-text)" : "#fff",
    }}>
      {image && <img src={image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.5, zIndex: -1 }} />}
      {title && <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, fontFamily: "var(--m-font-heading)" }}>{title}</h3>}
      {subtitle && <p style={{ fontSize: 11, opacity: 0.85, margin: "4px 0 10px" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

/* ─── Gradient Mesh Background ───────────────────────── */
export function GradientMeshBg({ colors, intensity = "medium", height, children }: {
  colors?: string[]; intensity?: "subtle" | "medium" | "bold"; height?: number; children?: React.ReactNode;
}) {
  const palette = colors && colors.length >= 2 ? colors : [
    "var(--m-primary)", "var(--m-accent)", "var(--m-gradient-to, var(--m-primary))",
  ];
  const op = intensity === "subtle" ? 0.45 : intensity === "bold" ? 1 : 0.75;
  const blobs = palette.slice(0, 4).map((c, i) => {
    const positions = [
      { top: "-20%", left: "-10%" },
      { top: "10%", right: "-20%" },
      { bottom: "-25%", left: "20%" },
      { bottom: "-10%", right: "10%" },
    ][i];
    return (
      <div key={i} style={{
        position: "absolute", width: 240, height: 240, borderRadius: "50%",
        background: c, filter: "blur(60px)", opacity: op, ...positions,
      }} />
    );
  });
  return (
    <div style={{
      position: "relative", width: "100%", height: height ?? (children ? "auto" : 220),
      borderRadius: "var(--m-radius-lg, 18px)", overflow: "hidden",
      background: "var(--m-card)", padding: children ? 20 : 0,
    }}>
      {blobs}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Parallax Hero ──────────────────────────────────── */
export function ParallaxHero({ title, subtitle, eyebrow, image, height = 220, buttonLabel, align = "left" }: {
  title: string; subtitle?: string; eyebrow?: string; image?: string;
  height?: number; buttonLabel?: string; align?: "left" | "center";
}) {
  return (
    <div style={{
      position: "relative", height, borderRadius: "var(--m-radius-xl, 22px)",
      overflow: "hidden", boxShadow: "var(--m-shadow-lg)",
      background: "linear-gradient(135deg, var(--m-gradient-from), var(--m-gradient-to))",
    }}>
      {image && (
        <img src={image} alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "115%",
          objectFit: "cover", transform: "translateY(-4%) scale(1.05)",
        }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.75) 100%)",
      }} />
      <div style={{
        position: "absolute", inset: 0, padding: 22,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        alignItems: align === "center" ? "center" : "flex-start",
        textAlign: align, color: "#fff",
      }}>
        {eyebrow && <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          padding: "4px 10px", borderRadius: 999, background: "rgba(255,255,255,0.18)",
          backdropFilter: "blur(6px)", marginBottom: 10,
        }}>{eyebrow}</span>}
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.1, fontFamily: "var(--m-font-heading)" }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12, opacity: 0.9, marginTop: 6, maxWidth: 280 }}>{subtitle}</p>}
        {buttonLabel && (
          <button type="button" style={{
            marginTop: 14, padding: "10px 18px", borderRadius: 999,
            background: "#fff", color: "var(--m-text)", border: "none",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>{buttonLabel} →</button>
        )}
      </div>
    </div>
  );
}

/* ─── Marquee ────────────────────────────────────────── */
export function Marquee({ items, speed = "medium", separator = "•", variant = "muted" }: {
  items: string[]; speed?: "slow" | "medium" | "fast"; separator?: string;
  variant?: "primary" | "muted" | "accent";
}) {
  const dur = speed === "slow" ? 40 : speed === "fast" ? 14 : 24;
  const color = variant === "primary" ? "var(--m-primary)" : variant === "accent" ? "var(--m-accent)" : "var(--m-muted)";
  const content = (items ?? []).join(`   ${separator}   `);
  const animName = `m-marquee-${dur}`;
  return (
    <div style={{
      overflow: "hidden", borderTop: "1px solid var(--m-border)",
      borderBottom: "1px solid var(--m-border)", padding: "10px 0",
      background: "var(--m-card)",
    }}>
      <style>{`@keyframes ${animName}{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div style={{
        display: "inline-flex", whiteSpace: "nowrap",
        animation: `${animName} ${dur}s linear infinite`,
        fontSize: 12, fontWeight: 600, color, letterSpacing: 1, textTransform: "uppercase",
      }}>
        <span style={{ paddingRight: 32 }}>{content}</span>
        <span style={{ paddingRight: 32 }}>{content}</span>
      </div>
    </div>
  );
}

/* ─── Stat Card XL ───────────────────────────────────── */
export function StatCardXL({ label, value, delta, deltaDirection = "up", sparkline, icon, accent }: {
  label: string; value: string | number; delta?: string;
  deltaDirection?: "up" | "down" | "flat"; sparkline?: number[];
  icon?: MIconName | string; accent?: string;
}) {
  const dColor = deltaDirection === "down" ? "var(--m-danger)" : deltaDirection === "flat" ? "var(--m-muted)" : "var(--m-success)";
  const dArrow = deltaDirection === "down" ? "↓" : deltaDirection === "flat" ? "→" : "↑";
  const accentColor = accent ?? "var(--m-primary)";
  const series = sparkline ?? [];
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = Math.max(max - min, 1);
  const path = series.length > 1 ? series.map((v, i) => {
    const x = (i / (series.length - 1)) * 100;
    const y = 30 - ((v - min) / range) * 28;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ") : "";
  return (
    <div style={{
      background: "var(--m-card)", borderRadius: "var(--m-radius-lg, 18px)",
      padding: 18, border: "1px solid var(--m-border)",
      boxShadow: "var(--m-shadow-sm)", position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--m-text)", marginTop: 6, fontFamily: "var(--m-font-heading)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
          {delta && <div style={{ fontSize: 12, color: dColor, fontWeight: 600, marginTop: 4 }}>{dArrow} {delta}</div>}
        </div>
        {icon && (
          <div style={{ width: 40, height: 40, borderRadius: 12, background: accentColor + "22", display: "grid", placeItems: "center", color: accentColor }}>
            <MIcon name={icon as MIconName} size={18} />
          </div>
        )}
      </div>
      {series.length > 1 && (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ width: "100%", height: 48, marginTop: 12, display: "block" }}>
          <defs>
            <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L100,32 L0,32 Z`} fill={`url(#spark-${label})`} />
          <path d={path} fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

/* ─── Feature Showcase ───────────────────────────────── */
export function FeatureShowcase({ title, description, image, icon, layout = "image-left", buttonLabel }: {
  title: string; description: string; image?: string; icon?: MIconName | string;
  layout?: "image-left" | "image-right" | "image-top"; buttonLabel?: string;
}) {
  const visual = (
    <div style={{
      width: layout === "image-top" ? "100%" : 110,
      height: layout === "image-top" ? 140 : 110,
      borderRadius: "var(--m-radius-md, 14px)", overflow: "hidden", flexShrink: 0,
      background: image ? "var(--m-border)" : "linear-gradient(135deg, var(--m-gradient-from), var(--m-gradient-to))",
      display: "grid", placeItems: "center",
    }}>
      {image
        ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : icon ? <MIcon name={icon as MIconName} size={36} className="" /> : null}
    </div>
  );
  return (
    <div style={{
      background: "var(--m-card)", borderRadius: "var(--m-radius-lg, 18px)",
      padding: 14, border: "1px solid var(--m-border)",
      display: "flex", flexDirection: layout === "image-top" ? "column" : "row",
      gap: 14, alignItems: layout === "image-top" ? "stretch" : "center",
    }}>
      {layout !== "image-right" && visual}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--m-text)", margin: 0, fontFamily: "var(--m-font-heading)" }}>{title}</h3>
        <p style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 6, lineHeight: 1.45 }}>{description}</p>
        {buttonLabel && (
          <button type="button" style={{
            marginTop: 10, padding: "8px 14px", borderRadius: 999,
            background: "transparent", color: "var(--m-primary)",
            border: "1px solid var(--m-primary)", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>{buttonLabel}</button>
        )}
      </div>
      {layout === "image-right" && visual}
    </div>
  );
}

/* ─── Testimonial ────────────────────────────────────── */
export function Testimonial({ quote, name, role, rating }: {
  quote: string; name: string; role?: string; avatar?: string; rating?: number;
}) {
  return (
    <div style={{
      background: "var(--m-card)", borderRadius: "var(--m-radius-lg, 18px)",
      padding: 18, border: "1px solid var(--m-border)",
      boxShadow: "var(--m-shadow-sm)", position: "relative",
    }}>
      <div style={{
        position: "absolute", top: -8, left: 16, fontSize: 48, lineHeight: 1,
        color: "var(--m-primary)", opacity: 0.25, fontFamily: "serif",
      }}>"</div>
      <p style={{
        fontSize: 13, lineHeight: 1.55, color: "var(--m-text)",
        margin: "8px 0 14px", fontStyle: "italic", fontFamily: "var(--m-font-heading)",
      }}>{quote}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", background: "var(--m-primary)",
          color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13,
        }}>{name.charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-text)" }}>{name}</div>
          {role && <div style={{ fontSize: 10, color: "var(--m-muted)" }}>{role}</div>}
        </div>
        {typeof rating === "number" && (
          <div style={{ display: "flex", gap: 1 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} style={{ fontSize: 12, color: i < Math.round(rating) ? "#f59e0b" : "var(--m-border)" }}>★</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Pricing Card ───────────────────────────────────── */
export function PricingCard({ name, price, period, description, features, buttonLabel, highlighted, badge }: {
  name: string; price: string; period?: string; description?: string;
  features: string[]; buttonLabel?: string; highlighted?: boolean; badge?: string;
}) {
  const bg = highlighted ? "linear-gradient(160deg, var(--m-gradient-from), var(--m-gradient-to))" : "var(--m-card)";
  const fg = highlighted ? "#fff" : "var(--m-text)";
  const mutedFg = highlighted ? "rgba(255,255,255,0.8)" : "var(--m-muted)";
  return (
    <div style={{
      background: bg, color: fg,
      borderRadius: "var(--m-radius-xl, 22px)", padding: 20,
      border: highlighted ? "none" : "1px solid var(--m-border)",
      boxShadow: highlighted ? "var(--m-shadow-lg)" : "var(--m-shadow-sm)",
      position: "relative",
    }}>
      {badge && (
        <span style={{
          position: "absolute", top: 14, right: 14,
          padding: "3px 9px", borderRadius: 999, fontSize: 9, fontWeight: 700,
          background: highlighted ? "rgba(255,255,255,0.25)" : "var(--m-primary)",
          color: "#fff", letterSpacing: 0.5, textTransform: "uppercase",
        }}>{badge}</span>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 1.2 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
        <span style={{ fontSize: 36, fontWeight: 800, fontFamily: "var(--m-font-heading)" }}>{price}</span>
        {period && <span style={{ fontSize: 12, color: mutedFg }}>{period}</span>}
      </div>
      {description && <p style={{ fontSize: 11, color: mutedFg, margin: "6px 0 14px" }}>{description}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: "14px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {(features ?? []).map((f, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              background: highlighted ? "rgba(255,255,255,0.25)" : "color-mix(in oklab, var(--m-success) 22%, transparent)",
              color: highlighted ? "#fff" : "var(--m-success)",
              display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700,
            }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {buttonLabel && (
        <button type="button" style={{
          width: "100%", padding: "12px 16px", borderRadius: "var(--m-radius-md, 12px)",
          background: highlighted ? "#fff" : "var(--m-primary)",
          color: highlighted ? "var(--m-text)" : "#fff",
          border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>{buttonLabel}</button>
      )}
    </div>
  );
}

/* ─── Onboarding Slide ───────────────────────────────── */
export function OnboardingSlide({ title, body, image, icon, step, totalSteps, buttonLabel }: {
  title: string; body: string; image?: string; icon?: MIconName | string;
  step?: number; totalSteps?: number; buttonLabel?: string;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      gap: 16, padding: "20px 12px",
    }}>
      <div style={{
        width: "100%", height: 220, borderRadius: "var(--m-radius-xl, 22px)",
        overflow: "hidden", position: "relative",
        background: "linear-gradient(135deg, var(--m-gradient-from), var(--m-gradient-to))",
        display: "grid", placeItems: "center", boxShadow: "var(--m-shadow-md)",
      }}>
        {image
          ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : icon ? <div style={{ color: "#fff", opacity: 0.85 }}><MIcon name={icon as MIconName} size={72} /></div> : null}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--m-text)", margin: 0, fontFamily: "var(--m-font-heading)" }}>{title}</h2>
      <p style={{ fontSize: 13, color: "var(--m-muted)", lineHeight: 1.5, margin: 0, maxWidth: 280 }}>{body}</p>
      {typeof step === "number" && typeof totalSteps === "number" && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} style={{
              width: i === step - 1 ? 22 : 6, height: 6, borderRadius: 3,
              background: i === step - 1 ? "var(--m-primary)" : "var(--m-border)",
              transition: "width 0.3s",
            }} />
          ))}
        </div>
      )}
      {buttonLabel && (
        <button type="button" style={{
          marginTop: 6, padding: "12px 28px", borderRadius: 999,
          background: "var(--m-primary)", color: "#fff", border: "none",
          fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%",
        }}>{buttonLabel}</button>
      )}
    </div>
  );
}



