/**
 * Locate field source quotes on a PDF using pdf.js text geometry.
 * Model-returned bboxes are often wrong; native text boxes match the preview canvas.
 */

import * as pdfjs from "pdfjs-dist";
import type { ExtractedField, FieldBBox } from "../../shared/types.ts";

// Same worker as PreviewPane — pdf.js de-dupes GlobalWorkerOptions.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface TextSpan {
  str: string;
  /** Normalized 0–1 page box (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

function normalizeNeedle(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Build searchable haystack with index map back to spans. */
function buildHaystack(spans: TextSpan[]): { hay: string; map: { span: number; offset: number }[] } {
  let hay = "";
  const map: { span: number; offset: number }[] = [];
  for (let i = 0; i < spans.length; i++) {
    const piece = normalizeNeedle(spans[i].str);
    if (!piece) continue;
    if (hay.length) {
      hay += " ";
      map.push({ span: i, offset: -1 }); // whitespace gap
    }
    for (let c = 0; c < piece.length; c++) {
      map.push({ span: i, offset: c });
    }
    hay += piece;
  }
  return { hay, map };
}

function unionBox(spans: TextSpan[]): FieldBBox | undefined {
  if (!spans.length) return undefined;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  let page = spans[0].page;
  for (const s of spans) {
    page = s.page;
    x1 = Math.min(x1, s.x);
    y1 = Math.min(y1, s.y);
    x2 = Math.max(x2, s.x + s.w);
    y2 = Math.max(y2, s.y + s.h);
  }
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0.001 || h <= 0.001) return undefined;
  // Pad slightly so the highlight is easy to see.
  const padX = Math.min(0.01, w * 0.08);
  const padY = Math.min(0.008, h * 0.15);
  return {
    x: Math.max(0, x1 - padX),
    y: Math.max(0, y1 - padY),
    w: Math.min(1 - Math.max(0, x1 - padX), w + padX * 2),
    h: Math.min(1 - Math.max(0, y1 - padY), h + padY * 2),
    page,
  };
}

function findQuoteBox(pageSpans: TextSpan[], quote: string): FieldBBox | undefined {
  const needle = normalizeNeedle(quote);
  if (needle.length < 2) return undefined;
  const { hay, map } = buildHaystack(pageSpans);
  let idx = hay.indexOf(needle);
  // Fallback: try value-sized prefix / without punctuation
  if (idx < 0 && needle.length > 24) {
    idx = hay.indexOf(needle.slice(0, 24));
  }
  if (idx < 0) {
    const compact = needle.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (compact.length >= 2) idx = hay.indexOf(compact);
  }
  if (idx < 0) return undefined;

  const end = idx + Math.min(needle.length, hay.length - idx);
  const used = new Set<number>();
  for (let i = idx; i < end && i < map.length; i++) {
    if (map[i].offset >= 0) used.add(map[i].span);
  }
  return unionBox([...used].map((i) => pageSpans[i]));
}

async function collectPageSpans(doc: pdfjs.PDFDocumentProxy): Promise<Map<number, TextSpan[]>> {
  const byPage = new Map<number, TextSpan[]>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const spans: TextSpan[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !(raw as { str?: string }).str) continue;
      const item = raw as { str: string; transform: number[]; width: number; height: number };
      // transform: [scaleX, skewY, skewX, scaleY, tx, ty] in PDF space
      const tx = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontH = Math.hypot(tx[2], tx[3]) || item.height || 8;
      const width = (item.width || 0) * Math.hypot(tx[0], tx[1]);
      // After viewport transform, y is top-down; tx[5] is baseline.
      const xPx = tx[4];
      const yPx = tx[5] - fontH;
      const wPx = Math.max(width, fontH * 0.3);
      const hPx = Math.max(fontH, 4);
      spans.push({
        str: item.str,
        x: xPx / viewport.width,
        y: yPx / viewport.height,
        w: wPx / viewport.width,
        h: hPx / viewport.height,
        page: p,
      });
    }
    byPage.set(p, spans);
  }
  return byPage;
}

/**
 * Enrich fields with accurate bboxes by searching source quotes in the PDF text layer.
 * Leaves existing boxes only when search fails.
 */
export async function locateFieldsInPdf(
  src: string | ArrayBuffer | Uint8Array,
  fields: ExtractedField[],
): Promise<ExtractedField[]> {
  if (!fields.length) return fields;
  let doc: pdfjs.PDFDocumentProxy | null = null;
  try {
    const loading =
      typeof src === "string"
        ? pdfjs.getDocument(src)
        : pdfjs.getDocument({ data: src instanceof ArrayBuffer ? new Uint8Array(src) : src });
    doc = await loading.promise;
    const byPage = await collectPageSpans(doc);

    return fields.map((f) => {
      const quote = (f.source || f.value || "").trim();
      if (!quote) return f;
      // Prefer the model page hint when present, then scan all pages.
      const order: number[] = [];
      if (f.bbox?.page) order.push(f.bbox.page);
      for (let p = 1; p <= doc!.numPages; p++) {
        if (!order.includes(p)) order.push(p);
      }
      for (const p of order) {
        const box = findQuoteBox(byPage.get(p) || [], quote);
        if (box) return { ...f, bbox: box };
      }
      // Value-only retry (source quote may be a longer line).
      const value = f.value.trim();
      if (value && value !== quote) {
        for (const p of order) {
          const box = findQuoteBox(byPage.get(p) || [], value);
          if (box) return { ...f, bbox: box };
        }
      }
      return f;
    });
  } catch {
    return fields;
  } finally {
    doc?.destroy().catch(() => {});
  }
}
