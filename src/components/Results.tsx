import { useEffect, useRef, useState } from "react";
import type { AppState } from "../App.tsx";
import type { Dict } from "../i18n.ts";
import type { Confidence } from "../../shared/types.ts";
import { exportExtraction, type ExportTarget } from "../lib/export.ts";

type Tab = "fields" | "fmt" | "text" | "json";

function confLabel(t: Dict, c: Confidence): string {
  return c === "high" ? t.conf_high : c === "low" ? t.conf_low : t.conf_medium;
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Results({
  state,
  t,
  locatedIndex,
  onLocate,
}: {
  state: AppState;
  t: Dict;
  locatedIndex: number | null;
  onLocate: (index: number | null) => void;
}) {
  const [tab, setTab] = useState<Tab>("fields");
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const r = state.result;

  const jsonStr = r ? JSON.stringify(r.json, null, 2) : "";

  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportOpen]);

  const copy = async () => {
    if (!r) return;
    const payload = tab === "text" ? r.plainText : jsonStr;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const doDownload = () => {
    if (!r) return;
    if (tab === "text") download("extraction.txt", r.plainText, "text/plain");
    else download("extraction.json", jsonStr, "application/json");
  };

  const doExport = (target: ExportTarget) => {
    if (!r) return;
    exportExtraction(target, r);
    setExportOpen(false);
  };

  const toggleLocate = (index: number) => {
    onLocate(locatedIndex === index ? null : index);
  };

  return (
    <section className="panel">
      <div className="phead">
        <div className="rtabs">
          <button className={tab === "fields" ? "on" : ""} onClick={() => setTab("fields")}>
            {t.t_fields}
          </button>
          <button className={tab === "fmt" ? "on" : ""} onClick={() => setTab("fmt")}>
            {t.t_fmt}
          </button>
          <button className={tab === "text" ? "on" : ""} onClick={() => setTab("text")}>
            {t.t_text}
          </button>
          <button className={tab === "json" ? "on" : ""} onClick={() => setTab("json")}>
            JSON
          </button>
        </div>
        <div className="ractions">
          <div className="export-wrap" ref={exportRef}>
            <button
              className="icoact"
              title={t.export}
              aria-label={t.export}
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((o) => !o)}
              disabled={!r}
            >
              ↗
            </button>
            {exportOpen && (
              <div className="export-menu" role="menu">
                <button role="menuitem" onClick={() => doExport("cabane")}>
                  {t.export_cabane}
                </button>
                <button role="menuitem" onClick={() => doExport("notion")}>
                  {t.export_notion}
                </button>
                <button role="menuitem" onClick={() => doExport("sheets")}>
                  {t.export_sheets}
                </button>
              </div>
            )}
          </div>
          <button className="icoact" title={copied ? t.copied : t.copy} aria-label={t.copy} onClick={copy} disabled={!r}>
            {copied ? "✓" : "⧉"}
          </button>
          <button className="icoact" title={t.download} aria-label={t.download} onClick={doDownload} disabled={!r}>
            ⤓
          </button>
        </div>
      </div>

      <div className="rbody">
        {r && state.cached && <div className="cachebadge">{t.cached}</div>}
        {state.error && (
          <div className="banner-err">
            {t.err}: {state.error}
          </div>
        )}

        {!r ? (
          !state.error && <div className="empty">{t.empty}</div>
        ) : tab === "fields" ? (
          <div className="pane">
            {r.fields.map((f, i) => (
              <div
                className={"fieldcard" + (locatedIndex === i ? " located" : "")}
                key={i}
              >
                <div className="k">
                  {f.key}
                  <span className="conf">{confLabel(t, f.confidence)}</span>
                </div>
                <div className="v">{f.value}</div>
                <div className="cite">
                  <span className="q" title={f.source}>
                    {f.source ? `“${f.source}”` : "-"}
                  </span>
                  <button
                    className={"locate" + (locatedIndex === i ? " on" : "")}
                    title={f.bbox ? t.locate : t.locate_unavailable}
                    disabled={!f.bbox}
                    onClick={() => toggleLocate(i)}
                  >
                    {t.locate}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : tab === "fmt" ? (
          <div className="pane">
            <div className="dtbadge">
              {t.detected}: {r.documentType}
            </div>
            <div style={{ margin: "6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {r.fields.map((f, i) => (
                    <tr key={i}>
                      <td
                        style={{
                          padding: "7px 4px",
                          borderBottom: "1px solid var(--line)",
                          color: "var(--muted)",
                          fontSize: 12.5,
                          width: "40%",
                        }}
                      >
                        {f.key}
                      </td>
                      <td
                        style={{
                          padding: "7px 4px",
                          borderBottom: "1px solid var(--line)",
                          fontWeight: 500,
                        }}
                      >
                        {f.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === "text" ? (
          <pre className="out">{r.plainText}</pre>
        ) : (
          <pre className="out">{jsonStr}</pre>
        )}
      </div>
    </section>
  );
}
