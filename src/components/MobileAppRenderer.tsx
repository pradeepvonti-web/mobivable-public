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

/** Map padding / margin token to pixel value */
const PAD_MAP: Record<string, number> = { none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

/** Renders a single element from the schema, applying per-element style overrides */
function RenderElement({ el }: { el: MElement }) {
  const inner = renderElementInner(el);
  const s = el.style;
  const hasMargin = el.margin != null;
  if (!s && !hasMargin) return inner;
  const wrapStyle: React.CSSProperties = {};
  if (hasMargin) wrapStyle.margin = PAD_MAP[el.margin!] ?? 0;
  if (s) {
    if (s.backgroundColor) wrapStyle.backgroundColor = s.backgroundColor;
    if (s.gradient) wrapStyle.background = `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})`;
    if (s.borderRadius != null) wrapStyle.borderRadius = s.borderRadius;
    if (s.shadow) wrapStyle.boxShadow = SHADOW_MAP[s.shadow];
    if (s.opacity != null) wrapStyle.opacity = s.opacity;
    if (s.padding) wrapStyle.padding = PAD_MAP[s.padding] ?? 12;
  }
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
    case "map-card": {
      const { address, subtitle, actionLabel } = el.props;
      return (
        <div style={{
          borderRadius: 14, overflow: "hidden",
          background: "linear-gradient(135deg, #0d9488, #2563eb)",
          padding: 16, position: "relative", minHeight: 120,
        }}>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "grid", placeItems: "center" }}>
              <MIcon name="map-pin" size={20} />
            </div>
          </div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "center", margin: 0 }}>{address}</p>
          {subtitle && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", textAlign: "center", margin: "4px 0 0" }}>{subtitle}</p>}
          {actionLabel && (
            <button type="button" style={{
              display: "block", margin: "12px auto 0", padding: "6px 16px",
              borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.15)", color: "#fff",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>{actionLabel}</button>
          )}
        </div>
      );
    }
    case "chat-bubble": {
      const { messages = [], showInput, placeholder: cbPlaceholder } = el.props;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((msg: { content: string; sender: string; isUser?: boolean; time?: string; avatar?: string }, i: number) => {
            const isUser = msg.isUser ?? false;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexDirection: isUser ? "row-reverse" : "row" }}>
                  {msg.avatar && (
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "var(--m-primary)", display: "grid", placeItems: "center",
                      color: "#fff", fontSize: 10, fontWeight: 600, flexShrink: 0,
                    }}>{msg.avatar.charAt(0).toUpperCase()}</div>
                  )}
                  <div style={{
                    maxWidth: "75%", padding: "8px 12px", borderRadius: 14,
                    background: isUser ? "var(--m-primary)" : "var(--m-card)",
                    color: isUser ? "#fff" : "var(--m-text)",
                    fontSize: 13, lineHeight: 1.4,
                    borderBottomRightRadius: isUser ? 4 : 14,
                    borderBottomLeftRadius: isUser ? 14 : 4,
                  }}>{msg.content}</div>
                </div>
                {msg.time && <span style={{ fontSize: 9, color: "var(--m-muted)", marginTop: 2, padding: "0 4px" }}>{msg.time}</span>}
              </div>
            );
          })}
          {showInput && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 4,
              padding: "8px 12px", borderRadius: 20,
              background: "var(--m-card)", border: "1px solid var(--m-border)",
            }}>
              <span style={{ flex: 1, fontSize: 12, color: "var(--m-muted)" }}>{cbPlaceholder ?? "Type a message..."}</span>
              <MIcon name="message" size={16} />
            </div>
          )}
        </div>
      );
    }
    case "video-player": {
      const { title, duration, progress } = el.props;
      return (
        <div style={{
          position: "relative", borderRadius: 14, overflow: "hidden",
          background: "#111", height: 180,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Play button */}
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)",
            display: "grid", placeItems: "center", cursor: "pointer",
          }}>
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
              <polygon points="0,0 20,11 0,22" fill="white" />
            </svg>
          </div>
          {/* Title */}
          {title && (
            <span style={{
              position: "absolute", bottom: 12, left: 12,
              fontSize: 12, fontWeight: 600, color: "#fff",
            }}>{title}</span>
          )}
          {/* Duration badge */}
          {duration && (
            <span style={{
              position: "absolute", bottom: 12, right: 12,
              fontSize: 10, color: "#fff", padding: "2px 8px",
              borderRadius: 6, background: "rgba(0,0,0,0.6)",
            }}>{duration}</span>
          )}
          {/* Progress bar */}
          {progress != null && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.2)" }}>
              <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, progress))}%`, background: "var(--m-primary)", transition: "width 0.4s ease" }} />
            </div>
          )}
        </div>
      );
    }
    case "timeline": {
      const { events = [] } = el.props;
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {events.map((ev: { title: string; description?: string; time?: string; icon?: string; color?: string }, i: number) => (
            <div key={i} style={{ display: "flex", gap: 12, minHeight: 60 }}>
              {/* Left: dot + connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                  background: ev.color ?? "var(--m-primary)",
                  border: "2px solid var(--m-bg)",
                  boxShadow: `0 0 0 2px ${ev.color ?? "var(--m-primary)"}44`,
                }} />
                {i < events.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: "var(--m-border)", marginTop: 4 }} />
                )}
              </div>
              {/* Right: content card */}
              <div style={{
                flex: 1, background: "var(--m-card)", borderRadius: 10,
                border: "1px solid var(--m-border)", padding: "10px 12px", marginBottom: 8,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--m-text)", margin: 0 }}>{ev.title}</p>
                {ev.description && <p style={{ fontSize: 11, color: "var(--m-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>{ev.description}</p>}
                {ev.time && <span style={{ fontSize: 9, color: "var(--m-muted)", marginTop: 4, display: "inline-block" }}>{ev.time}</span>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "accordion": {
      const { sections = [] } = el.props;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {sections.map((sec: { title: string; content: string; expanded?: boolean }, i: number) => (
            <div key={i} style={{
              background: "var(--m-card)", borderRadius: 10,
              border: "1px solid var(--m-border)", overflow: "hidden",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", cursor: "pointer",
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--m-text)" }}>{sec.title}</span>
                <MIcon name={sec.expanded ? "chevron-left" : "chevron-right"} size={14} />
              </div>
              {sec.expanded && (
                <div style={{ padding: "0 14px 12px", fontSize: 12, color: "var(--m-muted)", lineHeight: 1.5 }}>
                  {sec.content}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "dropdown": {
      const { label, placeholder, selectedValue } = el.props;
      return (
        <div>
          {label && <label style={{ fontSize: 12, fontWeight: 500, color: "var(--m-text)", display: "block", marginBottom: 4 }}>{label}</label>}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--m-border)", background: "var(--m-card)",
            cursor: "pointer",
          }}>
            <span style={{ fontSize: 13, color: selectedValue ? "var(--m-text)" : "var(--m-muted)" }}>{selectedValue ?? placeholder ?? "Select..."}</span>
            <MIcon name="chevron-right" size={14} />
          </div>
        </div>
      );
    }
    case "date-picker": {
      const { label: dpLabel, value: dpValue, placeholder: dpPlaceholder } = el.props;
      return (
        <div>
          {dpLabel && <label style={{ fontSize: 12, fontWeight: 500, color: "var(--m-text)", display: "block", marginBottom: 4 }}>{dpLabel}</label>}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--m-border)", background: "var(--m-card)",
          }}>
            <span style={{ fontSize: 13, color: dpValue ? "var(--m-text)" : "var(--m-muted)" }}>{dpValue ?? dpPlaceholder ?? "Select date..."}</span>
            <MIcon name="calendar" size={16} />
          </div>
        </div>
      );
    }
    case "checkbox": {
      const { items = [] } = el.props;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item: { label: string; checked?: boolean; description?: string }, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                background: item.checked ? "var(--m-primary)" : "transparent",
                border: item.checked ? "none" : "2px solid var(--m-border)",
                display: "grid", placeItems: "center",
              }}>
                {item.checked && <MIcon name="check" size={13} />}
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--m-text)" }}>{item.label}</span>
                {item.description && <p style={{ fontSize: 11, color: "var(--m-muted)", margin: "2px 0 0" }}>{item.description}</p>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "radio-group": {
      const { label: rgLabel, options = [], selectedValue: rgSelected } = el.props;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rgLabel && <label style={{ fontSize: 12, fontWeight: 500, color: "var(--m-text)", marginBottom: 2 }}>{rgLabel}</label>}
          {options.map((opt: { value: string; label: string; description?: string }, i: number) => {
            const isSelected = opt.value === rgSelected;
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                  border: isSelected ? "none" : "2px solid var(--m-border)",
                  background: isSelected ? "var(--m-primary)" : "transparent",
                  display: "grid", placeItems: "center",
                }}>
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                </div>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--m-text)" }}>{opt.label}</span>
                  {opt.description && <p style={{ fontSize: 11, color: "var(--m-muted)", margin: "2px 0 0" }}>{opt.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    case "textarea": {
      const { label: taLabel, placeholder: taPlaceholder, value: taValue, rows = 4, helper, maxLength } = el.props;
      const charCount = (taValue ?? "").length;
      return (
        <div>
          {taLabel && <label style={{ fontSize: 12, fontWeight: 500, color: "var(--m-text)", display: "block", marginBottom: 4 }}>{taLabel}</label>}
          <div style={{
            padding: "10px 14px", borderRadius: 10,
            border: "1px solid var(--m-border)", background: "var(--m-card)",
            minHeight: rows * 20,
          }}>
            <span style={{ fontSize: 13, color: taValue ? "var(--m-text)" : "var(--m-muted)", lineHeight: 1.5 }}>
              {taValue ?? taPlaceholder ?? ""}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {helper && <span style={{ fontSize: 10, color: "var(--m-muted)" }}>{helper}</span>}
            {maxLength != null && (
              <span style={{ fontSize: 10, color: "var(--m-muted)", marginLeft: "auto" }}>{charCount}/{maxLength}</span>
            )}
          </div>
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

/** Compute CSS style for a screen background */
function screenBgStyle(bg?: MScreen["background"]): React.CSSProperties {
  if (!bg) return {};
  switch (bg.type) {
    case "solid":
      return { backgroundColor: bg.color };
    case "gradient": {
      const dir = bg.direction ?? "to bottom";
      return { background: `linear-gradient(${dir}, ${bg.colors.join(", ")})` };
    }
    case "image":
      return {
        backgroundImage: `linear-gradient(${bg.overlay ?? "rgba(0,0,0,0.45)"}, ${bg.overlay ?? "rgba(0,0,0,0.45)"}), url(${bg.url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    default:
      return {};
  }
}

/** Renders a full screen using the chosen composition template. */
function RenderScreen({ screen }: { screen: MScreen }) {
  const elements = screen.elements ?? [];
  const layout = screen.layout ?? "stack";
  const bgStyle = screenBgStyle(screen.background);

  if (layout === "full-bleed") {
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0, ...bgStyle }}>
        {elements.map((el, i) => <MotionItem key={el.id ?? i} el={el} index={i} />)}
      </div>
    );
  }

  if (layout === "split-hero") {
    const [hero, ...rest] = elements;
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", ...bgStyle }}>
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
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12, ...bgStyle }}>
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
        ...bgStyle,
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
      ...bgStyle,
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
        {/* Drawer: hamburger icon + slide panel */}
        {nav?.type === "drawer" && (
          <>
            <div style={{
              padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
              borderBottom: "1px solid var(--m-border)",
            }}>
              <div style={{ cursor: "pointer", display: "grid", placeItems: "center" }}>
                <svg width="20" height="14" viewBox="0 0 20 14" fill="var(--m-text)">
                  <rect y="0" width="20" height="2" rx="1" />
                  <rect y="6" width="20" height="2" rx="1" />
                  <rect y="12" width="20" height="2" rx="1" />
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--m-text)" }}>{screen?.title ?? ""}</span>
            </div>
            {/* Drawer panel (always visible in preview as a compact sidebar list) */}
            <div style={{
              position: "absolute", top: 0, left: 0, bottom: 0, width: "70%",
              background: "var(--m-card)", borderRight: "1px solid var(--m-border)",
              zIndex: 50, padding: "48px 0 16px",
              transform: "translateX(-100%)", pointerEvents: "none",
            }}>
              {(nav.items ?? []).map((item) => (
                <div key={item.screen} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px", cursor: "pointer",
                  background: item.screen === current ? "var(--m-primary)11" : "transparent",
                  color: item.screen === current ? "var(--m-primary)" : "var(--m-text)",
                }}>
                  <MIcon name={item.icon} size={18} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {screen && <RenderScreen screen={screen} />}
        {/* Bottom tabs (standard) */}
        {nav?.type === "bottom-tabs" && nav.navStyle !== "floating" && nav.navStyle !== "pill" && nav.navStyle !== "notched" && (
          <MobileBottomNav
            items={nav.items}
            activeId={current}
            onSelect={setActiveScreen}
          />
        )}
        {/* Bottom tabs with floating navStyle */}
        {nav?.type === "bottom-tabs" && nav.navStyle === "floating" && (
          <div style={{
            margin: "0 12px 10px", borderRadius: 20,
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            display: "flex", padding: 4,
          }}>
            {(nav.items ?? []).map((item) => (
              <button key={item.screen} type="button" onClick={() => setActiveScreen(item.screen)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "8px 0", border: "none", background: "transparent", cursor: "pointer",
                color: item.screen === current ? "var(--m-primary)" : "var(--m-muted)",
                fontSize: 9, fontWeight: 500,
              }}>
                <MIcon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {/* Bottom tabs with pill navStyle */}
        {nav?.type === "bottom-tabs" && nav.navStyle === "pill" && (
          <div style={{
            display: "flex", padding: "6px 12px 10px", gap: 6,
            background: "var(--m-card)", borderTop: "1px solid var(--m-border)",
          }}>
            {(nav.items ?? []).map((item) => {
              const active = item.screen === current;
              return (
                <button key={item.screen} type="button" onClick={() => setActiveScreen(item.screen)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  padding: "6px 10px", border: "none", cursor: "pointer",
                  borderRadius: 20,
                  background: active ? "var(--m-primary)" : "transparent",
                  color: active ? "#fff" : "var(--m-muted)",
                  fontSize: 11, fontWeight: 500,
                }}>
                  <MIcon name={item.icon} size={16} />
                  {active && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* Bottom tabs with notched navStyle */}
        {nav?.type === "bottom-tabs" && nav.navStyle === "notched" && (
          <div style={{
            display: "flex", padding: "4px 8px 8px", gap: 4,
            background: "var(--m-card)", borderTop: "1px solid var(--m-border)",
            position: "relative",
          }}>
            {(nav.items ?? []).map((item, idx) => {
              const total = nav.items.length;
              const centerIdx = Math.floor(total / 2);
              const isCenter = idx === centerIdx;
              return (
                <button key={item.screen} type="button" onClick={() => setActiveScreen(item.screen)} style={
                  isCenter
                    ? {
                        flex: "0 0 48px", display: "grid", placeItems: "center",
                        border: "none", cursor: "pointer",
                        marginTop: -18,
                        background: "var(--m-primary)", color: "#fff",
                        width: 48, height: 48, borderRadius: "50%",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                        padding: 0, fontSize: 9, fontWeight: 500,
                      }
                    : {
                        flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center" as const, gap: 2,
                        border: "none", cursor: "pointer", background: "transparent",
                        color: item.screen === current ? "var(--m-primary)" : "var(--m-muted)",
                        fontSize: 9, fontWeight: 500, padding: "8px 0",
                      }
                }>
                  <MIcon name={item.icon} size={isCenter ? 22 : 18} />
                  {!isCenter && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* Floating bottom nav */}
        {nav?.type === "floating-bottom" && (
          <div style={{
            margin: "0 16px 12px", borderRadius: 24,
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
            display: "flex", padding: "6px 8px",
          }}>
            {(nav.items ?? []).map((item) => (
              <button key={item.screen} type="button" onClick={() => setActiveScreen(item.screen)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: "8px 0", border: "none", background: "transparent", cursor: "pointer",
                color: item.screen === current ? "var(--m-primary)" : "var(--m-muted)",
                fontSize: 9, fontWeight: 500,
              }}>
                <MIcon name={item.icon} size={18} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {/* Top tabs */}
        {nav?.type === "top-tabs" && (
          <div style={{
            display: "flex", padding: "0 12px", gap: 0,
            borderBottom: "1px solid var(--m-border)",
            background: "var(--m-card)",
            position: "absolute", top: hideStatusBar ? 0 : 36, left: 0, right: 0,
            zIndex: 10,
          }}>
            {(nav.items ?? []).map((item) => {
              const active = item.screen === current;
              return (
                <button key={item.screen} type="button" onClick={() => setActiveScreen(item.screen)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  padding: "10px 0", border: "none", cursor: "pointer",
                  background: "transparent",
                  color: active ? "var(--m-primary)" : "var(--m-muted)",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  borderBottom: active ? "2px solid var(--m-primary)" : "2px solid transparent",
                }}>
                  <MIcon name={item.icon} size={14} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* nav.type === "none" renders nothing */}
      </div>
    </MobileErrorBoundary>
  );
}
