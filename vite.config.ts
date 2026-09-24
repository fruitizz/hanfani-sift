import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
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
