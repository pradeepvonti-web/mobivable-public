import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─── Helpers ────────────────────────────────────────────────────────

function countScreens(schema: unknown): number {
  if (!schema || typeof schema !== "object") return 0;
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.screens)) return s.screens.length;
  return 0;
}

function countElements(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  let count = 0;
  if (Array.isArray(node)) {
    for (const child of node) count += countElements(child);
    return count;
  }
  const obj = node as Record<string, unknown>;
  // Each node with a "type" is an element
  if (obj.type) count = 1;
  if (Array.isArray(obj.children)) {
    for (const child of obj.children) count += countElements(child);
  }
  if (Array.isArray(obj.screens)) {
    for (const screen of obj.screens) count += countElements(screen);
  }
  if (Array.isArray(obj.elements)) {
    for (const el of obj.elements) count += countElements(el);
  }
  return count;
}

// ─── createSnapshot ─────────────────────────────────────────────────

const CreateSnapshotInput = z.object({
  projectId: z.string().uuid(),
  label: z.string().max(200).optional(),
  source: z.enum(["auto", "manual"]).optional(),
});

export const createSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSnapshotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Read current project result + visual_edits
    const { data: project, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("result, visual_edits, user_id")
      .eq("id", data.projectId)
      .single();

    if (projErr || !project) {
      return { ok: false as const, error: projErr?.message ?? "Project not found" };
    }
    if (project.user_id !== userId) {
      return { ok: false as const, error: "Forbidden" };
    }
    if (!project.result) {
      return { ok: false as const, error: "No schema to snapshot" };
    }

    // Parse result into a JSON schema for storage
    let schemaJson: unknown;
    try {
      schemaJson = JSON.parse(project.result);
    } catch {
      // result is raw text, store as-is in a wrapper
      schemaJson = { raw: project.result };
    }

    const label = data.label?.trim() || "Auto-save";
    const source = data.source ?? "manual";

    const { data: snapshot, error: insertErr } = await supabaseAdmin
      .from("project_snapshots")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        label,
        schema: schemaJson as never,
        visual_edits: project.visual_edits ?? null,
        source,
        element_count: countElements(schemaJson),
        screen_count: countScreens(schemaJson),
      })
      .select("id, label, source, element_count, screen_count, created_at")
      .single();

    if (insertErr) {
      return { ok: false as const, error: insertErr.message };
    }

    return { ok: true as const, snapshot };
  });

// ─── listSnapshots ──────────────────────────────────────────────────

const ListSnapshotsInput = z.object({
  projectId: z.string().uuid(),
});

export const listSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSnapshotsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: snapshots, error } = await supabaseAdmin
      .from("project_snapshots")
      .select("id, label, source, element_count, screen_count, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return { ok: false as const, error: error.message };
    }

    return { ok: true as const, snapshots: snapshots ?? [] };
  });

// ─── getSnapshot ────────────────────────────────────────────────────

const GetSnapshotInput = z.object({
  snapshotId: z.string().uuid(),
});

export const getSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetSnapshotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: snapshot, error } = await supabaseAdmin
      .from("project_snapshots")
      .select("*")
      .eq("id", data.snapshotId)
      .eq("user_id", userId)
      .single();

    if (error || !snapshot) {
      return { ok: false as const, error: error?.message ?? "Snapshot not found" };
    }

    return { ok: true as const, snapshot };
  });

// ─── restoreSnapshot ────────────────────────────────────────────────

const RestoreSnapshotInput = z.object({
  projectId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});

export const restoreSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RestoreSnapshotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Fetch the snapshot to restore
    const { data: snapshot, error: snapErr } = await supabaseAdmin
      .from("project_snapshots")
      .select("schema, visual_edits")
      .eq("id", data.snapshotId)
      .eq("user_id", userId)
      .single();

    if (snapErr || !snapshot) {
      return { ok: false as const, error: snapErr?.message ?? "Snapshot not found" };
    }

    // Read current project state to create a "Before restore" snapshot
    const { data: project, error: projErr } = await supabaseAdmin
      .from("projects")
      .select("result, visual_edits, user_id")
      .eq("id", data.projectId)
      .single();

    if (projErr || !project) {
      return { ok: false as const, error: projErr?.message ?? "Project not found" };
    }
    if (project.user_id !== userId) {
      return { ok: false as const, error: "Forbidden" };
    }

    // Create "Before restore" snapshot of current state
    if (project.result) {
      let currentSchema: unknown;
      try {
        currentSchema = JSON.parse(project.result);
      } catch {
        currentSchema = { raw: project.result };
      }

      await supabaseAdmin.from("project_snapshots").insert({
        project_id: data.projectId,
        user_id: userId,
        label: "Before restore",
        schema: currentSchema,
        visual_edits: project.visual_edits ?? null,
        source: "auto",
        element_count: countElements(currentSchema),
        screen_count: countScreens(currentSchema),
      });
    }

    // Restore: write snapshot schema + visual_edits back to the project
    const restoredResult =
      typeof snapshot.schema === "object" && snapshot.schema !== null && "raw" in (snapshot.schema as Record<string, unknown>)
        ? String((snapshot.schema as Record<string, unknown>).raw)
        : JSON.stringify(snapshot.schema);

    const { error: updateErr } = await supabaseAdmin
      .from("projects")
      .update({
        result: restoredResult,
        visual_edits: snapshot.visual_edits ?? null,
      })
      .eq("id", data.projectId);

    if (updateErr) {
      return { ok: false as const, error: updateErr.message };
    }

    return { ok: true as const };
  });

// ─── deleteSnapshot ─────────────────────────────────────────────────

const DeleteSnapshotInput = z.object({
  snapshotId: z.string().uuid(),
});

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSnapshotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { error } = await supabaseAdmin
      .from("project_snapshots")
      .delete()
      .eq("id", data.snapshotId)
      .eq("user_id", userId);

    if (error) {
      return { ok: false as const, error: error.message };
    }

    return { ok: true as const };
  });
