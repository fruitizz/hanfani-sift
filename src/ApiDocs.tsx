import { useEffect, useMemo, useState } from "react";
import { href, isStaticBuild } from "./lib/routes.ts";
import { ReadingProgress } from "./components/ReadingProgress.tsx";
import { highlightSource } from "./lib/highlight.ts";

type LangTab = "curl" | "js" | "python";

const SAMPLE_URL = "https://example.com/invoice.pdf";

function samples(origin: string): Record<LangTab, string> {
  return {
    curl: [
      `curl -sS \\`,
      `  --get "${origin}/api/v1/extract" \\`,
      `  --data-urlencode "url=${SAMPLE_URL}" \\`,
      `  --data-urlencode "model=deepseek-v4-flash" \\`,
      `  --data-urlencode "max_tokens=4000"`,
    ].join("\n"),
    js: [
      `const params = new URLSearchParams({`,
      `  url: ${JSON.stringify(SAMPLE_URL)},`,
      `  model: "deepseek-v4-flash",`,
      `  max_tokens: "4000",`,
      `});`,
      ``,
      `const res = await fetch(`,
      `  \`${origin}/api/v1/extract?\${params}\``,
      `);`,
      `const data = await res.json();`,
      ``,
      `if (!res.ok) {`,
      `  throw new Error(data.error);`,
      `}`,
      ``,
      `console.log(data.fields, data.usage);`,
    ].join("\n"),
    python: [
      `import json`,
      `import urllib.parse`,
      `import urllib.request`,
      ``,
      `qs = urllib.parse.urlencode({`,
      `    "url": ${JSON.stringify(SAMPLE_URL)},`,
      `    "model": "deepseek-v4-flash",`,
      `    "max_tokens": "4000",`,
      `})`,
      ``,
      `with urllib.request.urlopen(`,
      `    f"${origin}/api/v1/extract?{qs}"`,
      `) as response:`,
      `    data = json.load(response)`,
      ``,
      `print(data["fields"], data.get("usage"))`,
    ].join("\n"),
  };
}

function SourceCode({ code, lang }: { code: string; lang: LangTab | "json" }) {
  const lines = code.replace(/\n$/, "").split("\n");
  const html = highlightSource(code, lang);
  const htmlLines = html.split("\n");

  return (
    <div className="docs-source" tabIndex={0}>
      <div className="docs-source-gutter" aria-hidden="true">
        {lines.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <pre className="docs-source-code">
        <code
          dangerouslySetInnerHTML={{
            __html: htmlLines.map((l) => (l.length ? l : "&nbsp;")).join("\n"),
          }}
        />
      </pre>
    </div>
  );
}

const RESPONSE_EXAMPLE = `{
  "documentType": "invoice",
  "plainText": "ACME Corp\\nInvoice #1042\\nTotal: $240.00\\n…",
  "fields": [
    {
      "key": "invoice_number",
      "value": "1042",
      "source": "Invoice #1042",
      "confidence": "high"
    },
    {
      "key": "total",
      "value": "240.00",
      "source": "Total: $240.00",
      "confidence": "high"
    }
  ],
  "json": {
    "_document_type": "invoice",
    "invoice_number": {
      "value": "1042",
      "source": "Invoice #1042",
      "confidence": "high"
    }
  },
  "usage": { "inputTokens": 1842, "outputTokens": 312 }
}`;

const NAV = [
  { id: "introduction", label: "Introduction" },
  { id: "authentication", label: "Authentication" },
  { id: "extract", label: "Extract" },
  { id: "errors", label: "Errors" },
  { id: "openapi", label: "OpenAPI" },
] as const;

export function ApiDocs() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("sift-theme") === "dark"
      ? "dark"
      : "light",
  );
  const [tab, setTab] = useState<LangTab>("curl");
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<string>("introduction");

  // The static build has no API behind its own origin, so copy-pasting a curl
  // sample aimed at github.io would just 404. Show the placeholder host instead.
  const origin =
    !isStaticBuild && typeof window !== "undefined"
      ? window.location.origin
      : "https://your-sift.host";
  const code = useMemo(() => samples(origin), [origin]);

  useEffect(() => {
    document.title = "Sift API: Public extract reference";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sift-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const ids = NAV.map((n) => n.id);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.4, 0.7] },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code[tab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

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
          <span className="docs-brand-sub">API Doc</span>
        </a>
        <div className="docs-top-actions">
          <a className="docs-link" href={href("/pricing")}>
            Pricing
          </a>
          <a className="docs-link" href={href("/api/openapi.json")}>
            OpenAPI
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

      <ReadingProgress contentId="api-docs-article" />

      <div id="api-docs-article" className="docs-layout">
        <aside className="docs-nav" aria-label="API sections">
          <p className="docs-nav-label">On this page</p>
          <ul>
            {NAV.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={active === item.id ? "on" : ""}
                  onClick={() => setActive(item.id)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="docs-nav-label">Endpoints</p>
          <ul>
            <li>
              <a href="#extract" className="docs-ep">
                <span className="method get">GET</span>
                <span>/api/v1/extract</span>
              </a>
            </li>
            <li>
              <a href="#health" className="docs-ep">
                <span className="method get">GET</span>
                <span>/api/health</span>
              </a>
            </li>
          </ul>
        </aside>

        <main className="docs-main">
          <section id="introduction" className="docs-section">
            <p className="docs-eyebrow">Public API · v1</p>
            <h1>Sift API</h1>
            <p className="docs-lede">
              Extract structured fields from a publicly reachable PDF or image. Pass a{" "}
              <code>url</code>, optionally choose a <code>model</code> and{" "}
              <code>max_tokens</code> budget. Sift reads the file, designs a fitting schema, and
              returns cited fields with confidence scores (plus token usage).
            </p>
            <div className="docs-callout">
              <strong>Supported files</strong>
              <span>PDF, JPG, JPEG, PNG, WEBP: the URL path must end with one of these extensions.</span>
            </div>
          </section>

          <section id="authentication" className="docs-section">
            <h2>Authentication</h2>
            <p>
              No signup and no caller API key. This open-source build is self-hosted. Extractions
              use the operator&apos;s <code>DEEPSEEK_API_KEY</code> (default) or{" "}
              <code>ANTHROPIC_API_KEY</code> for Claude vision. Protect the host if you expose it
              beyond a trusted network.
            </p>
          </section>

          <section id="extract" className="docs-section">
            <div className="docs-endpoint-head">
              <span className="method get">GET</span>
              <code className="docs-path">/api/v1/extract</code>
            </div>
            <h2>Extract from URL</h2>
            <p>
              Point <code>url</code> at a publicly reachable document. Optionally set{" "}
              <code>model</code> and <code>max_tokens</code>. The server auto-detects PDF vs image
              from the extension, auto-designs a schema, and returns the same cited extraction shape
              as the interactive app.
            </p>

            <h3>Query parameters</h3>
            <div className="docs-table">
              <div className="docs-tr head">
                <span>Name</span>
                <span>Type</span>
                <span>Required</span>
                <span>Description</span>
              </div>
              <div className="docs-tr">
                <span>
                  <code>url</code>
                </span>
                <span>string (uri)</span>
                <span>yes</span>
                <span>http(s) URL of a supported file</span>
              </div>
              <div className="docs-tr">
                <span>
                  <code>model</code>
                </span>
                <span>string</span>
                <span>no</span>
                <span>
                  <code>deepseek-v4-flash</code> (default) · <code>deepseek-v4-pro</code> ·{" "}
                  <code>claude-sonnet-4-6</code> · <code>claude-haiku-4-5</code> ·{" "}
                  <code>claude-opus-4-8</code>
                </span>
              </div>
              <div className="docs-tr">
                <span>
                  <code>max_tokens</code>
                </span>
                <span>integer</span>
                <span>no</span>
                <span>Output token cap · 256-16000 · default <code>8000</code></span>
              </div>
            </div>

            <h3>Try it</h3>
            <div className="docs-codepanel docs-codepanel-source">
              <div className="docs-code-tabs">
                {(["curl", "js", "python"] as LangTab[]).map((k) => (
                  <button
                    key={k}
                    className={tab === k ? "on" : ""}
                    onClick={() => setTab(k)}
                  >
                    {k === "js" ? "JavaScript" : k === "python" ? "Python" : "cURL"}
                  </button>
                ))}
                <span className="docs-code-file">
                  {tab === "js" ? "extract.mjs" : tab === "python" ? "extract.py" : "extract.sh"}
                </span>
                <button className="docs-copy" onClick={copyCode}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <SourceCode code={code[tab]} lang={tab} />
            </div>

            <h3>Response <span className="docs-status ok">200</span></h3>
            <div className="docs-codepanel docs-codepanel-source">
              <div className="docs-code-tabs">
                <span className="docs-code-file on-static">response.json</span>
              </div>
              <SourceCode code={RESPONSE_EXAMPLE} lang="json" />
            </div>

            <h3 id="health">Health</h3>
            <div className="docs-endpoint-head">
              <span className="method get">GET</span>
              <code className="docs-path">/api/health</code>
            </div>
            <p>
              Returns <code>{`{ "ok": true }`}</code> when the API process is up.
            </p>
          </section>

          <section id="errors" className="docs-section">
            <h2>Errors</h2>
            <p>
              Failures return JSON <code>{`{ "error": "…" }`}</code> with an HTTP status:
            </p>
            <div className="docs-table cols-2">
              <div className="docs-tr head">
                <span>Status</span>
                <span>When</span>
              </div>
              <div className="docs-tr">
                <span>
                  <code>400</code>
                </span>
                <span>Missing, invalid, or unsupported <code>url</code></span>
              </div>
              <div className="docs-tr">
                <span>
                  <code>500</code>
                </span>
                <span>
                  Server missing <code>DEEPSEEK_API_KEY</code> / <code>ANTHROPIC_API_KEY</code>
                </span>
              </div>
              <div className="docs-tr">
                <span>
                  <code>502</code>
                </span>
                <span>Upstream model request failed</span>
              </div>
            </div>
          </section>

          <section id="openapi" className="docs-section">
            <h2>OpenAPI</h2>
            <p>
              The live machine-readable spec is served at{" "}
              <a href={href("/api/openapi.json")}>
                <code>/api/openapi.json</code>
              </a>
              . This page is the human reference for the same surface.
            </p>
          </section>

          <footer className="docs-foot">
            <div>Sift Public API · v1</div>
            <p className="site-copy">
              © {new Date().getFullYear()} Sift. Built by the{" "}
              <a href="https://github.com/fruitizz" target="_blank" rel="noopener noreferrer">
                Hanfani ecosystem
              </a>
              .
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
