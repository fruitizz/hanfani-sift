import { useEffect, useState } from "react";
import { href } from "./lib/routes.ts";
import { GITHUB_URL } from "./lib/github.ts";
import { SiteFooter, SiteNav } from "./components/SiteChrome.tsx";
import "./landing.css";
import "./solutions.css";

/** The three shapes a company arrives in, whatever it sells. */
const SHAPES: { eyebrow: string; title: string; body: string; points: string[] }[] = [
  {
    eyebrow: "Operations",
    title: "A team buried in documents",
    body: "Finance, claims, intake, admissions — people opening PDFs and retyping what is in them. No engineering budget, no procurement cycle to survive.",
    points: ["Open the app, drop a file, get fields", "No signup and no account", "Export to JSON, Markdown or plain text"],
  },
  {
    eyebrow: "Product",
    title: "A product shipping a document feature",
    body: "You need structured JSON out of a user's upload, and you would rather not build classification, OCR fallback and quote-matching yourself.",
    points: ["One GET on the public API", "OpenAPI schema included", "Cited fields, so your UI can show proof"],
  },
  {
    eyebrow: "Regulated",
    title: "An organisation whose documents cannot leave",
    body: "Health records, legal files, anything under a data-residency rule. The usual answer is to send the PDF to somebody else's server; here you don't.",
    points: ["Self-host the whole stack", "Your own provider key, never stored", "Text PDFs classified in-process, not in the cloud"],
  },
];

interface Industry {
  id: string;
  name: string;
  situation: string;
  documents: string[];
  /** A schema Sift would plausibly auto-design. Types match the builder's own. */
  schema: { field: string; type: "text" | "number" | "date" | "boolean" | "enum" | "list" }[];
  payoff: string;
}

const INDUSTRIES: Industry[] = [
  {
    id: "finance",
    name: "Finance & accounting",
    situation:
      "Accounts payable reads the same six numbers off every invoice, then someone else checks them against the ledger.",
    documents: ["Invoices", "Receipts", "Purchase orders", "Bank statements"],
    schema: [
      { field: "vendor_name", type: "text" },
      { field: "invoice_number", type: "text" },
      { field: "invoice_date", type: "date" },
      { field: "total_amount", type: "number" },
      { field: "tax_amount", type: "number" },
      { field: "line_items", type: "list" },
    ],
    payoff:
      "Every figure carries the line it was read from, so a disputed total is settled in the document instead of in a thread.",
  },
  {
    id: "insurance",
    name: "Insurance",
    situation:
      "A claim arrives as a scanned form, a policy schedule and an adjuster's report, in three different layouts.",
    documents: ["Claim forms", "Policy schedules", "Adjuster reports", "Proof of loss"],
    schema: [
      { field: "policy_number", type: "text" },
      { field: "claimant_name", type: "text" },
      { field: "loss_date", type: "date" },
      { field: "coverage_limit", type: "number" },
      { field: "deductible", type: "number" },
      { field: "claim_status", type: "enum" },
    ],
    payoff:
      "Scanned pages fall back to vision automatically; the typed ones never pay the vision tax in the first place.",
  },
  {
    id: "health",
    name: "Healthcare & clinical ops",
    situation:
      "Intake forms, referrals and prior authorisations pile up, and none of them may be uploaded to a third party.",
    documents: ["Intake forms", "Prior authorisations", "Lab reports", "Referral letters"],
    schema: [
      { field: "patient_name", type: "text" },
      { field: "date_of_birth", type: "date" },
      { field: "member_id", type: "text" },
      { field: "authorisation_status", type: "enum" },
      { field: "requested_procedure", type: "text" },
      { field: "urgent", type: "boolean" },
    ],
    payoff:
      "This is the case self-hosting was built for: the document is read on your own machine, with your own key.",
  },
  {
    id: "legal",
    name: "Legal & compliance",
    situation:
      "Someone has to read two hundred contracts for the same five clauses, and be able to point at where each one was.",
    documents: ["Contracts", "KYC packets", "Regulatory filings", "Board minutes"],
    schema: [
      { field: "parties", type: "list" },
      { field: "effective_date", type: "date" },
      { field: "governing_law", type: "text" },
      { field: "termination_notice_days", type: "number" },
      { field: "auto_renews", type: "boolean" },
    ],
    payoff:
      "Locate jumps the preview to the clause itself, which is the difference between an answer and a citation.",
  },
  {
    id: "logistics",
    name: "Logistics & trade",
    situation:
      "Bills of lading and customs paperwork arrive from a hundred counterparties, each with its own form.",
    documents: ["Bills of lading", "Customs declarations", "Packing lists", "Delivery notes"],
    schema: [
      { field: "shipper", type: "text" },
      { field: "consignee", type: "text" },
      { field: "container_number", type: "text" },
      { field: "hs_codes", type: "list" },
      { field: "gross_weight_kg", type: "number" },
      { field: "ship_date", type: "date" },
    ],
    payoff:
      "One schema handles every layout, because the model reads the document rather than a template you maintain.",
  },
  {
    id: "lending",
    name: "Lending & real estate",
    situation:
      "An underwriting file is thirty pages of pay stubs, leases and valuations, and the decision rests on eight numbers.",
    documents: ["Mortgage packets", "Leases", "Pay stubs", "Appraisals"],
    schema: [
      { field: "borrower_name", type: "text" },
      { field: "monthly_income", type: "number" },
      { field: "property_address", type: "text" },
      { field: "appraised_value", type: "number" },
      { field: "lease_term_months", type: "number" },
      { field: "rent_amount", type: "number" },
    ],
    payoff:
      "A confidence level on each field tells a reviewer which of the eight numbers is worth opening the page for.",
  },
  {
    id: "hr",
    name: "HR & recruitment",
    situation:
      "Applications come in as CVs, diplomas and ID scans, and the ATS wants them as fields.",
    documents: ["CVs", "Diplomas", "ID documents", "Signed contracts"],
    schema: [
      { field: "full_name", type: "text" },
      { field: "email", type: "text" },
      { field: "years_experience", type: "number" },
      { field: "qualifications", type: "list" },
      { field: "certification_expiry", type: "date" },
    ],
    payoff:
      "The public API takes a URL and returns the fields, so the parsing step is a call rather than a service you run.",
  },
  {
    id: "research",
    name: "Research & public sector",
    situation:
      "Grant applications, permits and published papers hold the data, and it is locked inside the PDF.",
    documents: ["Grant applications", "Permits", "Papers", "Transcripts"],
    schema: [
      { field: "applicant", type: "text" },
      { field: "submission_date", type: "date" },
      { field: "requested_amount", type: "number" },
      { field: "category", type: "enum" },
      { field: "attachments_complete", type: "boolean" },
    ],
    payoff:
      "The whole thing is open source, which for a public body is the difference between an evaluation and a tender.",
  },
];

/** What every one of them gets, industry aside. */
const COMMON = [
  {
    title: "A quote under every value",
    body: "Each field ships with the exact sentence it came from and a Locate box on the page. Nothing is a black-box guess you have to trust.",
  },
  {
    title: "Vision only when the page needs it",
    body: "Text PDFs are classified and turned into Markdown in-process, then filled by an open-source model. Scans fall back to vision — nobody pays for it by default.",
  },
  {
    title: "Your keys, your host",
    body: "DeepSeek, Claude, OpenAI, Gemini or Mistral, with a bundled key or one pasted per request. Nothing is stored and nothing has to leave your network.",
  },
];

function IndustryPanel({ industry }: { industry: Industry }) {
  return (
    <div
      className="lp-sol-panel"
      role="tabpanel"
      id={`sol-panel-${industry.id}`}
      aria-labelledby={`sol-tab-${industry.id}`}
      key={industry.id}
    >
      <p className="lp-sol-situation">{industry.situation}</p>

      <div className="lp-sol-docs">
        <h3>Documents it reads</h3>
        <ul>
          {industry.documents.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </div>

      <div className="lp-sol-schema">
        <h3>
          A schema it would auto-design <span>editable, or replace it with your own JSON Schema</span>
        </h3>
        <ul>
          {industry.schema.map((f) => (
            <li key={f.field}>
              <code>{f.field}</code>
              <em>{f.type}</em>
            </li>
          ))}
        </ul>
      </div>

      <p className="lp-sol-payoff">{industry.payoff}</p>
    </div>
  );
}

export function Solutions() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("sift-theme") === "dark"
      ? "dark"
      : "light",
  );
  const [active, setActive] = useState(INDUSTRIES[0].id);

  useEffect(() => {
    document.title = "Sift Solutions: who it is for";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sift-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const current = INDUSTRIES.find((i) => i.id === active) ?? INDUSTRIES[0];

  return (
    <div className="lp">
      <SiteNav
        theme={theme}
        onToggleTheme={() => setTheme((th) => (th === "dark" ? "light" : "dark"))}
        active="solutions"
      />

      <main>
        <section className="lp-hero lp-sol-hero">
          <div className="lp-hero-copy">
            <p className="lp-kicker">
              <span className="lp-oss">Solutions</span>
            </p>
            <h1 className="lp-headline">
              <span className="lp-headline-a">
                Built for the teams that live in <span className="lp-headline-ai">documents</span>.
              </span>{" "}
              <span className="lp-headline-b">Any industry, same cited output.</span>
            </h1>
            <p className="lp-lede">
              Sift turns a document into fields, each one carrying the sentence it came from. Here
              are the shapes of company it fits, the paperwork they run through it, and what comes
              out the other side.
            </p>
            <div className="lp-cta">
              <a className="lp-btn" href={href("/app")}>
                Try it on your own PDF
              </a>
              <a className="lp-btn lp-btn-ghost" href={href("/api-docs")}>
                Read the API
              </a>
            </div>
          </div>
        </section>

        <section className="lp-sol-shapes">
          <header className="lp-sol-head">
            <p className="lp-row-eyebrow">Three shapes</p>
            <h2>Whatever you sell, you arrive as one of these</h2>
          </header>
          <div className="lp-sol-shape-grid">
            {SHAPES.map((s) => (
              <article key={s.title} className="lp-sol-shape">
                <p className="lp-row-eyebrow">{s.eyebrow}</p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <ul>
                  {s.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-sol-picker-band">
          <header className="lp-sol-head">
            <p className="lp-row-eyebrow">By industry</p>
            <h2>Pick the paperwork you recognise</h2>
            <p className="lp-sol-head-body">
              Nothing here is a separate product — it is the same extractor with a different schema
              in front of it. Every schema below is editable in the app.
            </p>
          </header>

          <div className="lp-sol-picker">
            <div className="lp-sol-tabs" role="tablist" aria-label="Industries">
              {INDUSTRIES.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  role="tab"
                  id={`sol-tab-${i.id}`}
                  aria-selected={i.id === active}
                  aria-controls={`sol-panel-${i.id}`}
                  className={i.id === active ? "on" : ""}
                  onClick={() => setActive(i.id)}
                >
                  {i.name}
                </button>
              ))}
            </div>
            <IndustryPanel industry={current} />
          </div>
        </section>

        <section className="lp-sol-common">
          <header className="lp-sol-head">
            <p className="lp-row-eyebrow">Common ground</p>
            <h2>What every one of them gets</h2>
          </header>
          <div className="lp-sol-common-grid">
            {COMMON.map((c) => (
              <article key={c.title}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-oss-band">
          <div className="lp-oss-inner">
            <h2>Not sure yours is on the list?</h2>
            <p>
              It probably is. Sift has no per-industry build — a schema is a handful of field names,
              and the model reads the document rather than a template. Open the app and point it at
              one of your own PDFs; it costs nothing and asks for no account.
            </p>
            <div className="lp-cta">
              <a className="lp-btn" href={href("/app")}>
                Launch Sift
              </a>
              <a
                className="lp-btn lp-btn-ghost"
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
