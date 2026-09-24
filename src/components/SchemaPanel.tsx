import type { Dispatch, SetStateAction } from "react";
import type { AppState } from "../App.tsx";
import type { Dict } from "../i18n.ts";
import type { DocType, Provider, SchemaMode } from "../../shared/types.ts";
import { BYOK_MODEL_HINTS, BYOK_MODELS, DEFAULT_MODELS, PROVIDERS } from "../lib/models.ts";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  t: Dict;
  onRun: () => void;
  canRun: boolean;
  /** Localized reason the extraction can't run yet (missing model/key), or null. */
  blockReason: string | null;
}

const DOCTYPES: { id: DocType; key: "dt_auto" | "dt_intake" | "dt_invoice" }[] = [
  { id: "auto", key: "dt_auto" },
  { id: "intake", key: "dt_intake" },
  { id: "invoice", key: "dt_invoice" },
];

export function SchemaPanel({ state, setState, t, onRun, canRun, blockReason }: Props) {
  const setField = (i: number, patch: Partial<{ name: string; type: string }>) =>
    setState((s) => ({
      ...s,
      customFields: s.customFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }));

  return (
    <section className="panel">
      <div className="phead">
        <h2>
          <span className="step">2</span>
          {t.schema}
        </h2>
      </div>
      <div className="pbody">
        <div className="dtlabel">{t.doctype}</div>
        <div className="seg">
          {DOCTYPES.map((d) => (
            <button
              key={d.id}
              className={state.docType === d.id ? "on" : ""}
              onClick={() => setState((s) => ({ ...s, docType: d.id }))}
            >
              {t[d.key]}
            </button>
          ))}
        </div>

        <div className="seg">
          {(["auto", "json"] as SchemaMode[]).map((m) => (
            <button
              key={m}
              className={(state.schemaMode === "json") === (m === "json") ? "on" : ""}
              onClick={() => setState((s) => ({ ...s, schemaMode: m === "json" ? "json" : "auto" }))}
            >
              {m === "json" ? t.t_json : t.t_builder}
            </button>
          ))}
        </div>

        {state.schemaMode !== "json" ? (
          <>
            <div className="seg">
              <button
                className={state.schemaMode === "auto" ? "on" : ""}
                onClick={() => setState((s) => ({ ...s, schemaMode: "auto" }))}
              >
                {t.c_auto}
              </button>
              <button
                className={state.schemaMode === "custom" ? "on" : ""}
                onClick={() => setState((s) => ({ ...s, schemaMode: "custom" }))}
              >
                {t.c_custom}
              </button>
            </div>
            {state.schemaMode === "auto" ? (
              <div className="hint">{t.auto_hint}</div>
            ) : (
              <>
                {state.customFields.map((f, i) => (
                  <div className="frow" key={i}>
                    <input
                      value={f.name}
                      placeholder={t.f_ph}
                      onChange={(e) => setField(i, { name: e.target.value })}
                    />
                    <select value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                      {["text", "number", "date", "boolean", "enum", "list"].map((ty) => (
                        <option key={ty}>{ty}</option>
                      ))}
                    </select>
                    <button
                      className="x"
                      onClick={() =>
                        setState((s) => ({ ...s, customFields: s.customFields.filter((_, idx) => idx !== i) }))
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className="addf"
                  onClick={() =>
                    setState((s) => ({ ...s, customFields: [...s.customFields, { name: "", type: "text" }] }))
                  }
                >
                  {t.addf}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <textarea
              className="json"
              value={state.jsonText}
              onChange={(e) => setState((s) => ({ ...s, jsonText: e.target.value }))}
            />
            <div className="hint" style={{ marginTop: 9 }}>
              {t.j_note}
            </div>
          </>
        )}

        <div className="modelblk">
          <div className="mhead">{t.model}</div>
          <div className="seg" style={{ marginBottom: 10 }}>
            <button
              className={state.modelMode === "default" ? "on" : ""}
              onClick={() => setState((s) => ({ ...s, modelMode: "default" }))}
            >
              {t.m_default}
            </button>
            <button
              className={state.modelMode === "byok" ? "on" : ""}
              onClick={() => setState((s) => ({ ...s, modelMode: "byok" }))}
            >
              {t.m_byok}
            </button>
          </div>

          {state.modelMode === "default" ? (
            <>
              <select
                className="msel"
                value={state.defaultModelId}
                onChange={(e) => setState((s) => ({ ...s, defaultModelId: e.target.value }))}
              >
                {DEFAULT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="hint" style={{ marginTop: 9 }}>
                {t.m_dnote}
              </div>
            </>
          ) : (
            <>
              <div className="frow2">
                <select
                  className="msel"
                  value={state.byokProvider}
                  onChange={(e) => {
                    const provider = e.target.value as Provider;
                    setState((s) => ({ ...s, byokProvider: provider, byokModelId: BYOK_MODELS[provider][0] }));
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select
                  className="msel"
                  value={state.byokModelId}
                  onChange={(e) => setState((s) => ({ ...s, byokModelId: e.target.value }))}
                >
                  {BYOK_MODELS[state.byokProvider].map((m) => (
                    <option key={m} value={m}>
                      {BYOK_MODEL_HINTS[m] ? `${m} · ${BYOK_MODEL_HINTS[m]}` : m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field keyf" style={{ marginTop: 8 }}>
                <input
                  type="password"
                  placeholder={t.m_keyph}
                  value={state.byokKey}
                  onChange={(e) => setState((s) => ({ ...s, byokKey: e.target.value }))}
                />
              </div>
              <div className="hint" style={{ marginTop: 9 }}>
                {t.m_bnote}
              </div>
            </>
          )}
        </div>

        {blockReason && (
          <div className="notice-warn" role="alert">
            {blockReason}
          </div>
        )}

        <button className="btn wide" onClick={onRun} disabled={!canRun}>
          {state.loading ? (
            <>
              <span className="spin" />
              {t.running}
            </>
          ) : (
            <>▶ {t.run}</>
          )}
        </button>
      </div>
    </section>
  );
}
