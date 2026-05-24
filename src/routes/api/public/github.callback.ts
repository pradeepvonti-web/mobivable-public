import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlResult({
  ok,
  message,
  username,
}: {
  ok: boolean;
  message: string;
  username?: string;
}) {
  const safeMessage = escapeHtml(message);
  const title = ok ? "GitHub Connected" : "GitHub Error";
  const heading = ok ? "GitHub connected" : "GitHub connection failed";
  const color = ok ? "#e5e7eb" : "#fca5a5";
  const payload = JSON.stringify({
    source: "mobivable:github-oauth",
    ok,
    username,
    error: ok ? null : message,
  });

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;padding:40px;text-align:center;background:#0a0a0f;color:${color}"><h2>${heading}</h2><p>${safeMessage}</p><p id="hint">You can close this window and return to the app.</p><script>const payload=${payload};try{if(window.opener&&!window.opener.closed){window.opener.postMessage(payload,"*");window.close();}}catch{}</script></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function htmlError(message: string) {
  return htmlResult({ ok: false, message });
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

        return htmlResult({
          ok: true,
          username: ghUser.login,
          message: `Connected as @${ghUser.login}. You can return to the app now.`,
        });
      },
    },
  },
});
