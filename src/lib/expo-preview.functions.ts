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
  ensureExpoPreviewLive,
  getExpoPreviewUrl,
  probePreviewServing,
  startExpoGoServer,
  getExpoTunnelUrl,
  triggerEasBuild,
  getEasBuildStatus,
  triggerEasSubmit,
  getEasSubmitStatus,
  isEasConfigured,
  type WorkspaceCtx,
} from "./agent-workspace.server";

const Input = z.object({ projectId: z.string().uuid() });
const EasInput = z.object({
  projectId: z.string().uuid(),
  platform: z.enum(["android", "ios", "all"]).optional(),
  profile: z.enum(["development", "preview", "production"]).optional(),
});

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

/**
 * Auto-recovery: probe the live preview; if the sandbox expired or the port
 * isn't serving, re-provision + rebuild automatically (no manual Restart).
 * Returns status "live" | "building" | "error".
 */
export const ensurePreviewLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await ensureExpoPreviewLive(data.projectId, ctx);
    } catch (e) {
      return { ok: false as const, status: "error" as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Lightweight liveness check for polling while a rebuild comes up. */
export const checkPreviewServing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      const url = await getExpoPreviewUrl(data.projectId, ctx);
      return { ok: true as const, url, serving: await probePreviewServing(url) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Start the Metro dev server and return an Expo Go connection URL (encode as a
 * QR) so the app can be opened on a real phone — exercising camera, location,
 * notifications, and true native behaviour the web preview can't.
 */
export const startExpoGo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await startExpoGoServer(data.projectId, ctx);
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Poll for the Expo Go tunnel URL after startExpoGo. Returns { ready, url }
 * once the *.exp.direct tunnel is up (the client polls until ready).
 */
export const getExpoGoTunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await getExpoTunnelUrl(data.projectId, ctx);
    } catch (e) {
      return { ok: false as const, url: null, ready: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Kick off an EAS cloud build (real native IPA/APK/AAB). Gated on EXPO_TOKEN;
 * returns ok:false with guidance when not configured.
 */
export const startEasBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EasInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await triggerEasBuild(data.projectId, ctx, { platform: data.platform, profile: data.profile });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Whether native EAS builds are available (EXPO_TOKEN set) — for UI gating. */
export const easAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ ok: true as const, available: isEasConfigured() }));

/** Poll an EAS build started by startEasBuild — returns the build URL once queued. */
export const easBuildStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid(), jobId: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await getEasBuildStatus(data.projectId, ctx, data.jobId);
    } catch (e) {
      return { ok: false as const, ready: false, buildUrl: null, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Submit the latest EAS build of a platform to its store (eas submit --latest). */
export const startEasSubmit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid(), platform: z.enum(["android", "ios"]).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await triggerEasSubmit(data.projectId, ctx, { platform: data.platform });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Poll an EAS submission started by startEasSubmit. */
export const easSubmitStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid(), jobId: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx: WorkspaceCtx = { userId: context.userId, supabase: context.supabase };
    try {
      return await getEasSubmitStatus(data.projectId, ctx, data.jobId);
    } catch (e) {
      return { ok: false as const, ready: false, done: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
