/**
 * useCollaboration — Figma-like real-time collaboration hook.
 *
 * Uses Supabase Realtime for:
 *   - Presence: track who's online (name, avatar, color)
 *   - Broadcast: send cursor positions & selections to peers
 *
 * Usage:
 *   const { collaborators, myColor, broadcastCursor, broadcastSelection, isConnected }
 *     = useCollaboration(projectId, session);
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────

export type CursorPosition = {
  x: number;
  y: number;
  /** Which area the cursor is in */
  area: "preview" | "chat" | "sidebar" | "editor";
};

export type CollaboratorSelection = {
  screenId?: string;
  elementId?: string;
  panelKey?: string;
};

export type Collaborator = {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  cursor?: CursorPosition;
  selection?: CollaboratorSelection;
  lastSeen: number;
  isActive: boolean;
};

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

// ─── Color Palette (12 distinct, Figma-inspired) ────────────────

const COLLAB_COLORS = [
  "#FF6B6B", // coral red
  "#4ECDC4", // teal
  "#45B7D1", // sky blue
  "#96E6A1", // mint green
  "#DDA0DD", // plum
  "#F7DC6F", // gold
  "#BB8FCE", // lavender
  "#F0B27A", // peach
  "#82E0AA", // emerald
  "#85C1E9", // powder blue
  "#F1948A", // salmon
  "#73C6B6", // jade
];

function assignColor(userId: string): string {
  // Deterministic color from user ID hash
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

// ─── Cursor throttle (66ms ≈ 15fps) ────────────────────────────

const CURSOR_THROTTLE_MS = 66;

// ─── Hook ───────────────────────────────────────────────────────

export function useCollaboration(
  projectId: string,
  session: Session | null,
) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastCursorBroadcast = useRef(0);
  const cursorsRef = useRef<Map<string, CursorPosition>>(new Map());
  const selectionsRef = useRef<Map<string, CollaboratorSelection>>(new Map());

  const userId = session?.user?.id;
  const userEmail = session?.user?.email ?? "";
  const userName =
    session?.user?.user_metadata?.full_name ??
    session?.user?.user_metadata?.name ??
    userEmail.split("@")[0] ??
    "Anonymous";
  const userAvatar =
    session?.user?.user_metadata?.avatar_url ??
    session?.user?.user_metadata?.picture;
  const myColor = userId ? assignColor(userId) : COLLAB_COLORS[0];

  useEffect(() => {
    if (!userId || !projectId) return;
    if (typeof window === "undefined") return;

    const channelName = `collab:${projectId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    // ── Presence ──────────────────────────────────────────────
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{
        userId: string;
        name: string;
        email: string;
        avatar?: string;
        color: string;
      }>();

      const collabs: Collaborator[] = [];
      for (const [key, presences] of Object.entries(state)) {
        if (key === userId) continue; // Skip self
        const p = presences[0];
        if (!p) continue;
        collabs.push({
          userId: p.userId,
          name: p.name,
          email: p.email,
          avatar: p.avatar,
          color: p.color,
          cursor: cursorsRef.current.get(p.userId),
          selection: selectionsRef.current.get(p.userId),
          lastSeen: Date.now(),
          isActive: true,
        });
      }
      setCollaborators(collabs);
    });

    // ── Broadcast: cursor ─────────────────────────────────────
    channel.on("broadcast", { event: "cursor" }, (payload) => {
      const data = payload.payload as {
        userId: string;
        cursor: CursorPosition;
      };
      if (data.userId === userId) return;

      cursorsRef.current.set(data.userId, data.cursor);

      setCollaborators((prev) =>
        prev.map((c) =>
          c.userId === data.userId
            ? { ...c, cursor: data.cursor, lastSeen: Date.now(), isActive: true }
            : c,
        ),
      );
    });

    // ── Broadcast: selection ──────────────────────────────────
    channel.on("broadcast", { event: "selection" }, (payload) => {
      const data = payload.payload as {
        userId: string;
        selection: CollaboratorSelection;
      };
      if (data.userId === userId) return;

      selectionsRef.current.set(data.userId, data.selection);

      setCollaborators((prev) =>
        prev.map((c) =>
          c.userId === data.userId
            ? { ...c, selection: data.selection, lastSeen: Date.now(), isActive: true }
            : c,
        ),
      );
    });

    // ── Subscribe & track presence ────────────────────────────
    channel.subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        setStatus("connected");
        await channel.track({
          userId,
          name: userName,
          email: userEmail,
          avatar: userAvatar,
          color: myColor,
        });
      } else if (s === "CHANNEL_ERROR") {
        setStatus("reconnecting");
      } else if (s === "CLOSED") {
        setStatus("disconnected");
      }
    });

    // ── Inactive detection (mark users inactive after 30s) ────
    const inactiveInterval = window.setInterval(() => {
      const threshold = Date.now() - 30_000;
      setCollaborators((prev) =>
        prev.map((c) =>
          c.lastSeen < threshold ? { ...c, isActive: false } : c,
        ),
      );
    }, 10_000);

    return () => {
      window.clearInterval(inactiveInterval);
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setStatus("disconnected");
      setCollaborators([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId]);

  // ── Broadcast cursor (throttled) ────────────────────────────

  const broadcastCursor = useCallback(
    (cursor: CursorPosition) => {
      const now = Date.now();
      if (now - lastCursorBroadcast.current < CURSOR_THROTTLE_MS) return;
      lastCursorBroadcast.current = now;

      channelRef.current?.send({
        type: "broadcast",
        event: "cursor",
        payload: { userId, cursor },
      });
    },
    [userId],
  );

  // ── Broadcast selection ─────────────────────────────────────

  const broadcastSelection = useCallback(
    (selection: CollaboratorSelection) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "selection",
        payload: { userId, selection },
      });
    },
    [userId],
  );

  return {
    /** Other users currently in this project */
    collaborators,
    /** My assigned collaboration color */
    myColor,
    /** Broadcast my cursor position (throttled to ~15fps) */
    broadcastCursor,
    /** Broadcast my current selection (screen/element) */
    broadcastSelection,
    /** Connection status */
    isConnected: status === "connected",
    /** Detailed connection status */
    connectionStatus: status,
    /** Total count of online collaborators (excluding self) */
    onlineCount: collaborators.filter((c) => c.isActive).length,
  };
}
