import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { runExtraction, ExtractError } from "./extract.ts";
import { FETCH_MAX_BYTES, isBlockedHost } from "./net.ts";
import { openApiSpec } from "./openapi.ts";
import { buildPublicExtractRequest } from "./public-extract.ts";
import type { ExtractRequest } from "../shared/types.ts";

// Load .env into process.env — tsx / node don't do this automatically, so
// without it ANTHROPIC_API_KEY (and API_PORT) sit in the file but never reach
// the process. Best-effort: absent .env (e.g. some prod setups) is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env present — rely on the ambient environment
}

const app = new Hono();
// PORT is what every PaaS injects (Fly, Render, Railway, Cloud Run); API_PORT
// is the local convention from .env.example. Honour both, PaaS first.
const PORT = Number(process.env.PORT) || Number(process.env.API_PORT) || 8787;
const isProd = process.env.NODE_ENV === "production";

// Gzip every text response (SPA bundle, CSS, JSON) — the "enable text
// compression" Lighthouse win and a real transfer-size cut over the wire.
app.use("*", compress());

// Public API is callable from other origins (docs samples, scripts, integrations).
app.use("/api/v1/*", cors({ origin: "*", allowMethods: ["GET", "OPTIONS"] }));

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/openapi.json", (c) => c.json(openApiSpec));

/**
 * Public extract: URL-only. Reuses runExtraction with auto schema / default model.
 * Does not change the SPA's richer POST /api/extract contract.
 */
app.get("/api/v1/extract", async (c) => {
  try {
    const req = buildPublicExtractRequest({
      url: c.req.query("url"),
      model: c.req.query("model"),
      max_tokens: c.req.query("max_tokens"),
      maxTokens: c.req.query("maxTokens"),
    });
    const result = await runExtraction(req);
    return c.json(result);
  } catch (e) {
    if (e instanceof ExtractError) return c.json({ error: e.message }, e.status as 400);
    const msg = e instanceof Error ? e.message : "Unexpected server error";
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/extract", async (c) => {
  let body: ExtractRequest;
  try {
    body = await c.req.json<ExtractRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  try {
    const result = await runExtraction(body);
    return c.json(result);
  } catch (e) {
    if (e instanceof ExtractError) return c.json({ error: e.message }, e.status as 400);
    const msg = e instanceof Error ? e.message : "Unexpected server error";
    return c.json({ error: msg }, 500);
  }
});

// Preview proxy: some CDNs send `X-Frame-Options: SAMEORIGIN` (or no CORS
// headers), which stops the browser from displaying their file inside the SPA's
// <embed>/<img>. We fetch it server-side and re-serve it same-origin, dropping
// those framing headers so the preview can render. Extraction never needs this —
// the backend already fetches the URL directly.
app.get("/api/proxy", async (c) => {
  const raw = c.req.query("url");
  if (!raw) return c.json({ error: "Missing url" }, 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return c.json({ error: "Invalid url" }, 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return c.json({ error: "Only http/https URLs are allowed" }, 400);
  }
  if (isBlockedHost(target.hostname)) {
    return c.json({ error: "This host is not allowed" }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": "Sift/0.1 (+preview-proxy)" },
    });
  } catch {
    return c.json({ error: "Could not reach the URL" }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    return c.json({ error: `Upstream responded ${upstream.status}` }, 502);
  }
  const declaredLen = Number(upstream.headers.get("content-length") ?? "0");
  if (declaredLen && declaredLen > FETCH_MAX_BYTES) {
    return c.json({ error: "File too large to preview" }, 413);
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=300");
  // Deliberately NOT forwarding X-Frame-Options / Content-Security-Policy so the
  // SPA can frame the response same-origin.
  return new Response(upstream.body, { status: 200, headers });
});

// In production, serve the built SPA from ./dist.
if (isProd) {
  // Content-hashed build assets are safe to cache forever ("efficient cache
  // policy" audit); index.html stays uncached so new builds are picked up.
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("/*", serveStatic({ path: "./dist/index.html" }));
}

// 0.0.0.0 explicitly: inside a container, binding localhost makes the service
// unreachable from the host and every health check fails.
serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`Sift API listening on port ${info.port}`);
});
