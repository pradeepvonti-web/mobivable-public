import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function htmlRedirect(to: string, message: string) {
  const safe = to.replace(/"/g, "&quot;");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=${safe}"><title>GitHub Connected</title></head><body style="font-family:system-ui;padding:40px;text-align:center;background:#0a0a0f;color:#e5e7eb"><p>${message}</p><p><a style="color:#a78bfa" href="${safe}">Continue →</a></p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function htmlError(message: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>GitHub Error</title></head><body style="font-family:system-ui;padding:40px;text-align:center;background:#0a0a0f;color:#fca5a5"><h2>GitHub connection failed</h2><p>${message}</p></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errParam = url.searchParams.get("error");
        if (errParam) return htmlError(errParam);
        if (!code || !state) return htmlError("Missing code/state.");

        // Look up state
        const { data: row, error: stateErr } = await supabaseAdmin
          .from("oauth_states")
          .select("user_id, provider, redirect_to, expires_at")
          .eq("state", state)
          .maybeSingle();
        if (stateErr || !row) return htmlError("Invalid or expired state.");
        if (row.provider !== "github") return htmlError("Provider mismatch.");
        if (new Date(row.expires_at).getTime() < Date.now()) {
          return htmlError("State expired. Try connecting again.");
        }

        // Consume state
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);

        const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) return htmlError("GitHub OAuth not configured.");

        // Exchange code for token
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "easy-mobile-ai",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: `${url.origin}/api/public/github/callback`,
          }),
        });
        if (!tokenRes.ok) return htmlError(`Token exchange failed (${tokenRes.status}).`);
        const tokenJson = (await tokenRes.json()) as {
          access_token?: string;
          scope?: string;
          token_type?: string;
          error?: string;
          error_description?: string;
        };
        if (tokenJson.error || !tokenJson.access_token) {
          return htmlError(tokenJson.error_description || tokenJson.error || "No access_token returned.");
        }

        // Fetch user
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${tokenJson.access_token}`,
            "User-Agent": "easy-mobile-ai",
          },
        });
        if (!userRes.ok) return htmlError("Failed to load GitHub user.");
        const ghUser = (await userRes.json()) as { id: number; login: string };

        // Upsert connection
        const { error: upErr } = await supabaseAdmin.from("github_connections").upsert(
          {
            user_id: row.user_id,
            github_user_id: ghUser.id,
            github_username: ghUser.login,
            access_token: tokenJson.access_token,
            scopes: tokenJson.scope ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (upErr) return htmlError(upErr.message);

        const target = row.redirect_to && row.redirect_to.startsWith("/")
          ? `${url.origin}${row.redirect_to}`
          : `${url.origin}/dashboard`;
        return htmlRedirect(target, `Connected as @${ghUser.login}. Redirecting…`);
      },
    },
  },
});
