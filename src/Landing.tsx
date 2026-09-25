import { useEffect, useState, type ReactNode } from "react";
import { href } from "./lib/routes.ts";
import { GitHubStar } from "./components/GitHubStar.tsx";
import { SiteFooter, SiteNav } from "./components/SiteChrome.tsx";
import { GITHUB_URL } from "./lib/github.ts";
import "./landing.css";

const PHASES = ["Reading", "Classifying", "Extracting", "Locating"] as const;

const FEATURE_ROWS: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  flip?: boolean;
  visual: "extract" | "locate" | "schema" | "local" | "byok" | "api" | "export";
}[] = [
  {
    eyebrow: "Cited extraction",
    title: "Every field comes with proof",
    body: "Values ship with the exact source quote and a Locate box on the page, so nothing is a black-box guess.",
    points: ["Source quotes on every field", "Bounding boxes snapped to PDF text", "Confidence high / medium / low"],
    visual: "locate",
  },
  {
    eyebrow: "Schema",
    title: "Auto-design, or bring your own",
    body: "Let the model invent a fitting schema, sketch fields in the builder, or paste a JSON Schema and extract against it.",
    points: ["Auto-design from the document", "Custom field builder", "JSON Schema mode"],
    flip: true,
    visual: "schema",
  },
  {
    eyebrow: "Local-first PDFs",
    title: "Classify locally. Extract from Markdown.",
    body: "Text-based PDFs never need a vision tax. pdf-inspector classifies pages, then DeepSeek fills your schema from native Markdown.",
    points: ["In-process classify + Markdown", "DeepSeek open-source default", "Vision only when the page is a scan"],
    visual: "local",
  },
  {
    eyebrow: "Locate",
    title: "See it on the page",
    body: "Click Locate and the preview jumps to the supporting region. Highlights follow real text geometry, not model guesswork.",
    points: ["One-click jump to the quote", "Works across multi-page PDFs", "Client + server snap for accuracy"],
    flip: true,
    visual: "extract",
  },
  {
    eyebrow: "Providers",
    title: "BYOK across the models you already use",
    body: "DeepSeek, Claude, OpenAI, Gemini, or Mistral. Bundle a server key or paste yours per request. Nothing is stored.",
    points: ["DeepSeek · Anthropic · OpenAI", "Google Gemini · Mistral", "Keys never leave your host"],
    visual: "byok",
  },
  {
    eyebrow: "Public API",
    title: "One GET for structured JSON",
    body: "Point /api/v1/extract at a public PDF or image URL. Same cited shape the UI uses, with OpenAPI docs included.",
    points: ["No caller signup", "model + max_tokens query params", "Live OpenAPI at /api/openapi.json"],
    flip: true,
    visual: "api",
  },
  {
    eyebrow: "Export",
    title: "Fields, text, JSON, done",
    body: "Switch views instantly, copy a field, or download the whole extraction for the next step in your pipeline.",
    points: ["Fields · Formatted · Plain text · JSON", "Copy / download", "Cabane-ready Markdown export"],
    visual: "export",
  },
];

function DemoChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="lp-shot">
      <div className="lp-shot-chrome">
        <span />
        <span />
        <span />
        <em>{title}</em>
      </div>
      <div className="lp-shot-body">{children}</div>
    </div>
  );
}

function DemoExtract() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <DemoChrome title="invoice.pdf · extract">
      <div className="lp-demo-body">
        <div className="lp-demo-page">
          <div className="lp-demo-lines">
            <i />
            <i />
            <i className="short" />
            <i />
            <i className="mid" />
            <i />
            <i className="short" />
          </div>
          <div className="lp-demo-box lp-demo-box-a" />
          <div className="lp-demo-box lp-demo-box-b" />
          <div className="lp-demo-scan" />
        </div>
        <div className="lp-demo-rail">
          <div className="lp-demo-phase">
            <span className="lp-demo-dot" />
            <span>{PHASES[phase]}</span>
          </div>
          <ul className="lp-demo-fields">
            <li style={{ animationDelay: "0.4s" }}>
              <strong>vendor</strong>
              <span>Acme Supplies</span>
              <small>“Acme Supplies Inc.”</small>
            </li>
            <li style={{ animationDelay: "1.1s" }}>
              <strong>total</strong>
              <span>$1,240.00</span>
              <small>“Total due $1,240.00”</small>
            </li>
            <li style={{ animationDelay: "1.8s" }}>
              <strong>invoice_date</strong>
              <span>2026-03-12</span>
              <small>“Date: 12 Mar 2026”</small>
            </li>
          </ul>
        </div>
      </div>
    </DemoChrome>
  );
}

function DemoLocate() {
  return (
    <DemoChrome title="preview · locate">
      <div className="lp-viz-locate">
        <div className="lp-viz-page">
          <div className="lp-viz-lines">
            <i />
            <i className="mid" />
            <i />
            <i className="short" />
            <i />
            <i className="mid" />
          </div>
          <div className="lp-viz-hotspot">
            <span className="lp-viz-pulse" />
            <em>total</em>
          </div>
          <div className="lp-viz-cursor" />
        </div>
        <aside className="lp-viz-cite">
          <strong>Located</strong>
          <p>total → $1,240.00</p>
          <small>“Total due $1,240.00”</small>
        </aside>
      </div>
    </DemoChrome>
  );
}

function DemoSchema() {
  const fields = [
    { name: "patient_name", type: "text", on: true },
    { name: "date_of_birth", type: "date", on: true },
    { name: "member_id", type: "text", on: false },
    { name: "auth_status", type: "enum", on: true },
  ];
  return (
    <DemoChrome title="schema · auto-design">
      <div className="lp-viz-schema">
        <div className="lp-viz-tabs">
          <span className="on">Auto-design</span>
          <span>Custom</span>
          <span>JSON</span>
        </div>
        <ul>
          {fields.map((f, i) => (
            <li key={f.name} className={f.on ? "on" : ""} style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
              <code>{f.name}</code>
              <em>{f.type}</em>
            </li>
          ))}
        </ul>
        <div className="lp-viz-schema-bar">
          <span className="lp-viz-schema-fill" />
        </div>
      </div>
    </DemoChrome>
  );
}

function DemoLocal() {
  return (
    <DemoChrome title="pdf-inspector · local">
      <div className="lp-viz-local">
        <div className="lp-viz-flow">
          <div className="lp-viz-node">
            <strong>PDF</strong>
            <small>upload / URL</small>
          </div>
          <span className="lp-viz-arrow" />
          <div className="lp-viz-node accent">
            <strong>Classify</strong>
            <small>TextBased</small>
          </div>
          <span className="lp-viz-arrow" />
          <div className="lp-viz-node">
            <strong>Markdown</strong>
            <small>native text</small>
          </div>
          <span className="lp-viz-arrow" />
          <div className="lp-viz-node accent">
            <strong>DeepSeek</strong>
            <small>fields out</small>
          </div>
        </div>
        <pre className="lp-viz-md">
          <code>{`# Invoice
Vendor: Acme Supplies Inc.
Total due: $1,240.00
Date: 12 Mar 2026`}</code>
        </pre>
      </div>
    </DemoChrome>
  );
}

function DemoByok() {
  const providers = [
    { id: "DeepSeek", on: true },
    { id: "Anthropic", on: false },
    { id: "OpenAI", on: false },
    { id: "Gemini", on: false },
    { id: "Mistral", on: false },
  ];
  return (
    <DemoChrome title="model · bring your own key">
      <div className="lp-viz-byok">
        <div className="lp-viz-providers">
          {providers.map((p, i) => (
            <span key={p.id} className={p.on ? "on" : ""} style={{ animationDelay: `${i * 0.45}s` }}>
              {p.id}
            </span>
          ))}
        </div>
        <label>
          API key
          <input readOnly value="sk-························" />
        </label>
        <p>Sent only to your bundled backend. Never stored.</p>
      </div>
    </DemoChrome>
  );
}

function DemoApi() {
  return (
    <DemoChrome title="GET /api/v1/extract">
      <div className="lp-viz-api">
        <pre className="lp-viz-curl">
          <code>{`curl -sS --get "$HOST/api/v1/extract" \\
  --data-urlencode "url=…/invoice.pdf" \\
  --data-urlencode "model=deepseek-v4-flash"`}</code>
        </pre>
        <pre className="lp-viz-json">
          <code>{`{
  "documentType": "invoice",
  "fields": [
    { "key": "total", "value": "$1,240.00",
      "source": "Total due $1,240.00" }
  ]
}`}</code>
        </pre>
      </div>
    </DemoChrome>
  );
}

const EXPORT_TABS = ["Fields", "Formatted", "Plain text", "JSON"] as const;

function DemoExport() {
  const [tab, setTab] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTab((t) => (t + 1) % EXPORT_TABS.length), 1600);
    return () => window.clearInterval(id);
  }, []);
  return (
    <DemoChrome title="results · export">
      <div className="lp-viz-export">
        <div className="lp-viz-tabs">
          {EXPORT_TABS.map((t, i) => (
            <span key={t} className={i === tab ? "on" : ""}>
              {t}
            </span>
          ))}
        </div>
        <div className="lp-viz-export-body" key={tab}>
          {tab === 0 && (
            <ul>
              <li>
                <strong>vendor</strong> Acme Supplies
              </li>
              <li>
                <strong>total</strong> $1,240.00
              </li>
              <li>
                <strong>date</strong> 2026-03-12
              </li>
            </ul>
          )}
          {tab === 1 && <p>Acme Supplies billed $1,240.00 on 12 Mar 2026.</p>}
          {tab === 2 && (
            <p className="mono">
              Vendor: Acme Supplies Inc.
              <br />
              Total due: $1,240.00
            </p>
          )}
          {tab === 3 && <pre>{`{ "total": { "value": "$1,240.00" } }`}</pre>}
        </div>
        <div className="lp-viz-export-actions">
          <span>Copy</span>
          <span>Download</span>
        </div>
      </div>
    </DemoChrome>
  );
}

function FeatureVisual({ kind }: { kind: (typeof FEATURE_ROWS)[number]["visual"] }) {
  switch (kind) {
    case "extract":
      return <DemoExtract />;
    case "locate":
      return <DemoLocate />;
    case "schema":
      return <DemoSchema />;
    case "local":
      return <DemoLocal />;
    case "byok":
      return <DemoByok />;
    case "api":
      return <DemoApi />;
    case "export":
      return <DemoExport />;
  }
}

function FeatureRow({
  eyebrow,
  title,
  body,
  points,
  flip,
  visual,
}: (typeof FEATURE_ROWS)[number]) {
  return (
    <section className={"lp-row" + (flip ? " flip" : "")}>
      <div className="lp-row-visual">
        <FeatureVisual kind={visual} />
      </div>
      <div className="lp-row-copy">
        <p className="lp-row-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="lp-row-body">{body}</p>
        <ul>
          {points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Landing() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("sift-theme") === "dark"
      ? "dark"
      : "light",
  );

  useEffect(() => {
    document.title = "Sift: Schema-driven extraction with cited sources";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sift-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div className="lp">
      <SiteNav
        theme={theme}
        onToggleTheme={() => setTheme((th) => (th === "dark" ? "light" : "dark"))}
      />

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-kicker">
              <span className="lp-oss">Open source</span>
            </p>
            <h1 className="lp-headline">
              <span className="lp-headline-a">
                Make the unreadable usable with <span className="lp-headline-ai">AI</span>.
              </span>{" "}
              <span className="lp-headline-b">Fields, text, and JSON.</span>
            </h1>
            <p className="lp-lede">
              Schema-driven extraction with source quotes and Locate boxes. Vision when the page
              needs it.
            </p>
            <div className="lp-cta">
              <a className="lp-btn" href={href("/app")}>
                Try the app
              </a>
              <a className="lp-btn lp-btn-ghost" href={href("/api-docs")}>
                Read the API
              </a>
            </div>
          </div>
          <div className="lp-hero-visual">
            <DemoExtract />
          </div>
        </section>

        <div id="features" className="lp-features-band">
          {FEATURE_ROWS.map((row) => (
            <FeatureRow key={row.title} {...row} />
          ))}
        </div>

        <section className="lp-oss-band">
          <div className="lp-oss-inner">
            <h2>Open source by default</h2>
            <p>
              MIT licensed. No accounts, no telemetry tax. Run Sift on your machine with your own
              DeepSeek or BYOK keys. Fork it, ship it, keep the keys.
            </p>
            <div className="lp-cta">
              <a className="lp-btn" href={href("/app")}>
                Launch Sift
              </a>
              <a className="lp-btn lp-btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                View on GitHub
              </a>
            </div>
            <div className="lp-oss-star">
              <GitHubStar />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
