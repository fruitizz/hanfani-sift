/**
 * Nav and footer shared by the marketing pages (Landing, Solutions).
 *
 * They used to be copy-pasted into the landing page alone. A second marketing
 * page would have made a second copy, and the next link added to the nav would
 * have landed in one of them — hence one component, two callers.
 */

import { href } from "../lib/routes.ts";

export type Theme = "light" | "dark";

/** Marketing routes shown in the nav; "features" is an anchor on the landing. */
export type SiteSection = "features" | "solutions" | "pricing" | "api-docs" | null;

export function SiteNav({
  theme,
  onToggleTheme,
  active = null,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  active?: SiteSection;
}) {
  return (
    <header className="lp-nav">
      <a className="lp-brand" href={href("/")}>
        <div className="logo">
          <svg viewBox="0 0 64 64" width="18" height="18" aria-hidden="true">
            <circle cx="23" cy="16" r="2.6" fill="#fafaf7" />
            <circle cx="32" cy="14.5" r="2.6" fill="#fafaf7" />
            <circle cx="41" cy="16" r="2.6" fill="#fafaf7" />
            <path fill="#fafaf7" d="M16 22H48L37 37V47L27 47V37Z" />
          </svg>
        </div>
        <span>Sift</span>
      </a>
      <nav className="lp-nav-links">
        <a href={href("/#features")}>Features</a>
        <a
          className={active === "solutions" ? "on" : undefined}
          aria-current={active === "solutions" ? "page" : undefined}
          href={href("/solutions")}
        >
          Solutions
        </a>
        <a
          className={active === "pricing" ? "on" : undefined}
          aria-current={active === "pricing" ? "page" : undefined}
          href={href("/pricing")}
        >
          Pricing
        </a>
        <a href={href("/api-docs")}>API Doc</a>
        <button
          className="themebtn"
          type="button"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
          aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <a className="lp-btn lp-btn-sm" href={href("/app")}>
          Open app
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-foot">
      <div className="lp-foot-row">
        <span>Sift</span>
        <span className="lp-foot-sep" />
        <a href={href("/app")}>App</a>
        <a href={href("/solutions")}>Solutions</a>
        <a href={href("/api-docs")}>API</a>
        <a href={href("/pricing")}>Pricing</a>
      </div>
      <p className="lp-copy site-copy">
        © {new Date().getFullYear()} Sift. Built with 💜 by the{" "}
        <a href="https://github.com/fruitizz" target="_blank" rel="noopener noreferrer">
          Hanfani ecosystem
        </a>
        .
      </p>
    </footer>
  );
}
