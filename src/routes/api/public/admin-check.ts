import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/admin-check')({
  server: {
    handlers: {
      GET: async () => {
        const out: Record<string, unknown> = {
          hasUrl: !!process.env.SUPABASE_URL,
          hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        };
        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const read = await supabaseAdmin.from('app_settings').select('key').limit(1);
          out.read = { ok: !read.error, error: read.error?.message, count: read.data?.length ?? 0 };

          const probeKey = `__admin_check_${Date.now()}`;
          const write = await supabaseAdmin
            .from('app_settings')
            .insert({ key: probeKey, value: { ok: true } as never });
          out.write = { ok: !write.error, error: write.error?.message };
          if (!write.error) {
            const del = await supabaseAdmin.from('app_settings').delete().eq('key', probeKey);
            out.cleanup = { ok: !del.error, error: del.error?.message };
          }
        } catch (e) {
          out.exception = e instanceof Error ? e.message : String(e);
        }
        return new Response(JSON.stringify(out, null, 2), {
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
