// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin, ViteDevServer } from "vite";

// Restart the dev server when package.json or the lockfile changes so newly
// installed packages are picked up without a manual restart (which otherwise
// surfaces as a "Cannot find module" blank screen).
function restartOnDepsChange(): Plugin {
  return {
    name: "lovable:restart-on-deps-change",
    configureServer(server: ViteDevServer) {
      const watched = ["package.json", "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml"];
      server.watcher.add(watched);
      server.watcher.on("change", (file) => {
        if (watched.some((w) => file.endsWith(w))) {
          server.config.logger.info(
            `\n[lovable] ${file.split("/").pop()} changed — restarting dev server to pick up new packages...\n`,
          );
          server.restart();
        }
      });
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [restartOnDepsChange()],
  },
});
