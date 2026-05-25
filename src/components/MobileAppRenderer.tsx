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
  GlassCard, GradientMeshBg, ParallaxHero, Marquee, StatCardXL,
  FeatureShowcase, Testimonial, PricingCard, OnboardingSlide,
} from "./MobileComponents";


/** Map shadow size to CSS box-shadow value */
const SHADOW_MAP: Record<string, string> = {
  sm: "0 1px 2px rgba(0,0,0,0.08)",
  md: "0 8px 24px rgba(0,0,0,0.20)",
  lg: "0 24px 60px rgba(0,0,0,0.30)",
};

/** Map padding token to pixel value */
const PAD_MAP: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** Renders a single element from the schema, applying per-element style overrides */
function RenderElement({ el }: { el: MElement }) {
  const inner = renderElementInner(el);
  const s = el.style;
  if (!s) return inner;
  const wrapStyle: React.CSSProperties = {};
  if (s.backgroundColor) wrapStyle.backgroundColor = s.backgroundColor;
  if (s.gradient) wrapStyle.background = `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})`;
  if (s.borderRadius != null) wrapStyle.borderRadius = s.borderRadius;
  if (s.shadow) wrapStyle.boxShadow = SHADOW_MAP[s.shadow];
  if (s.opacity != null) wrapStyle.opacity = s.opacity;
  if (s.padding) wrapStyle.padding = PAD_MAP[s.padding] ?? 12;
  return <div style={wrapStyle}>{inner}</div>;
}

function renderElementInner(el: MElement): React.ReactNode {
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
          {el.props.children?.map((child: MElement, i: number) => <RenderElement key={i} el={child} />)}
        </div>
      );
    case "section":
      return (
        <div style={{ padding: "4px 0" }}>
          <SectionHeader title={el.props.title} action={el.props.action} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(el.props.children ?? []).map((child: MElement, i: number) => <RenderElement key={i} el={child} />)}
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
          {(el.props.tabs ?? []).map((tab: { label: string; active?: boolean }, i: number) => (
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
    case "glass-card":
      return (
        <GlassCard {...el.props}>
          {(el.props.children ?? []).map((child: MElement, i: number) => <RenderElement key={i} el={child} />)}
        </GlassCard>
      );
    case "gradient-mesh-bg":
      return (
        <GradientMeshBg {...el.props}>
          {(el.props.children ?? []).map((child: MElement, i: number) => <RenderElement key={i} el={child} />)}
        </GradientMeshBg>
      );
    case "parallax-hero":
      return <ParallaxHero {...el.props} />;
    case "marquee":
      return <Marquee {...el.props} />;
    case "stat-card-xl":
      return <StatCardXL {...el.props} />;
    case "feature-showcase":
      return <FeatureShowcase {...el.props} />;
    case "testimonial":
      return <Testimonial {...el.props} />;
    case "pricing-card":
      return <PricingCard {...el.props} />;
    case "onboarding-slide":
      return <OnboardingSlide {...el.props} />;
    case "line-chart": {
      const { series = [], labels = [], height = 140, fill = true, showDots = false, showGrid = true } = el.props;
      const allData = series.flatMap((s: { data: number[] }) => s.data);
      const maxVal = Math.max(...allData, 1);
      const minVal = Math.min(...allData, 0);
      const range = maxVal - minVal || 1;
      const svgW = 280;
      const svgH = height;
      const padT = 8, padB = 20, padL = 30, padR = 8;
      const chartW = svgW - padL - padR;
      const chartH = svgH - padT - padB;
      const uid = `lc-${Math.random().toString(36).slice(2, 8)}`;
      return (
        <div style={{ width: "100%", height }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
            {showGrid && Array.from({ length: 5 }).map((_, gi) => {
              const y = padT + (chartH / 4) * gi;
              return <line key={gi} x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--m-border)" strokeWidth={0.5} />;
            })}
            <defs>
              {series.map((s: { label: string; data: number[]; color?: string }, si: number) => (
                <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color ?? "var(--m-primary)"} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color ?? "var(--m-primary)"} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {series.map((s: { label: string; data: number[]; color?: string }, si: number) => {
              const pts = s.data.map((v: number, di: number) => {
                const x = padL + (chartW / Math.max(s.data.length - 1, 1)) * di;
                const y = padT + chartH - ((v - minVal) / range) * chartH;
                return `${x},${y}`;
              });
              const polyStr = pts.join(" ");
              const lastPt = pts[pts.length - 1];
              const firstX = padL;
              const lastX = padL + chartW;
              const fillPath = fill
                ? `M ${firstX},${padT + chartH} L ${polyStr} L ${lastX},${padT + chartH} Z`
                : undefined;
              const c = s.color ?? "var(--m-primary)";
              return (
                <g key={si}>
                  {fillPath && <path d={fillPath} fill={`url(#${uid}-g${si})`} />}
                  <polyline points={polyStr} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {showDots && s.data.map((_v: number, di: number) => {
                    const [cx, cy] = pts[di].split(",").map(Number);
                    return <circle key={di} cx={cx} cy={cy} r={2.5} fill={c} />;
                  })}
                  {lastPt && (() => { const [cx, cy] = lastPt.split(",").map(Number); return <circle cx={cx} cy={cy} r={3} fill={c} stroke="var(--m-bg)" strokeWidth={1.5} />; })()}
                </g>
              );
            })}
            {labels.length > 0 && labels.map((l: string, li: number) => {
              const x = padL + (chartW / Math.max(labels.length - 1, 1)) * li;
              return <text key={li} x={x} y={svgH - 4} textAnchor="middle" fontSize={8} fill="var(--m-muted)">{l}</text>;
            })}
            {Array.from({ length: 5 }).map((_, gi) => {
              const val = minVal + (range / 4) * (4 - gi);
              const y = padT + (chartH / 4) * gi;
              return <text key={gi} x={padL - 4} y={y + 3} textAnchor="end" fontSize={7} fill="var(--m-muted)">{Math.round(val)}</text>;
            })}
          </svg>
        </div>
      );
    }
    case "sparkline": {
      const { data = [], color = "var(--m-primary)", height: spH = 32, fill: spFill = true, showLastDot = true } = el.props;
      if (!data.length) return <div style={{ height: spH }} />;
      const maxV = Math.max(...data, 1);
      const minV = Math.min(...data, 0);
      const rangeV = maxV - minV || 1;
      const w = 120;
      const uid = `sp-${Math.random().toString(36).slice(2, 8)}`;
      const pts = data.map((v: number, i: number) => {
        const x = (w / Math.max(data.length - 1, 1)) * i;
        const y = spH - 4 - ((v - minV) / rangeV) * (spH - 8);
        return `${x},${y}`;
      });
      const polyStr = pts.join(" ");
      const lastPt = pts[pts.length - 1];
      return (
        <svg viewBox={`0 0 ${w} ${spH}`} style={{ width: "100%", height: spH }} preserveAspectRatio="none">
          {spFill && (
            <>
              <defs>
                <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={`M 0,${spH} L ${polyStr} L ${w},${spH} Z`} fill={`url(#${uid})`} />
            </>
          )}
          <polyline points={polyStr} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {showLastDot && lastPt && (() => { const [cx, cy] = lastPt.split(",").map(Number); return <circle cx={cx} cy={cy} r={2.5} fill={color} stroke="var(--m-bg)" strokeWidth={1} />; })()}
        </svg>
      );
    }
    case "progress-bar": {
      const { value = 0, max: pbMax = 100, label: pbLabel, color: pbColor, showPercent = false, height: pbH = 8 } = el.props;
      const pct = Math.min(100, Math.max(0, (value / (pbMax || 1)) * 100));
      const barColor = pbColor ?? "var(--m-primary)";
      return (
        <div>
          {(pbLabel || showPercent) && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              {pbLabel && <span style={{ fontSize: 12, color: "var(--m-text)", fontWeight: 500 }}>{pbLabel}</span>}
              {showPercent && <span style={{ fontSize: 12, color: "var(--m-muted)" }}>{Math.round(pct)}%</span>}
            </div>
          )}
          <div style={{ width: "100%", height: pbH, borderRadius: pbH / 2, background: "var(--m-border)", overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%", borderRadius: pbH / 2,
              background: `linear-gradient(90deg, ${barColor}, color-mix(in srgb, ${barColor} 70%, white))`,
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            }} />
          </div>
        </div>
      );
    }
    case "skeleton": {
      const { variant = "text", lines: skLines = 3, height: skelH } = el.props;
      const shimmerStyle: React.CSSProperties = {
        background: "linear-gradient(90deg, var(--m-border) 25%, color-mix(in srgb, var(--m-border) 60%, var(--m-card)) 50%, var(--m-border) 75%)",
        backgroundSize: "200% 100%",
        animation: "m-shimmer 1.5s infinite ease-in-out",
        borderRadius: 6,
      };
      const renderSkLines = (count: number) =>
        Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ ...shimmerStyle, height: 12, marginBottom: 8, width: i === count - 1 ? "60%" : i === 0 ? "90%" : "75%" }} />
        ));
      let skContent: React.ReactNode;
      switch (variant) {
        case "text":
          skContent = <div>{renderSkLines(skLines)}</div>;
          break;
        case "card":
          skContent = <div style={{ ...shimmerStyle, height: skelH ?? 120, borderRadius: 14 }} />;
          break;
        case "avatar":
          skContent = <div style={{ ...shimmerStyle, width: skelH ?? 48, height: skelH ?? 48, borderRadius: "50%" }} />;
          break;
        case "image":
          skContent = <div style={{ ...shimmerStyle, height: skelH ?? 160, borderRadius: 10 }} />;
          break;
        case "list":
          skContent = (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: skLines }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ ...shimmerStyle, width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ ...shimmerStyle, height: 12, marginBottom: 6, width: "70%" }} />
                    <div style={{ ...shimmerStyle, height: 10, width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          );
          break;
        default:
          skContent = <div>{renderSkLines(skLines)}</div>;
      }
      return (
        <>
          <style>{`@keyframes m-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
          {skContent}
        </>
      );
    }
    case "empty-state": {
      const { icon, title, description, actionLabel, actionIcon } = el.props;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "var(--m-primary)11", display: "grid", placeItems: "center", marginBottom: 16,
          }}>
            <MIcon name={icon} size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--m-text)", margin: "0 0 6px" }}>{title}</h3>
          {description && <p style={{ fontSize: 12, color: "var(--m-muted)", margin: "0 0 16px", maxWidth: 220, lineHeight: 1.5 }}>{description}</p>}
          {actionLabel && (
            <button type="button" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 10, border: "none",
              background: "var(--m-primary)", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              {actionIcon && <MIcon name={actionIcon} size={14} />}
              {actionLabel}
            </button>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}


/** Default entrance per element type for sensible motion when not specified. */
function defaultEntranceFor(type: string): string {
  if (type === "hero-banner" || type === "parallax-hero" || type === "gradient-mesh-bg") return "blur-in";
  if (type === "onboarding-slide") return "scale-in";
  if (type === "marquee") return "fade-in";
  if (type === "stat-card-xl" || type === "pricing-card" || type === "glass-card") return "pop";
  return "fade-up";
}

/** Compute motion class + per-index stagger style for an element. */
function motionWrapProps(el: MElement, index: number): { className: string; style: React.CSSProperties } {
  const entrance = el.entrance ?? defaultEntranceFor(el.type);
  const gesture = el.gesture;
  const cls = ["m-el", `m-anim-${entrance}`];
  if (gesture) cls.push(`m-g-${gesture}`);
  return {
    className: cls.join(" "),
    style: { animationDelay: `calc(var(--m-stagger) * ${index})` },
  };
}

function MotionItem({ el, index, block }: { el: MElement; index: number; block?: boolean }) {
  const w = motionWrapProps(el, index);
  return (
    <div className={w.className} style={{ ...w.style, ...(block ? { display: "block" } : null) }}>
      <RenderElement el={el} />
    </div>
  );
}

/** Renders a full screen using the chosen composition template. */
function RenderScreen({ screen }: { screen: MScreen }) {
  const elements = screen.elements ?? [];
  const layout = screen.layout ?? "stack";

  if (layout === "full-bleed") {
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
        {elements.map((el, i) => <MotionItem key={el.id ?? i} el={el} index={i} />)}
      </div>
    );
  }

  if (layout === "split-hero") {
    const [hero, ...rest] = elements;
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {hero && <MotionItem el={hero} index={0} />}
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {rest.map((el, i) => <MotionItem key={el.id ?? i} el={el} index={i + 1} />)}
        </div>
      </div>
    );
  }

  if (layout === "magazine") {
    const [feature, ...rest] = elements;
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {feature && <MotionItem el={feature} index={0} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {rest.map((el, i) => <MotionItem key={el.id ?? i} el={el} index={i + 1} />)}
        </div>
      </div>
    );
  }

  if (layout === "bento-grid") {
    return (
      <div style={{
        flex: 1, overflowY: "auto", padding: "12px 16px",
        display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, alignContent: "start",
      }}>
        {elements.map((el, i) => {
          const w = motionWrapProps(el, i);
          return (
            <div
              key={el.id ?? i}
              className={w.className}
              style={{ ...w.style, gridColumn: (el.span ?? 1) === 2 ? "span 2" : "span 1" }}
            >
              <RenderElement el={el} />
            </div>
          );
        })}
      </div>
    );
  }

  // default: stack
  return (
    <div style={{
      flex: 1, overflowY: "auto", padding: "12px 16px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {elements.map((el, i) => <MotionItem key={el.id ?? i} el={el} index={i} />)}
    </div>
  );
}


/** Main mobile app renderer — drop-in replacement for phone frame content */
export function MobileAppRenderer({
  schema,
  className,
  onValidationIssues,
  onScreenChange,
  hideStatusBar = false,
}: {
  schema: MobileAppSchema | null;
  className?: string;
  onValidationIssues?: (summary: string, count: number) => void;
  /** Fires whenever the active screen changes (initial mount + user tab). */
  onScreenChange?: (screenId: string) => void;
  /** Suppress the built-in status bar (e.g. when wrapped in a DeviceFrame that owns it). */
  hideStatusBar?: boolean;
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

  // Notify parent of active screen (initial + on tab change).
  useEffect(() => {
    onScreenChange?.(current);
  }, [current, onScreenChange]);

  return (
    <MobileErrorBoundary fallbackTitle="Preview Crashed">
      <div
        className={`m-preview ${className ?? ""}`.trim()}

        style={{
          ...cssVars,
          height: "100%", width: "100%",
          display: "flex", flexDirection: "column",
          background: "var(--m-bg)", color: "var(--m-text)",
          fontFamily: "var(--m-font-body)",

          overflow: "hidden", position: "relative",
        } as React.CSSProperties}
      >
        <style>{`
.m-preview h1,.m-preview h2,.m-preview h3,.m-preview h4{font-family:var(--m-font-heading);}
.m-preview .m-el{animation-duration:var(--m-duration);animation-timing-function:var(--m-ease);animation-fill-mode:both;}
.m-preview .m-anim-none{animation:none!important;}
.m-preview .m-anim-fade-up{animation-name:m-fade-up;}
.m-preview .m-anim-fade-in{animation-name:m-fade-in;}
.m-preview .m-anim-scale-in{animation-name:m-scale-in;}
.m-preview .m-anim-slide-left{animation-name:m-slide-left;}
.m-preview .m-anim-slide-right{animation-name:m-slide-right;}
.m-preview .m-anim-pop{animation-name:m-pop;animation-duration:var(--m-spring-bouncy-d);animation-timing-function:var(--m-spring-bouncy-e);}
.m-preview .m-anim-blur-in{animation-name:m-blur-in;animation-duration:var(--m-spring-gentle-d);animation-timing-function:var(--m-spring-gentle-e);}
.m-preview .m-g-tap-scale{transition:transform var(--m-spring-snappy-d) var(--m-spring-snappy-e);cursor:pointer;}
.m-preview .m-g-tap-scale:active{transform:scale(.96);}
.m-preview .m-g-press-glow{transition:box-shadow var(--m-duration) var(--m-ease);}
.m-preview .m-g-press-glow:active{box-shadow:0 0 0 4px color-mix(in srgb, var(--m-primary) 35%, transparent);}
.m-preview .m-g-swipe-hint{animation:m-swipe 1.8s var(--m-spring-gentle-e) infinite;}
@keyframes m-fade-up{from{opacity:0;transform:translateY(var(--m-motion-distance));}to{opacity:1;transform:translateY(0);}}
@keyframes m-fade-in{from{opacity:0;}to{opacity:1;}}
@keyframes m-scale-in{from{opacity:0;transform:scale(.94);}to{opacity:1;transform:scale(1);}}
@keyframes m-slide-left{from{opacity:0;transform:translateX(var(--m-motion-distance));}to{opacity:1;transform:translateX(0);}}
@keyframes m-slide-right{from{opacity:0;transform:translateX(calc(-1 * var(--m-motion-distance)));}to{opacity:1;transform:translateX(0);}}
@keyframes m-pop{0%{opacity:0;transform:scale(.7);}60%{transform:scale(1.04);}100%{opacity:1;transform:scale(1);}}
@keyframes m-blur-in{from{opacity:0;filter:blur(10px);}to{opacity:1;filter:blur(0);}}
@keyframes m-swipe{0%,100%{transform:translateX(0);}50%{transform:translateX(6px);}}
@media (prefers-reduced-motion:reduce){.m-preview .m-el,.m-preview .m-g-swipe-hint{animation:none!important;}}
`}</style>

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
        {!hideStatusBar && <MobileStatusBar />}
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
