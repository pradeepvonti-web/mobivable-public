/**
 * DesignBriefCard — Interactive plan card shown in chat after research_and_plan.
 * Shows:
 *   - Plan steps (collapsible)
 *   - Color palette swatches
 *   - Typography preview
 *   - Screen layout wireframes
 *   - AI-generated design mockup image
 *   - Approve / Edit / Regenerate buttons
 */
import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, Palette, Type, Layout, Sparkles, RefreshCw, Pencil } from "lucide-react";

interface DesignBriefCardProps {
  appName: string;
  planSteps: string[];
  brief: Record<string, unknown>;
  mockupUrl: string | null;
  onApprove: () => void;
  onEdit: (feedback: string) => void;
  onRegenerate: () => void;
}

export function DesignBriefCard({
  appName,
  planSteps,
  brief,
  mockupUrl,
  onApprove,
  onEdit,
  onRegenerate,
}: DesignBriefCardProps) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [mockupExpanded, setMockupExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [feedback, setFeedback] = useState("");

  const palette = brief.palette as Record<string, string | string[]> | undefined;
  const typography = brief.typography as Record<string, string> | undefined;
  const screens = (brief.screens ?? []) as { id: string; title: string; layout?: string; purpose?: string }[];
  const mood = (brief.mood as string) ?? "";
  const audience = (brief.audience as string) ?? "";
  const references = (brief.references as string[]) ?? [];

  const paletteColors = palette
    ? [
        { label: "Primary", color: palette.primary as string },
        { label: "Accent", color: palette.accent as string },
        { label: "BG", color: palette.background as string },
        { label: "Card", color: palette.card as string },
        { label: "Text", color: palette.text as string },
      ].filter((c) => c.color)
    : [];

  const gradientColors = (palette?.gradient ?? []) as string[];

  return (
    <div
      className="design-brief-card"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 100%)",
        border: "1px solid rgba(99,102,241,0.15)",
        borderRadius: 16,
        overflow: "hidden",
        animation: "fadeInUp 0.5s ease-out",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
          }}
        >
          📋
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
            Design Plan
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
            {appName} · {planSteps.length} steps · {screens.length} screens
          </div>
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 20,
            background: "rgba(250,204,21,0.12)",
            color: "#FACC15",
            border: "1px solid rgba(250,204,21,0.2)",
          }}
        >
          Awaiting Review
        </div>
      </div>

      {/* Plan Steps (collapsible) */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <button
          type="button"
          onClick={() => setStepsExpanded(!stepsExpanded)}
          style={{
            width: "100%",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            color: "var(--foreground)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Layout className="h-3.5 w-3.5" style={{ color: "#6366F1", flexShrink: 0 }} />
          <span>Plan Steps ({planSteps.length})</span>
          <span style={{ flex: 1 }} />
          {stepsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {stepsExpanded && (
          <div style={{ padding: "0 20px 16px" }}>
            {planSteps.map((step, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "6px 0",
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: "rgba(99,102,241,0.12)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#818CF8",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </div>
                <span>{step}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Color Palette */}
      {paletteColors.length > 0 && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Palette className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Color Palette</span>
            <span style={{ fontSize: 10, color: "var(--muted-foreground)", marginLeft: 4 }}>
              {(palette?.mode as string) ?? "dark"} mode
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {paletteColors.map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: c.color,
                    border: "2px solid rgba(255,255,255,0.1)",
                    boxShadow: `0 4px 12px ${c.color}33`,
                    transition: "transform 0.2s ease",
                    cursor: "pointer",
                  }}
                  title={`${c.label}: ${c.color}`}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                />
                <span style={{ fontSize: 8, color: "var(--muted-foreground)", letterSpacing: "0.02em" }}>
                  {c.label}
                </span>
              </div>
            ))}
            {gradientColors.length >= 2 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: 50,
                    height: 36,
                    borderRadius: 10,
                    background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
                    border: "2px solid rgba(255,255,255,0.1)",
                  }}
                  title={`Gradient: ${gradientColors.join(" → ")}`}
                />
                <span style={{ fontSize: 8, color: "var(--muted-foreground)" }}>Gradient</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Typography */}
      {typography && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Type className="h-3.5 w-3.5" style={{ color: "#10B981" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Typography</span>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {typography.headingFont && (
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.12)",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>
                  {typography.headingFont}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Heading
                </div>
              </div>
            )}
            {typography.bodyFont && (
              <div
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: "rgba(99,102,241,0.06)",
                  border: "1px solid rgba(99,102,241,0.12)",
                }}
              >
                <div style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 2 }}>
                  {typography.bodyFont}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Body
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Screens */}
      {screens.length > 0 && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Layout className="h-3.5 w-3.5" style={{ color: "#8B5CF6" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
              Screens ({screens.length})
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
            {screens.map((s, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(139,92,246,0.06)",
                  border: "1px solid rgba(139,92,246,0.12)",
                  transition: "background 0.2s",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>
                  {s.title ?? s.id}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: "#A78BFA",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 500,
                  }}
                >
                  {s.layout ?? "stack"}
                </div>
                {s.purpose && (
                  <div style={{ fontSize: 9, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.4 }}>
                    {s.purpose.slice(0, 60)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mood & References */}
      {(mood || references.length > 0) && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: "#F59E0B" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Design Direction</span>
          </div>
          {mood && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 6 }}>
              <strong style={{ color: "var(--foreground)" }}>Mood:</strong> {mood}
            </div>
          )}
          {audience && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 6 }}>
              <strong style={{ color: "var(--foreground)" }}>Audience:</strong> {audience}
            </div>
          )}
          {references.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              <strong style={{ color: "var(--foreground)" }}>Inspirations:</strong> {references.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Design Mockup Image */}
      {mockupUrl && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Layout className="h-3.5 w-3.5" style={{ color: "#EC4899" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Design Mockup</span>
          </div>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              cursor: "pointer",
              position: "relative",
            }}
            onClick={() => setMockupExpanded(true)}
          >
            <img
              src={mockupUrl}
              alt={`${appName} design mockup`}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                transition: "transform 0.3s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "8px 12px",
                background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                fontSize: 10,
                color: "rgba(255,255,255,0.7)",
                textAlign: "center",
              }}
            >
              Click to expand
            </div>
          </div>
        </div>
      )}

      {/* Mockup Lightbox */}
      {mockupExpanded && mockupUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.9)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
          onClick={() => setMockupExpanded(false)}
        >
          <img
            src={mockupUrl}
            alt={`${appName} design mockup`}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              fontSize: 28,
              color: "white",
              cursor: "pointer",
              background: "rgba(255,255,255,0.1)",
              borderRadius: "50%",
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
            }}
          >
            ✕
          </div>
        </div>
      )}

      {/* Edit Mode */}
      {editMode && (
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tell me what to change... (e.g., 'Use blue instead of green', 'Add a settings screen')"
            style={{
              width: "100%",
              minHeight: 60,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(99,102,241,0.2)",
              background: "rgba(0,0,0,0.2)",
              color: "var(--foreground)",
              fontSize: 12,
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
            }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => { setEditMode(false); setFeedback(""); }}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "var(--muted-foreground)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (feedback.trim()) {
                  onEdit(feedback.trim());
                  setEditMode(false);
                  setFeedback("");
                }
              }}
              disabled={!feedback.trim()}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "none",
                background: feedback.trim() ? "linear-gradient(135deg, #6366F1, #8B5CF6)" : "rgba(255,255,255,0.05)",
                color: feedback.trim() ? "white" : "var(--muted-foreground)",
                fontSize: 11,
                fontWeight: 600,
                cursor: feedback.trim() ? "pointer" : "not-allowed",
              }}
            >
              Update Plan
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: 8,
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={onApprove}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 22px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #10B981, #059669)",
            color: "white",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(16,185,129,0.3)",
            transition: "all 0.2s ease",
            letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(16,185,129,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 14px rgba(16,185,129,0.3)";
          }}
        >
          <Check className="h-3.5 w-3.5" />
          Approve & Build
        </button>
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 18px",
            borderRadius: 10,
            border: "1px solid rgba(99,102,241,0.25)",
            background: "rgba(99,102,241,0.08)",
            color: "#A5B4FC",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(99,102,241,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(99,102,241,0.08)";
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 18px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            color: "var(--muted-foreground)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          New Plan
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 20px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          fontSize: 10,
          color: "var(--muted-foreground)",
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        Review the mockup. Continue to implementation, or request regeneration with feedback.
      </div>
    </div>
  );
}
