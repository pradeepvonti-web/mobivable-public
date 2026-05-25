import { createClient } from "@supabase/supabase-js";
import { BUILTIN_TEMPLATES } from "/dev-server/src/lib/templates.functions.ts";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
let inserted = 0, skipped = 0;
for (const tpl of BUILTIN_TEMPLATES) {
  const { data: existing } = await sb.from("app_templates").select("id").eq("name", tpl.name).maybeSingle();
  if (existing) { skipped++; continue; }
  const { error } = await sb.from("app_templates").insert({
    name: tpl.name, description: tpl.description, category: tpl.category,
    tags: tpl.tags, schema: tpl.schema, feature_list: tpl.feature_list,
    is_featured: tpl.is_featured, is_community: false, use_count: 0,
  });
  if (error) console.error("FAIL", tpl.name, error.message);
  else inserted++;
}
console.log(JSON.stringify({ inserted, skipped, total: BUILTIN_TEMPLATES.length }));
