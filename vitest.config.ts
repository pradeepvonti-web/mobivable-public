import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone Vitest config — independent of the app's TanStack/Cloudflare
// vite config. Vitest's built-in esbuild handles JSX via the automatic runtime.
export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
