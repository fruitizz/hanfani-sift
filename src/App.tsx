import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { href, isStaticBuild, proxied, REPO_URL } from "./lib/routes.ts";
import type {
  CustomField,
  DocKind,
  DocType,
  ExtractRequest,
  ExtractResponse,
  ModelMode,
  Provider,
  SchemaMode,
  SourceKind,
} from "../shared/types.ts";
import { T, type Lang } from "./i18n.ts";
import { bytesToBase64, extract, fnv1aBytes, readFileBytes } from "./lib/api.ts";
import { modelCacheIdentity } from "../shared/providers.ts";
import { loadExtractCache, normalizeSourceUrl, persistExtractCache } from "./lib/cache.ts";
import { locateFieldsInPdf } from "./lib/locate-pdf.ts";
import { DEFAULT_MODEL_ID } from "./lib/models.ts";
import { canUseLocalTextRoute, inspectPdfBytes, inspectPdfFromUrl } from "./lib/pdf-inspect.ts";
import { progressFor, type ExtractPhase } from "./lib/progress.ts";
import { SourcePanel } from "./components/SourcePanel.tsx";
import { PreviewPane } from "./components/PreviewPane.tsx";
import { SchemaPanel } from "./components/SchemaPanel.tsx";
import { Results } from "./components/Results.tsx";

export interface AppState {
  lang: Lang;
  srcKind: SourceKind;
  url: string;
  file: File | null;
  previewUrl: string | null;
  doc: DocKind;
  mime: string;
  docType: DocType;
  schemaMode: SchemaMode;
  customFields: CustomField[];
  jsonText: string;
  modelMode: ModelMode;
  defaultModelId: string;
  byokProvider: Provider;
  byokModelId: string;
  byokKey: string;
  loading: boolean;
  error: string | null;
  result: ExtractResponse | null;
  /** Cumulative tokens burned across this session's extractions. */
  tokensIn: number;
  tokensOut: number;
  /** Successful non-cached extractions this session (shown as “Agent turns”). */
  extractTurns: number;
  /** Forced tool invocations this session (one emit_extraction per turn). */
  toolCalls: number;
  /** True when the last result was served from cache (no tokens spent). */
  cached: boolean;
}

/** Format a millisecond duration like Cursor: `6h 20m`, `45m`, `12s`. */
function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/**
 * Identity of an extraction request for caching: same source bytes/URL + schema
 * + model + doc type + language ⇒ same key ⇒ reuse the result, spend no tokens.
 * The BYOK api key is deliberately excluded (it doesn't change the output).
 * `uploadFp` is a precomputed bytes fingerprint when the upload omits base64
 * (text-based PDF local path).
 */
function cacheKey(req: ExtractRequest, uploadFp?: string): string {
  const s = req.source;
  const srcFp =
    s.kind === "url"
      ? `url:${normalizeSourceUrl(s.url ?? "")}`
      : `up:${uploadFp ?? (s.data ? fnv1aBytes(base64ToBuf(s.data)) : "empty")}`;
  // Provider+model id only — default list and BYOK for the same model share a hit.
  const model = modelCacheIdentity(
    req.model.id,
    req.model.mode === "byok" ? req.model.provider : undefined,
  );
  // v:4 — normalized provider keys for all BYOK backends.
  return JSON.stringify({ v: 4, srcFp, doc: s.doc, docType: req.docType, schema: req.schema, model, lang: req.lang });
}

/** Decode base64 to ArrayBuffer for cache fingerprinting (fallback path only). */
function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const initial: AppState = {
  lang: "en",
  srcKind: "url",
  url: "",
  file: null,
  previewUrl: null,
  doc: "image",
  mime: "",
  docType: "auto",
  schemaMode: "auto",
  customFields: [
    { name: "patient_name", type: "text" },
    { name: "date_of_birth", type: "date" },
  ],
  jsonText:
    '{\n  "type": "object",\n  "properties": {\n    "patient_name": { "type": "string" },\n    "total": { "type": "number" }\n  }\n}',
  modelMode: "default",
  defaultModelId: DEFAULT_MODEL_ID,
  byokProvider: "deepseek",
  byokModelId: DEFAULT_MODEL_ID,
  byokKey: "",
  loading: false,
  error: null,
  result: null,
  tokensIn: 0,
  tokensOut: 0,
  extractTurns: 0,
  toolCalls: 0,
  cached: false,
};

export function App() {
  const [state, setState] = useState<AppState>(initial);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** Index into result.fields — more reliable than key (keys can collide). */
  const [locatedIndex, setLocatedIndex] = useState<number | null>(null);
  const [extractPhase, setExtractPhase] = useState<ExtractPhase>("idle");
  const [now, setNow] = useState(() => Date.now());
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("sift-theme") === "dark" ? "dark" : "light",
  );
  // In-memory + localStorage cache — same source/schema/model ⇒ skip the LLM.
  const cacheRef = useRef<Map<string, ExtractResponse>>(loadExtractCache());
  const sessionStartedAt = useRef(Date.now());
  const t = T[state.lang];
  const located =
    locatedIndex != null && state.result ? (state.result.fields[locatedIndex] ?? null) : null;

  // Keep the duration row live while the tokens badge is visible.
  useEffect(() => {
    if (state.tokensIn + state.tokensOut <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [state.tokensIn, state.tokensOut]);

  // Reflect the theme on <html> (drives the CSS variable overrides) and persist it.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sift-theme", theme);
    } catch {
      /* storage unavailable — theme just won't persist */
    }
  }, [theme]);

  const hasSource = state.srcKind === "url" ? state.url.trim().length > 0 : state.file !== null;

  // Is the model configuration complete? A model id is always required; in BYOK
  // mode a key is required too. This is what drives the "nothing selected" error.
  const modelReady =
    state.modelMode === "byok"
      ? state.byokModelId.trim().length > 0 && state.byokKey.trim().length > 0
      : state.defaultModelId.trim().length > 0;

  // Localized reason the user can't run yet (or null when everything's ready).
  const blockReason = useMemo<string | null>(() => {
    if (state.modelMode === "byok") {
      const noModel = state.byokModelId.trim().length === 0;
      const noKey = state.byokKey.trim().length === 0;
      if (noModel && noKey) return t.need_key_model;
      if (noKey) return t.need_key;
      if (noModel) return t.need_model;
    } else if (state.defaultModelId.trim().length === 0) {
      return t.need_model;
    }
    return null;
  }, [state.modelMode, state.byokModelId, state.byokKey, state.defaultModelId, t]);

  const run = useCallback(async () => {
    if (!hasSource) {
      setState((s) => ({ ...s, error: t.need_source }));
      return;
    }
    if (!modelReady) {
      setState((s) => ({ ...s, error: blockReason ?? t.need_key_model }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    setLocatedIndex(null);
    setExtractPhase("reading");
    try {
      let schema: ExtractRequest["schema"];
      if (state.schemaMode === "custom") {
        schema = { mode: "custom", fields: state.customFields.filter((f) => f.name.trim()) };
      } else if (state.schemaMode === "json") {
        let json: unknown;
        try {
          json = JSON.parse(state.jsonText);
        } catch {
          throw new Error("The JSON schema is not valid JSON.");
        }
        schema = { mode: "json", json };
      } else {
        schema = { mode: "auto" };
      }

      const model: ExtractRequest["model"] =
        state.modelMode === "byok"
          ? {
              mode: "byok",
              provider: state.byokProvider,
              id: state.byokModelId,
              apiKey: state.byokKey.trim(),
            }
          : { mode: "default", id: state.defaultModelId };

      let source: ExtractRequest["source"];
      let localMarkdown: string | undefined;
      let pdfInspect: ExtractRequest["pdfInspect"];
      let uploadFp: string | undefined;
      /** Bytes / URL kept for client-side Locate snap after extract. */
      let locateSrc: ArrayBuffer | string | null = null;
      let uploadBytes: ArrayBuffer | undefined;

      // Resolve source identity first so we can hit the cache before PDF inspect /
      // base64 encode. Those steps dominate latency on a cache hit.
      if (state.srcKind === "url") {
        const url = normalizeSourceUrl(state.url);
        const doc: DocKind = /\.pdf(\?|$)/i.test(url) ? "pdf" : "image";
        source = { kind: "url", doc, url };
        if (doc === "pdf") locateSrc = proxied(url);
      } else {
        if (!state.file) throw new Error("Choose a file first");
        const mime = state.file.type || "application/octet-stream";
        const doc: DocKind = mime === "application/pdf" ? "pdf" : "image";
        uploadBytes = await readFileBytes(state.file);
        uploadFp = fnv1aBytes(uploadBytes);
        source = { kind: "upload", doc, mime };
        if (doc === "pdf") locateSrc = uploadBytes;
      }

      const key = cacheKey(
        { source, docType: state.docType, schema, model, lang: state.lang },
        uploadFp,
      );
      const hit = cacheRef.current.get(key);

      let result: ExtractResponse | null = hit ?? null;
      let fromCache = !!result;

      if (!result) {
        if (state.srcKind === "url") {
          if (source.doc === "pdf") {
            setExtractPhase("classifying");
            const local = await inspectPdfFromUrl(source.url!);
            if (local) {
              pdfInspect = local.inspect;
              localMarkdown = local.markdown;
            }
          }
        } else {
          const bytes = uploadBytes!;
          const mime = source.mime || "application/octet-stream";
          if (source.doc === "pdf") {
            setExtractPhase("classifying");
            try {
              const local = await inspectPdfBytes(bytes);
              pdfInspect = local.inspect;
              localMarkdown = local.markdown;
              if (canUseLocalTextRoute(local.inspect, local.markdown)) {
                // Skip base64 upload entirely — server extracts fields from Markdown.
                source = { kind: "upload", doc: "pdf", mime };
              } else {
                source = { kind: "upload", doc: "pdf", data: bytesToBase64(bytes), mime };
              }
            } catch {
              source = { kind: "upload", doc: "pdf", data: bytesToBase64(bytes), mime };
            }
          } else {
            source = { kind: "upload", doc: source.doc, data: bytesToBase64(bytes), mime };
          }
        }

        setExtractPhase("extracting");
        result = await extract({
          source,
          docType: state.docType,
          schema,
          model,
          lang: state.lang,
          localMarkdown,
          pdfInspect,
        });
      }

      // Snap Locate to pdf.js text geometry on fresh extracts only. Cache hits
      // already store post-locate fields — re-running made vision models feel
      // uncached even when the LLM was skipped.
      if (!fromCache && locateSrc && result.fields.length > 0) {
        setExtractPhase("locating");
        const locatedFields = await locateFieldsInPdf(locateSrc, result.fields);
        const json: Record<string, unknown> = { _document_type: result.documentType };
        for (const f of locatedFields) {
          const entry: Record<string, unknown> = {
            value: f.value,
            source: f.source,
            confidence: f.confidence,
          };
          if (f.bbox) entry.bbox = f.bbox;
          json[f.key] = entry;
        }
        result = { ...result, fields: locatedFields, json };
      }

      persistExtractCache(cacheRef.current, key, result);

      setExtractPhase("done");
      setState((s) => ({
        ...s,
        loading: false,
        result,
        error: null,
        cached: fromCache,
        tokensIn: fromCache ? s.tokensIn : s.tokensIn + (result!.usage?.inputTokens ?? 0),
        tokensOut: fromCache ? s.tokensOut : s.tokensOut + (result!.usage?.outputTokens ?? 0),
        extractTurns: fromCache ? s.extractTurns : s.extractTurns + 1,
        toolCalls: fromCache ? s.toolCalls : s.toolCalls + 1,
      }));
      setExtractPhase("idle");
    } catch (e) {
      setExtractPhase("idle");
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }, [state, hasSource, modelReady, blockReason, t]);

  // The button stays clickable whenever a document is loaded, so a missing model
  // or key surfaces an explicit error message rather than a silently dead button.
  const canRun = hasSource && !state.loading;

  return (
    <div className="app-shell">
      {isStaticBuild && (
        <div className="static-banner" role="status">
          <strong>Live preview.</strong> Everything here runs in the browser — upload a PDF,
          zoom it, design a schema. The extraction itself needs a server holding an API key,
          which GitHub Pages cannot run:{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            clone the repo
          </a>{" "}
          and <code>npm run dev</code> for the real thing.
        </div>
      )}
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="railtoggle"
            title={sidebarOpen ? t.panel_hide : t.panel_show}
            aria-label={sidebarOpen ? t.panel_hide : t.panel_show}
            aria-pressed={!sidebarOpen}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <span className="railtoggle-icon" aria-hidden="true">
              🥞
            </span>
          </button>
          <a className="brand" href={href("/")} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="logo">
            <svg viewBox="0 0 64 64" width="20" height="20" aria-hidden="true">
              <circle cx="23" cy="16" r="2.6" fill="#fafaf7" />
              <circle cx="32" cy="14.5" r="2.6" fill="#fafaf7" />
              <circle cx="41" cy="16" r="2.6" fill="#fafaf7" />
              <path fill="#fafaf7" d="M16 22H48L37 37V47L27 47V37Z" />
            </svg>
          </div>
            <h1>Sift</h1>
            <p>{t.tagline}</p>
          </a>
        </div>
        <div className="topbar-right">
          <a className="navlink" href={href("/solutions")}>Solutions</a>
          <a className="navlink" href={href("/pricing")}>Pricing</a>
          <a className="navlink" href={href("/api-docs")}>API Doc</a>
          {state.tokensIn + state.tokensOut > 0 && (
            <div className="tokens" tabIndex={0} onMouseEnter={() => setNow(Date.now())}>
              <span className="tk-dot" />
              {(state.tokensIn + state.tokensOut).toLocaleString()} tokens
              <div className="tokens-tip" role="tooltip">
                <div className="tokens-tip-row">
                  <span>{t.tip_context}</span>
                  <strong>{(state.tokensIn + state.tokensOut).toLocaleString()} tokens</strong>
                </div>
                <div className="tokens-tip-row">
                  <span>{t.tip_turns}</span>
                  <strong>{state.extractTurns.toLocaleString()}</strong>
                </div>
                <div className="tokens-tip-row">
                  <span>{t.tip_tools}</span>
                  <strong>{state.toolCalls.toLocaleString()}</strong>
                </div>
                <div className="tokens-tip-row">
                  <span>{t.tip_duration}</span>
                  <strong>{formatDuration(now - sessionStartedAt.current)}</strong>
                </div>
                <div className="tokens-tip-sub">
                  ↑ {state.tokensIn.toLocaleString()} in · ↓ {state.tokensOut.toLocaleString()} out
                </div>
              </div>
            </div>
          )}
          <button
            className="themebtn"
            title={theme === "dark" ? t.theme_light : t.theme_dark}
            aria-label={theme === "dark" ? t.theme_light : t.theme_dark}
            onClick={() => setTheme((th) => (th === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <div className="lang" role="group" aria-label="Language">
            <button className={state.lang === "en" ? "on" : ""} onClick={() => setState((s) => ({ ...s, lang: "en" }))}>
              EN
            </button>
            <button className={state.lang === "fr" ? "on" : ""} onClick={() => setState((s) => ({ ...s, lang: "fr" }))}>
              FR
            </button>
          </div>
        </div>
      </header>

      <main className={"workspace" + (sidebarOpen ? "" : " collapsed")}>
        <aside className="rail config-rail">
          <SourcePanel state={state} setState={setState} t={t} />
          <SchemaPanel state={state} setState={setState} t={t} onRun={run} canRun={canRun} blockReason={blockReason} />
        </aside>

        <PreviewPane
          state={state}
          t={t}
          located={located}
          progress={state.loading ? progressFor(extractPhase) : null}
        />

        <aside className="rail results-rail">
          <Results
            state={state}
            t={t}
            locatedIndex={locatedIndex}
            onLocate={setLocatedIndex}
          />
        </aside>
      </main>
    </div>
  );
}
