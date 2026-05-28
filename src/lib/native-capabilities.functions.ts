/**
 * Server fn for reading a project's native_capabilities array. The MCP
 * tools already do this via admin client; this fn is the user-session
 * path (RLS-scoped) the studio UI calls.
 *
 * Listing only — adding / removing capabilities goes through MCP tools
 * so the agent and external clients use one path. v2 could expose an
 * `upsertProjectNativeCapability` server fn for in-UI editing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NativeCapabilityRow } from "./native-capabilities";

export const listProjectNativeCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // The native_capabilities column is brand-new and the generated
    // Database types don't include it yet — loose cast on the read.
    const sbLoose = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: row, error } = (await sbLoose
      .from("projects")
      .select("native_capabilities, user_id")
      .eq("id", data.projectId)
      .maybeSingle()) as {
      data:
        | { native_capabilities: NativeCapabilityRow[] | null; user_id: string }
        | null;
      error: { message: string } | null;
    };
    if (error) return { ok: false as const, error: error.message };
    if (!row || row.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }
    return {
      ok: true as const,
      capabilities: (row.native_capabilities ?? []) as NativeCapabilityRow[],
    };
  });
