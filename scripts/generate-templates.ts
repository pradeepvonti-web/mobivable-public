/**
 * Template Vault batch generator — one-time AI spend that turns the archetype
 * taxonomy (src/lib/template-taxonomy.ts) into ready-to-use templates in the
 * `app_templates` table. Users then instantiate them with ZERO AI credits.
 *
 * Reuses the product's own generation pipeline (DESIGN_BRIEF → CODE_GEN →
 * parseAppSchema) so vault templates match the quality of agent-built apps.
 *
 * Idempotent: archetypes already in the table (matched by slug tag) are
 * skipped, so the script can be re-run to fill gaps or resume after a stop.
 *
 * Usage:
 *   npx tsx scripts/generate-templates.ts            # generate ALL missing
 *   npx tsx scripts/generate-templates.ts --limit 10 # first 10 missing only
 *   npx tsx scripts/generate-templates.ts --category finance
 *   npx tsx scripts/generate-templates.ts --dry-run  # list what would run
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or the local anon
 * fallback won't be able to insert — service role recommended), plus an AI
 * provider key (ANTHROPIC_API_KEY / LOVABLE_API_KEY / …).
 */
import { readFileSync } from "node:fs";

function loadEnv(file: string) {
  let txt: string;
  try {
    txt = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(".env");
loadEnv(".env.local");

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1]?.startsWith("--") ? "true" : (args[i + 1] ?? "true")) : undefined;
};
const LIMIT = flag("limit") ? parseInt(flag("limit")!, 10) : Infinity;
const CATEGORY = flag("category");
const DRY = args.includes("--dry-run");

async function main() {
  const { TEMPLATE_TAXONOMY, archetypePrompt } = await import("../src/lib/template-taxonomy");
  const { createClient } = await import("@supabase/supabase-js");
  const { callAIFast, callAIStrong } = await import("../src/lib/ai-provider");
  const { CODE_GEN_SYSTEM_PROMPT, DESIGN_BRIEF_SYSTEM_PROMPT, parseAppSchema } = await import("../src/lib/code-gen");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or publishable key) required.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Existing templates → skip (idempotency by slug stored in tags).
  const { data: existing, error: exErr } = await db.from("app_templates").select("tags");
  if (exErr) throw new Error(`Could not read app_templates: ${exErr.message}`);
  const have = new Set<string>();
  for (const row of existing ?? []) {
    for (const t of (row as { tags?: string[] }).tags ?? []) {
      if (t.startsWith("slug:")) have.add(t.slice(5));
    }
  }

  let todo = TEMPLATE_TAXONOMY.filter((a) => !have.has(a.slug));
  if (CATEGORY) todo = todo.filter((a) => a.category === CATEGORY);
  todo = todo.slice(0, LIMIT);

  console.log(`Vault: ${have.size} archetypes present, ${todo.length} to generate${DRY ? " (dry run)" : ""}.`);
  if (DRY) {
    for (const a of todo) console.log(`  - [${a.category}] ${a.slug} — ${a.name}`);
    return;
  }

  let okCount = 0;
  let failCount = 0;
  for (const [i, a] of todo.entries()) {
    const label = `[${i + 1}/${todo.length}] ${a.slug}`;
    try {
      const prompt = archetypePrompt(a);

      // 1. Design brief (fast tier) — same first step as the product.
      const brief = await callAIFast(DESIGN_BRIEF_SYSTEM_PROMPT, prompt);
      if (!brief.ok) throw new Error(`brief: ${brief.error}`);

      // 2. Schema generation (strong tier), enriched with the brief.
      const enriched = `${prompt}\n\nDesign brief (follow this):\n${brief.text.slice(0, 6000)}`;
      const gen = await callAIStrong(CODE_GEN_SYSTEM_PROMPT, enriched);
      if (!gen.ok) throw new Error(`codegen: ${gen.error}`);

      const schema = parseAppSchema(gen.text);
      if (!schema || !schema.screens?.length) throw new Error("parse: empty/invalid schema");

      const features = schema.screens.slice(0, 6).map((s: { title?: string; id?: string }) => s.title ?? s.id ?? "Screen");
      const { error: insErr } = await db.from("app_templates").insert({
        name: a.name,
        description: a.descriptor,
        category: a.category,
        tags: [...a.tags, `slug:${a.slug}`],
        schema,
        feature_list: features,
        is_featured: false,
        is_community: false,
        use_count: 0,
      });
      if (insErr) throw new Error(`insert: ${insErr.message}`);
      okCount++;
      console.log(`${label} ✓ (${schema.screens.length} screens)`);
    } catch (e) {
      failCount++;
      console.error(`${label} ✗ ${e instanceof Error ? e.message : String(e)}`);
    }
    // Gentle pacing — avoid provider rate limits on long runs.
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\nDone: ${okCount} generated, ${failCount} failed, ${have.size + okCount} total in vault.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
