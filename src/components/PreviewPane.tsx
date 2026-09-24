import { useEffect, useRef, useState } from "react";
import { proxied } from "../lib/routes.ts";
import * as pdfjs from "pdfjs-dist";
import type { AppState } from "../App.tsx";
import type { Dict } from "../i18n.ts";
import type { ExtractedField } from "../../shared/types.ts";
import type { ProgressInfo } from "../lib/progress.ts";

// Vite-friendly worker - keeps page rendering off the main thread.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const ZOOM_MIN = 40;
const ZOOM_MAX = 300;
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

function phaseLabel(t: Dict, phase: ProgressInfo["phase"]): string {
  switch (phase) {
    case "reading":
      return t.prog_reading;
    case "classifying":
      return t.prog_classifying;
    case "extracting":
      return t.prog_extracting;
    case "locating":
      return t.prog_locating;
    case "done":
      return t.prog_done;
    default:
      return t.running;
  }
}

/**
 * The document reader - the dominant, full-height center pane. Source selection
 * lives in the config rail (SourcePanel); this pane only renders + transforms
 * whatever document is currently loaded, so it can fill the viewport.
 * Locate overlays share the same transform wrapper as the image/PDF page.
 */
export function PreviewPane({
  state,
  t,
  located,
  progress,
}: {
  state: AppState;
  t: Dict;
  located: ExtractedField | null;
  progress: ProgressInfo | null;
}) {
  const [zoom, setZoom] = useState(100);
  const [rot, setRot] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  /** CSS pixel size of the rendered page - Locate % is relative to this box. */
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);

  const rawUrl = state.url.trim();
  const previewSrc =
    state.srcKind === "url"
      ? rawUrl
        ? proxied(rawUrl)
        : null
      : state.previewUrl;
  const isPdf =
    state.srcKind === "url"
      ? /\.pdf(?:\?|#|$)/i.test(state.url)
      : state.file?.type === "application/pdf";

  // Jump the PDF viewer to the located field's page when Locate is pressed.
  useEffect(() => {
    if (located?.bbox?.page) setPdfPage(located.bbox.page);
  }, [located]);

  // Load PDF document whenever the preview source changes.
  useEffect(() => {
    if (!previewSrc || !isPdf) {
      pdfDocRef.current?.destroy().catch(() => {});
      pdfDocRef.current = null;
      setPdfPageCount(0);
      setPdfErr(null);
      setPageSize(null);
      return;
    }
    let cancelled = false;
    setPdfErr(null);
    setPdfPage(1);
    (async () => {
      try {
        pdfDocRef.current?.destroy().catch(() => {});
        const loading = pdfjs.getDocument(previewSrc);
        const doc = await loading.promise;
        if (cancelled) {
          doc.destroy().catch(() => {});
          return;
        }
        pdfDocRef.current = doc;
        setPdfPageCount(doc.numPages);
      } catch {
        if (!cancelled) setPdfErr(t.pdf_fail);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewSrc, isPdf, t.pdf_fail]);

  // Render the current PDF page onto the canvas.
  useEffect(() => {
    if (!isPdf || !pdfDocRef.current || !canvasRef.current || pdfPageCount < 1) return;
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    let cancelled = false;
    const paint: { task: { cancel: () => void; promise: Promise<unknown> } | null } = { task: null };
    (async () => {
      try {
        const page = await doc.getPage(Math.min(Math.max(1, pdfPage), doc.numPages));
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const targetW = Math.min(
          900,
          stageRef.current?.clientWidth ? stageRef.current.clientWidth - 48 : 720,
        );
        const scale = targetW / base.width;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });
        const cssW = viewport.width / dpr;
        const cssH = viewport.height / dpr;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        setPageSize({ w: cssW, h: cssH });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        paint.task = page.render({ canvasContext: ctx, viewport });
        await paint.task.promise;
      } catch (e) {
        if (cancelled) return;
        const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
        if (name === "RenderingCancelledException") return;
        setPdfErr(t.pdf_fail);
      }
    })();
    return () => {
      cancelled = true;
      try {
        paint.task?.cancel();
      } catch {
        /* already settled */
      }
    };
  }, [isPdf, pdfPage, pdfPageCount, previewSrc, t.pdf_fail]);

  const fit = () => {
    setRot(0);
    if (isPdf) {
      setZoom(100);
      return;
    }
    const stage = stageRef.current;
    const img = imgRef.current;
    if (stage && img && img.naturalWidth && img.naturalHeight) {
      const pad = 32;
      const s = Math.min(
        (stage.clientWidth - pad) / img.naturalWidth,
        (stage.clientHeight - pad) / img.naturalHeight,
      );
      setZoom(clampZoom(Math.round(s * 100)));
    } else {
      setZoom(100);
    }
  };

  const bbox = located?.bbox;
  const showHl = !!bbox && bbox.w > 0 && bbox.h > 0 && (!isPdf || bbox.page === pdfPage);

  const caption = !previewSrc
    ? t.cap_idle
    : located
      ? `${t.cap_showing} ${located.key}`
      : t.cap_locate;

  return (
    <section className="stage-col">
      <div className="rtoolbar">
        <span className="tlabel">{t.preview}</span>
        {isPdf && pdfPageCount > 0 && (
          <div className="pdfpager">
            <button
              className="icob"
              title={t.pdf_prev}
              disabled={pdfPage <= 1}
              onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <span className="zlvl">
              {pdfPage}/{pdfPageCount}
            </span>
            <button
              className="icob"
              title={t.pdf_next}
              disabled={pdfPage >= pdfPageCount}
              onClick={() => setPdfPage((p) => Math.min(pdfPageCount, p + 1))}
            >
              ›
            </button>
          </div>
        )}
        <div className="sp" />
        <button className="icob" title="Zoom out" onClick={() => setZoom((z) => clampZoom(z - 20))}>
          −
        </button>
        <span className="zlvl">{zoom}%</span>
        <button className="icob" title="Zoom in" onClick={() => setZoom((z) => clampZoom(z + 20))}>
          +
        </button>
        <button className="icob" title="Fit" onClick={fit}>
          ⤢
        </button>
        <button className="icob" title="Rotate left" onClick={() => setRot((r) => r - 90)}>
          ↺
        </button>
        <button className="icob" title="Rotate right" onClick={() => setRot((r) => r + 90)}>
          ↻
        </button>
      </div>
      <div className="stage" ref={stageRef}>
        {!previewSrc ? (
          <div className="placeholder">{t.cap_idle}</div>
        ) : isPdf ? (
          pdfErr ? (
            <div className="placeholder">{pdfErr}</div>
          ) : (
            <div
              className="docframe"
              style={{ transform: `scale(${zoom / 100}) rotate(${rot}deg)` }}
            >
              <div
                className="pagewrap"
                style={
                  pageSize
                    ? { width: pageSize.w, height: pageSize.h }
                    : undefined
                }
              >
                <canvas ref={canvasRef} className="pdfcanvas" />
                {showHl && bbox && (
                  <div
                    className="hl show"
                    style={{
                      left: `${bbox.x * 100}%`,
                      top: `${bbox.y * 100}%`,
                      width: `${bbox.w * 100}%`,
                      height: `${bbox.h * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          )
        ) : (
          <div
            className="docframe"
            style={{ transform: `scale(${zoom / 100}) rotate(${rot}deg)` }}
          >
            <div className="pagewrap">
              <img
                ref={imgRef}
                src={previewSrc}
                alt="document preview"
                onLoad={() => {
                  const img = imgRef.current;
                  if (img) setPageSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
              />
              {showHl && bbox && (
                <div
                  className="hl show"
                  style={{
                    left: `${bbox.x * 100}%`,
                    top: `${bbox.y * 100}%`,
                    width: `${bbox.w * 100}%`,
                    height: `${bbox.h * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        )}

        {progress && previewSrc && (
          <div className="stage-progress" role="status" aria-live="polite">
            <div className="stage-progress-card">
              <div className="stage-progress-spin" aria-hidden="true" />
              <p className="stage-progress-label">{phaseLabel(t, progress.phase)}</p>
              <div className="stage-progress-bar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="stage-progress-fill" style={{ width: `${progress.pct}%` }} />
              </div>
              <span className="stage-progress-pct">{progress.pct}%</span>
            </div>
          </div>
        )}
      </div>
      <div className="rcap">
        {located ? (
          <>
            {t.cap_showing} <b>{located.key}</b>
            {located.source ? `: “${located.source}”` : ""}
          </>
        ) : (
          caption
        )}
      </div>
    </section>
  );
}
