/**
 * Deployment-aware routing.
 *
 * Locally the app is served from `/`; on GitHub Pages it lives under
 * `/hanfani-sift/`. Hard-coded `href="/app"` links break in the second case, so
 * every internal link goes through `href()` and the router reads the current
 * route through `currentRoute()`.
 */

/** Deployment base, no trailing slash: "" locally, "/hanfani-sift" on Pages. */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Href for an internal route, correct under any deployment base. */
export function href(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${clean}`;
}

/** The current route with the deployment base stripped: "/", "/app", … */
export function currentRoute(): string {
  let p = window.location.pathname;
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  return p.replace(/\/+$/, "") || "/";
}

/**
 * True when this build has no Node backend behind it — the GitHub Pages build.
 * Everything that runs in the browser still works; anything that would call
 * `/api/*` has to say so instead of failing with a bare network error.
 */
export const isStaticBuild = import.meta.env.VITE_STATIC_BUILD === "1";

/** Where a visitor of the static build goes to run the real thing. */
export const REPO_URL = "https://github.com/fruitizz/hanfani-sift";

/**
 * Same-origin proxy for a remote document, used so the preview can frame files
 * whose CDN sets `X-Frame-Options`. With no backend there is no proxy: fall back
 * to the raw URL, which works for any host that allows cross-origin reads.
 */
export function proxied(url: string): string {
  return isStaticBuild ? url : `/api/proxy?url=${encodeURIComponent(url)}`;
}
