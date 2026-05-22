import { useEffect, useMemo, useState } from "react";
import type { MobileAppSchema, MElement, MScreen } from "@/lib/mobile-app-schema";
import { resolveTheme, themeToCSSVars, themeFontHref } from "@/lib/mobile-theme";

import { MobileErrorBoundary } from "./MobileErrorBoundary";
import { validateAndFixSchema, formatIssuesSummary } from "@/lib/schema-validator";
import {
  MobileStatusBar, MobileBottomNav, ProgressRing, StatRow, MobileButton,
  ActivityFeed, MSearchBar, MobileInput, MobileList, DonutChart,
  BarChartComponent, SectionHeader, MobileToggle, MobileCarousel, MIcon,
  MobileRating, MobileChipGroup, NotificationCard, PriceTag,
  StepIndicator, CountdownTimer, GridCards, HeroBanner,
} from "./MobileComponents";

/** Renders a single element from the schema */
function RenderElement({ el }: { el: MElement }) {
  switch (el.type) {
    case "greeting": {
      const { name, subtitle } = el.props;
      const d = new Date();
      const hour = d.getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      return (
        <div style={{ padding: "4px 0" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--m-text)", margin: 0 }}>
            {greeting}, {name}!
          </h2>
          <p style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 2 }}>
            {subtitle ?? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
      );
    }
    case "progress-ring":
      return <ProgressRing {...el.props} />;
    case "stat-row":
      return <StatRow stats={el.props.stats} />;
    case "button":
      return <MobileButton {...el.props} />;
    case "activity-feed":
      return <ActivityFeed {...el.props} />;
    case "search-bar":
      return <MSearchBar {...el.props} />;
    case "input":
      return <MobileInput {...el.props} />;
    case "list":
      return <MobileList {...el.props} />;
    case "donut-chart":
      return <DonutChart {...el.props} />;
    case "bar-chart":
      return <BarChartComponent {...el.props} />;
    case "toggle":
      return <MobileToggle {...el.props} />;
    case "carousel":
      return <MobileCarousel {...el.props} />;
    case "text": {
      const sizes: Record<string, number> = { xs: 10, sm: 12, md: 14, lg: 18, xl: 22, "2xl": 28, "3xl": 36 };
      const weights: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
      const colors: Record<string, string> = {
        text: "var(--m-text)", muted: "var(--m-muted)", primary: "var(--m-primary)",
        accent: "var(--m-accent)", danger: "var(--m-danger)", success: "var(--m-success)",
      };
      return (
        <p style={{
          fontSize: sizes[el.props.size ?? "md"], fontWeight: weights[el.props.weight ?? "normal"],
          color: colors[el.props.color ?? "text"], textAlign: el.props.align ?? "left", margin: 0,
        }}>
          {el.props.content}
        </p>
      );
    }
    case "card":
      return (
        <div style={{
          background: "var(--m-card)", borderRadius: 14,
          border: "1px solid var(--m-border)",
          padding: el.props.padding === "none" ? 0 : el.props.padding === "sm" ? 8 : el.props.padding === "lg" ? 20 : 14,
        }}>
          {el.props.title && <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)", marginBottom: 8 }}>{el.props.title}</h3>}
          {el.props.subtitle && <p style={{ fontSize: 11, color: "var(--m-muted)", marginBottom: 8 }}>{el.props.subtitle}</p>}
          {el.props.children?.map((child, i) => <RenderElement key={i} el={child} />)}
        </div>
      );
    case "section":
      return (
        <div style={{ padding: "4px 0" }}>
          <SectionHeader title={el.props.title} action={el.props.action} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(el.props.children ?? []).map((child, i) => <RenderElement key={i} el={child} />)}
          </div>
        </div>
      );
    case "header":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
          {el.props.backButton && <MIcon name="chevron-left" size={20} />}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--m-text)", margin: 0 }}>{el.props.title}</h1>
            {el.props.subtitle && <p style={{ fontSize: 11, color: "var(--m-muted)", margin: 0 }}>{el.props.subtitle}</p>}
          </div>
          {el.props.rightIcon && <MIcon name={el.props.rightIcon} size={20} />}
        </div>
      );
    case "image":
      return (
        <div style={{
          width: "100%",
          height: el.props.height ?? 160,
          borderRadius: el.props.rounded === "full" ? 999 : el.props.rounded === "lg" ? 16 : el.props.rounded === "sm" ? 6 : 10,
          background: el.props.gradient
            ? "linear-gradient(135deg, var(--m-gradient-from), var(--m-gradient-to))"
            : "var(--m-border)",
          display: "grid", placeItems: "center", overflow: "hidden",
        }}>
          {el.props.src ? (
            <img src={el.props.src} alt={el.props.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <MIcon name="image" size={32} />
          )}
        </div>
      );
    case "divider":
      return <div style={{ height: 1, background: el.props?.color ?? "var(--m-border)", margin: "8px 0" }} />;
    case "spacer":
      return <div style={{ height: el.props?.height ?? 16 }} />;
    case "avatar": {
      const s = el.props.size === "sm" ? 32 : el.props.size === "lg" ? 56 : el.props.size === "xl" ? 72 : 40;
      return (
        <div style={{ position: "relative", display: "inline-block" }}>
          <div style={{
            width: s, height: s, borderRadius: "50%",
            background: "var(--m-primary)", display: "grid", placeItems: "center",
            color: "#fff", fontSize: s * 0.4, fontWeight: 600,
          }}>
            {el.props.name.charAt(0).toUpperCase()}
          </div>
          {el.props.status && (
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: s * 0.25, height: s * 0.25, borderRadius: "50%",
              background: el.props.status === "online" ? "var(--m-success)"
                : el.props.status === "away" ? "var(--m-accent)" : "var(--m-muted)",
              border: "2px solid var(--m-bg)",
            }} />
          )}
        </div>
      );
    }
    case "badge":
      return (
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 8,
          background: `var(--m-${el.props.color ?? "primary"})22`,
          color: `var(--m-${el.props.color ?? "primary"})`,
        }}>
          {el.props.label}
        </span>
      );
    case "slider":
      return (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "var(--m-text)" }}>{el.props.label}</span>
            <span style={{ fontSize: 12, color: "var(--m-primary)" }}>
              {el.props.value}{el.props.unit ?? ""}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--m-border)" }}>
            <div style={{
              height: "100%", borderRadius: 3, background: "var(--m-primary)",
              width: `${((el.props.value - (el.props.min ?? 0)) / ((el.props.max ?? 100) - (el.props.min ?? 0))) * 100}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      );
    case "tab-bar":
      return (
        <div style={{ display: "flex", gap: 4, background: "var(--m-card)", borderRadius: 10, padding: 3 }}>
          {(el.props.tabs ?? []).map((tab, i) => (
            <button key={i} type="button" style={{
              flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
              background: tab.active ? "var(--m-primary)" : "transparent",
              color: tab.active ? "#fff" : "var(--m-muted)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      );
    case "rating":
      return <MobileRating {...el.props} />;
    case "chip-group":
      return <MobileChipGroup {...el.props} />;
    case "notification":
      return <NotificationCard {...el.props} />;
    case "price-tag":
      return <PriceTag {...el.props} />;
    case "step-indicator":
      return <StepIndicator {...el.props} />;
    case "countdown":
      return <CountdownTimer {...el.props} />;
    case "grid-cards":
      return <GridCards {...el.props} />;
    case "hero-banner":
      return <HeroBanner {...el.props} />;
    default:
      return null;
  }
}

/** Renders a full screen */
function RenderScreen({ screen }: { screen: MScreen }) {
  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "12px 16px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {(screen.elements ?? []).map((el, i) => (
        <RenderElement key={el.id ?? i} el={el} />
      ))}
    </div>
  );
}

/** Main mobile app renderer — drop-in replacement for phone frame content */
export function MobileAppRenderer({
  schema,
  className,
  onValidationIssues,
}: {
  schema: MobileAppSchema | null;
  className?: string;
  onValidationIssues?: (summary: string, count: number) => void;
}) {
  const [activeScreen, setActiveScreen] = useState<string>("");

  // Validate and auto-fix schema
  const { fixedSchema, issuesSummary, issueCount } = useMemo(() => {
    if (!schema) return { fixedSchema: null, issuesSummary: "", issueCount: 0 };
    const { schema: fixed, issues } = validateAndFixSchema(schema);
    const summary = formatIssuesSummary(issues);
    return { fixedSchema: fixed, issuesSummary: summary, issueCount: issues.length };
  }, [schema]);

  // Notify parent of validation issues
  useMemo(() => {
    if (issueCount > 0 && onValidationIssues) {
      onValidationIssues(issuesSummary, issueCount);
    }
  }, [issuesSummary, issueCount]);

  if (!fixedSchema || !fixedSchema.screens?.length) {
    return (
      <div className={className} style={{
        height: "100%", display: "grid", placeItems: "center",
        background: "#0a0a1a", color: "#64748b", fontSize: 12,
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
          <p>No app generated yet.</p>
          <p style={{ fontSize: 10, marginTop: 4 }}>Send a message to start building.</p>
        </div>
      </div>
    );
  }

  const theme = resolveTheme(fixedSchema.theme);
  const cssVars = themeToCSSVars(theme);
  const fontHref = themeFontHref(theme);
  const current = activeScreen || fixedSchema.screens[0]?.id || "";
  const screen = fixedSchema.screens.find((s) => s.id === current) ?? fixedSchema.screens[0];
  const nav = fixedSchema.navigation;

  // Inject Google Fonts <link> for the chosen typography (idempotent).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = `m-font-${btoa(fontHref).slice(0, 24)}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = fontHref;
    document.head.appendChild(link);
  }, [fontHref]);

  return (
    <MobileErrorBoundary fallbackTitle="Preview Crashed">
      <div
        className={className}
        style={{
          ...cssVars,
          height: "100%", width: "100%",
          display: "flex", flexDirection: "column",
          background: "var(--m-bg)", color: "var(--m-text)",
          fontFamily: "var(--m-font-body)",

          overflow: "hidden", position: "relative",
        } as React.CSSProperties}
      >
        <style>{`.m-preview h1,.m-preview h2,.m-preview h3,.m-preview h4{font-family:var(--m-font-heading);}`}</style>

        {issueCount > 0 && (
          <div style={{
            padding: "4px 12px", fontSize: 9, fontFamily: "monospace",
            background: issueCount > 3 ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
            color: issueCount > 3 ? "#fca5a5" : "#fcd34d",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span>{issueCount > 3 ? "⚠" : "🔧"}</span>
            <span>{issuesSummary}</span>
          </div>
        )}
        <MobileStatusBar />
        {screen && <RenderScreen screen={screen} />}
        {nav?.type === "bottom-tabs" && (
          <MobileBottomNav
            items={nav.items}
            activeId={current}
            onSelect={setActiveScreen}
          />
        )}
      </div>
    </MobileErrorBoundary>
  );
}
