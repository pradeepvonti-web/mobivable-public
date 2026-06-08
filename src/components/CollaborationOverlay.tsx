/**
 * CollaborationOverlay — Figma-like visual collaboration layer.
 *
 * Renders:
 *   1. Presence avatar bar (top-right cluster)
 *   2. Live cursors (colored SVG arrows + name labels)
 *   3. Selection indicators (colored borders on elements others are editing)
 */

import { useState, useMemo } from "react";
import { Users, Wifi, WifiOff, Circle } from "lucide-react";
import type { Collaborator, ConnectionStatus } from "@/hooks/use-collaboration";

// ─── Cursor Arrow SVG ───────────────────────────────────────────

function CursorArrow({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="20"
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
    >
      <path
        d="M1 1L15 10L8.5 11.5L5.5 19L1 1Z"
        fill={color}
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Live Cursor Component ──────────────────────────────────────

function LiveCursor({
  collaborator,
  containerBounds,
}: {
  collaborator: Collaborator;
  containerBounds: DOMRect | null;
}) {
  const { cursor, name, color } = collaborator;
  if (!cursor || !containerBounds) return null;

  // Convert relative cursor position to absolute within container
  const x = cursor.x;
  const y = cursor.y;

  // Only show if within reasonable bounds
  if (x < 0 || y < 0 || x > containerBounds.width || y > containerBounds.height) return null;

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: containerBounds.left + x,
        top: containerBounds.top + y,
        transition: "left 80ms linear, top 80ms linear",
      }}
    >
      <CursorArrow color={color} />
      {/* Name label */}
      <div
        className="absolute left-4 top-4 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] font-medium text-white shadow-lg"
        style={{ backgroundColor: color }}
      >
        {name}
      </div>
    </div>
  );
}

// ─── Presence Avatar ────────────────────────────────────────────

function PresenceAvatar({
  collaborator,
  size = "md",
}: {
  collaborator: Collaborator;
  size?: "sm" | "md";
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const sz = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const txtSz = size === "sm" ? "text-[8px]" : "text-[9px]";
  const initial = collaborator.name.charAt(0).toUpperCase();

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`${sz} rounded-full grid place-items-center text-white font-semibold ${txtSz} ring-2 ring-background shadow-sm relative overflow-hidden`}
        style={{ backgroundColor: collaborator.color }}
      >
        {collaborator.avatar ? (
          <img
            src={collaborator.avatar}
            alt={collaborator.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          initial
        )}
        {/* Active pulse */}
        {collaborator.isActive && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background"
            style={{ backgroundColor: "#22c55e" }}
          />
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100]">
          <div className="rounded-lg bg-popover border border-border shadow-xl px-3 py-2 whitespace-nowrap">
            <p className="text-xs font-medium text-foreground">{collaborator.name}</p>
            <p className="text-[9px] text-muted-foreground">{collaborator.email}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: collaborator.isActive ? "#22c55e" : "#6b7280" }}
              />
              <span className="text-[8px] text-muted-foreground">
                {collaborator.isActive ? "Active now" : "Away"}
              </span>
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-popover border-l border-t border-border" />
        </div>
      )}
    </div>
  );
}

// ─── Selection Indicator ────────────────────────────────────────

export function SelectionIndicator({
  collaborator,
  elementRect,
}: {
  collaborator: Collaborator;
  elementRect: DOMRect;
}) {
  return (
    <div
      className="pointer-events-none fixed z-[9990]"
      style={{
        left: elementRect.left - 2,
        top: elementRect.top - 2,
        width: elementRect.width + 4,
        height: elementRect.height + 4,
        border: `2px solid ${collaborator.color}`,
        borderRadius: 8,
        transition: "all 150ms ease",
      }}
    >
      {/* User label on the selection border */}
      <div
        className="absolute -top-5 left-1 rounded px-1.5 py-0.5 text-[8px] font-medium text-white whitespace-nowrap"
        style={{ backgroundColor: collaborator.color }}
      >
        {collaborator.name}
      </div>
    </div>
  );
}

// ─── Presence Bar ───────────────────────────────────────────────

export function PresenceBar({
  collaborators,
  connectionStatus,
  onlineCount,
}: {
  collaborators: Collaborator[];
  connectionStatus: ConnectionStatus;
  onlineCount: number;
}) {
  const MAX_VISIBLE = 5;
  const visible = collaborators.slice(0, MAX_VISIBLE);
  const overflow = collaborators.length - MAX_VISIBLE;

  if (collaborators.length === 0 && connectionStatus === "connected") {
    return null; // Don't show when alone
  }

  return (
    <div className="flex items-center gap-2">
      {/* Connection status dot */}
      <div className="flex items-center gap-1.5">
        {connectionStatus === "connected" ? (
          <Wifi className="h-3 w-3 text-emerald-400" />
        ) : connectionStatus === "reconnecting" ? (
          <Wifi className="h-3 w-3 text-amber-400 animate-pulse" />
        ) : (
          <WifiOff className="h-3 w-3 text-muted-foreground/40" />
        )}
      </div>

      {/* Avatar stack */}
      {visible.length > 0 && (
        <div className="flex items-center -space-x-2">
          {visible.map((c) => (
            <PresenceAvatar key={c.userId} collaborator={c} size="sm" />
          ))}
          {overflow > 0 && (
            <div className="h-6 w-6 rounded-full bg-muted/60 border-2 border-background grid place-items-center text-[8px] font-semibold text-muted-foreground">
              +{overflow}
            </div>
          )}
        </div>
      )}

      {/* Online count */}
      {onlineCount > 0 && (
        <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
          {onlineCount + 1} online
        </span>
      )}
    </div>
  );
}

// ─── Live Cursors Layer ─────────────────────────────────────────

export function LiveCursorsLayer({
  collaborators,
  containerRef,
}: {
  collaborators: Collaborator[];
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const bounds = useMemo(() => {
    if (!containerRef.current) return null;
    return containerRef.current.getBoundingClientRect();
    // We intentionally recalculate on each render for accuracy
  }, [containerRef, collaborators]);

  const withCursors = collaborators.filter((c) => c.cursor && c.isActive);

  if (withCursors.length === 0) return null;

  return (
    <>
      {withCursors.map((c) => (
        <LiveCursor
          key={c.userId}
          collaborator={c}
          containerBounds={bounds}
        />
      ))}
    </>
  );
}

// ─── Full Overlay (convenience wrapper) ─────────────────────────

export function CollaborationOverlay({
  collaborators,
  connectionStatus,
  onlineCount,
  containerRef,
}: {
  collaborators: Collaborator[];
  connectionStatus: ConnectionStatus;
  onlineCount: number;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <>
      {/* Live cursors rendered as a fixed overlay */}
      <LiveCursorsLayer collaborators={collaborators} containerRef={containerRef} />
    </>
  );
}
