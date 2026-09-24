import { useEffect, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import type { AppState } from "../App.tsx";
import type { Dict } from "../i18n.ts";

interface Props {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  t: Dict;
}

/**
 * Source selector (URL / upload) — a compact control in the config rail. The
 * document itself renders in the center PreviewPane, so this stays small.
 */
export function SourcePanel({ state, setState, t }: Props) {
  const [hot, setHot] = useState(false);

  // Build a preview URL for uploaded files; revoke on change/unmount.
  useEffect(() => {
    if (state.srcKind === "upload" && state.file) {
      const u = URL.createObjectURL(state.file);
      setState((s) => ({ ...s, previewUrl: u }));
      return () => URL.revokeObjectURL(u);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.file, state.srcKind]);

  const setMode = (kind: "url" | "upload") => setState((s) => ({ ...s, srcKind: kind }));

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setState((s) => ({ ...s, file, error: null }));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setHot(false);
    onFile(e.dataTransfer.files?.[0]);
  };

  return (
    <section className="panel">
      <div className="phead">
        <h2>
          <span className="step">1</span>
          {t.source}
        </h2>
      </div>
      <div className="pbody">
        <div className="seg">
          <button className={state.srcKind === "url" ? "on" : ""} onClick={() => setMode("url")}>
            {t.tab_url}
          </button>
          <button className={state.srcKind === "upload" ? "on" : ""} onClick={() => setMode("upload")}>
            {t.tab_upload}
          </button>
        </div>

        {state.srcKind === "url" ? (
          <div className="field">
            <input
              type="text"
              placeholder={t.url_ph}
              value={state.url}
              onChange={(e) => setState((s) => ({ ...s, url: e.target.value }))}
            />
          </div>
        ) : (
          <label
            className={"drop" + (hot ? " hot" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={onDrop}
          >
            <div className="big">⬆️</div>
            <div className="dtxt">
              <p>{state.file ? state.file.name : t.drop_t}</p>
              <small>{t.drop_s}</small>
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        )}
      </div>
    </section>
  );
}
