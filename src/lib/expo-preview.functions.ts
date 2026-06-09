/**
 * Client-callable server functions for the live Expo-web preview.
 *
 * The agent normally flips the preview "Live" itself via the ws_start_preview
 * MCP tool at the end of a build. These let the studio UI (the device frame's
 * Restart button / initial load) read the persisted preview URL and force a
 * rebuild after manual edits.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensureExpoWebPreview,
  getExpoPreviewUrl,
  type WorkspaceCtx,
} from "./agent-workspace.server";

const Input = z.object({ projectId: z.string().uuid() });

/** Read the current Expo-web preview URL for a project (null if not started). */
export const getExpoPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      const url = await getExpoPreviewUrl(data.projectId, ctx);
      return { ok: true as const, url };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Re-export the Expo web bundle (pick up latest edits) and return the URL. */
export const refreshExpoPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    return ensureExpoWebPreview(data.projectId, ctx, { rebuild: true });
  });
