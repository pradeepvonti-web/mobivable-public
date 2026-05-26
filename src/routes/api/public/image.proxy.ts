import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/image-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const target = requestUrl.searchParams.get("url");

        if (!target) {
          return new Response("Missing url", { status: 400 });
        }

        let remoteUrl: URL;
        try {
          remoteUrl = new URL(target);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }

        if (!/^https?:$/.test(remoteUrl.protocol)) {
          return new Response("Unsupported url", { status: 400 });
        }

        const upstream = await fetch(remoteUrl.toString(), {
          headers: {
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
        });

        if (!upstream.ok) {
          return new Response(`Upstream image failed (${upstream.status})`, { status: 502 });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
            "cache-control": upstream.headers.get("cache-control") ?? "public, max-age=3600",
          },
        });
      },
    },
  },
});