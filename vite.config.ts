import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.API_PORT ?? "8787";

/**
 * Where the build will be served from. "/" for the Node server; on GitHub Pages
 * a project site lives under /<repo>/, which every asset URL has to carry.
 */
const BASE = process.env.VITE_BASE ?? "/";

/** True for the backend-less GitHub Pages build (see src/lib/routes.ts). */
const STATIC_BUILD = process.env.VITE_STATIC_BUILD === "1";

/**
 * Two things the Node server does at runtime that a static host cannot, done
 * once at build time instead:
 *
 * - `404.html` — GitHub Pages has no SPA fallback, so a deep link like
 *   /app 404s. Pages serves 404.html for any unmatched path, and since the SPA
 *   routes on `location.pathname`, a copy of index.html there *is* the fallback.
 * - `api/openapi.json` — served by the Hono app in production. The docs page
 *   links to it, so the static build ships it as a real file.
 */
function staticHostFallbacks(): Plugin {
  return {
    name: "sift-static-host-fallbacks",
    apply: "build",
    async closeBundle() {
      if (!STATIC_BUILD) return;
      const dist = resolve(import.meta.dirname, "dist");
      copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
      const { openApiSpec } = await import("./server/openapi.ts");
      mkdirSync(resolve(dist, "api"), { recursive: true });
      writeFileSync(resolve(dist, "api/openapi.json"), JSON.stringify(openApiSpec, null, 2));
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [react(), staticHostFallbacks()],
  optimizeDeps: {
    // WASM bindings ship their own .wasm asset — prebundle the JS glue only.
    exclude: ["@firecrawl/pdf-inspector-wasm"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    port: 5173,
    proxy: {
      // Trailing slash so /api-docs (the SPA docs page) is not proxied to the API.
      "/api/": `http://localhost:${API_PORT}`,
    },
  },
});
