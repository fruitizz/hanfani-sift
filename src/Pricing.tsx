import { useEffect, useState } from "react";
import { href } from "./lib/routes.ts";
import { annualTotal, perMonth } from "./lib/pricing.ts";

interface Plan {
  id: string;
  name: string;
  blurb: string;
  /** Monthly price in USD, or null for custom. */
  monthly: number | null;
  features: string[];
  cta: string;
  ctaHref: string;
  featured?: boolean;
  /** Ribbon above the card, when there is something worth saying. */
  badge?: string;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "Open source · self-host",
    monthly: 0,
    featured: true,
    badge: "Start here",
    features: [
      "Full Sift app & public API",
      "Local PDF classify + Markdown",
      "BYOK for any supported provider",
      "Cited fields, Locate, JSON export",
      "No signup, no account",
    ],
    cta: "Open the app",
    ctaHref: "/app",
  },
  {
    id: "custom",
    name: "Custom",
    blurb: "Volume, on-prem, or dedicated",
    monthly: null,
    features: [
      "Everything in Free",
      "Custom volume & SLAs",
      "On-prem / VPC options",
      "SSO & audit logs",
      "A solution engineer",
    ],
    cta: "Contact us",
    ctaHref: "mailto:hello@hanfani.dev",
  },
];

export function Pricing() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("sift-theme") === "dark"
      ? "dark"
      : "light",
  );
  const [annual, setAnnual] = useState(true);
  // The billing period only means something once a plan actually has a monthly price.
  const hasPaidPlan = PLANS.some((plan) => (plan.monthly ?? 0) > 0);

  useEffect(() => {
    document.title = "Sift Pricing";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sift-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div className="docs-shell">
      <header className="docs-topbar">
        <a className="docs-brand" href={href("/")}>
          <div className="logo">
            <svg viewBox="0 0 64 64" width="18" height="18" aria-hidden="true">
              <circle cx="23" cy="16" r="2.6" fill="#fafaf7" />
              <circle cx="32" cy="14.5" r="2.6" fill="#fafaf7" />
              <circle cx="41" cy="16" r="2.6" fill="#fafaf7" />
              <path fill="#fafaf7" d="M16 22H48L37 37V47L27 47V37Z" />
            </svg>
          </div>
          <span className="docs-brand-name">Sift</span>
          <span className="docs-brand-sep" />
          <span className="docs-brand-sub">Pricing</span>
        </a>
        <div className="docs-top-actions">
          <a className="docs-link" href={href("/api-docs")}>
            API Doc
          </a>
          <a className="docs-link" href={href("/app")}>
            App
          </a>
          <button
            className="themebtn"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => setTheme((th) => (th === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <div className="pricing-wrap">
        <div className="pricing-hero">
          <p className="pricing-eyebrow">Pricing</p>
          <h1>Simple plans</h1>
          <p>
            Start free and self-host — <strong>bring your own keys</strong>, no account. Talk to us
            when you need volume, on-prem, or SSO.
          </p>

          {hasPaidPlan && (
            <div className="billing-toggle" role="group" aria-label="Billing period">
              <button type="button" className={annual ? "" : "on"} onClick={() => setAnnual(false)}>
                Monthly
              </button>
              <button type="button" className={annual ? "on" : ""} onClick={() => setAnnual(true)}>
                Annual
                <span className="save-badge">2 months free</span>
              </button>
            </div>
          )}
        </div>

        <div className="plan-grid plan-grid-2">
          {PLANS.map((plan) => {
            const pm = perMonth(plan, annual);
            return (
            <div key={plan.id} className={"plan" + (plan.featured ? " featured" : "")}>
              {plan.badge && <span className="rec-badge">{plan.badge}</span>}
              <p className="plan-name">{plan.name}</p>
              <p className="plan-blurb">{plan.blurb}</p>
              <div className="plan-price">
                {plan.monthly === null ? (
                  <span className="amt">Custom</span>
                ) : (
                  <>
                    <span className="amt">${pm}</span>
                    <span className="suf">/mo</span>
                  </>
                )}
              </div>
              <p className="plan-sub">
                {plan.monthly === null
                  ? "Tailored to your volume"
                  : plan.monthly === 0
                    ? "Forever free · open source"
                    : annual
                      ? `Billed annually · $${annualTotal(plan)}/yr`
                      : "Billed monthly"}
              </p>
              <a className={(plan.featured ? "btn" : "btn ghost") + " plan-cta"} href={plan.ctaHref}>
                {plan.cta}
              </a>
              <ul className="plan-feats">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            );
          })}
        </div>

        <p className="pricing-foot">
          Free is the full open-source build: bring your own keys, no accounts. Custom covers
          on-prem, SSO, and higher volume.
        </p>
        <p className="site-copy" style={{ marginTop: 18 }}>
          © {new Date().getFullYear()} Sift. Built with 💜 by the{" "}
          <a href="https://github.com/fruitizz" target="_blank" rel="noopener noreferrer">
            Hanfani ecosystem
          </a>
          .
        </p>
      </div>
    </div>
  );
}
