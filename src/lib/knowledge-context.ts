/**
 * Loads the signed-in user's saved knowledge items (PRDs, design notes,
 * pasted spec content, and ingested URL transcripts) and formats them as a
 * single markdown block suitable for prepending to an AI system prompt.
 *
 * This is the bridge that finally makes the Knowledge panel actually feed
 * into generation — until now, knowledge_items was written by two UI panels
 * but never read by any server function.
 *
 * Caps are deliberately conservative:
 *   - Up to 6 items (most-recently-updated first).
 *   - Up to ~8 000 characters total, hard-truncated with a "[…]" marker on
 *     the boundary item. The 8 KB ceiling is a sensible default across all
 *     supported AI models (well under any sensible context window) and
 *     leaves room for the actual user prompt + agent system messages.
 *
 * If the user has nothing saved, returns null so callers can skip the
 * injection cleanly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ITEMS = 6;
const MAX_TOTAL_CHARS = 8000;
const TRUNCATED_MARKER = "\n…[truncated]";

interface KnowledgeRow {
  id: string;
  title: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  updated_at: string;
}

export async function loadKnowledgeForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("knowledge_items")
    .select("id, title, content, file_url, file_name, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_ITEMS);
  if (error || !data || data.length === 0) return null;

  const rows = data as KnowledgeRow[];
  const blocks: string[] = [];
  let remaining = MAX_TOTAL_CHARS;

  for (const r of rows) {
    if (remaining <= 200) break; // not worth squeezing a tiny tail block in
    const header = `### ${r.title.trim() || "Untitled"}`;
    const attached =
      r.file_url && r.file_name
        ? `\n_Attached file:_ ${r.file_name} (${r.file_url})`
        : "";
    const body = (r.content ?? "").trim();
    let block = `${header}${attached}${body ? "\n\n" + body : ""}`;
    if (block.length > remaining) {
      block = block.slice(0, Math.max(0, remaining - TRUNCATED_MARKER.length)) + TRUNCATED_MARKER;
    }
    blocks.push(block);
    remaining -= block.length;
  }

  if (blocks.length === 0) return null;
  return [
    "User-provided context (knowledge base — PRDs, design notes, ingested URLs):",
    blocks.join("\n\n---\n\n"),
  ].join("\n\n");
}
