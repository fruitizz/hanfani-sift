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

/**
 * Where the glyphs sit around the baseline, as a share of the point size.
 * pdf.js reports a baseline and a font height but no per-font metrics, so these
 * are the ordinary Latin proportions — close enough that a highlight frames the
 * line rather than floating above it.
 */
const GLYPH_ASCENT = 0.8;
const GLYPH_DESCENT = 0.22;

export interface TextSpan {
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

/**
 * The page-normalized box of one pdf.js text item.
 *
 * `tx` is the item transform already composed with the viewport, so `tx[4]` is
 * the left edge in viewport units and `tx[5]` is the BASELINE — not the top of
 * the glyphs. Two things were wrong here and both made the highlight miss:
 *
 * - `itemWidth` is the advance width in viewport units, with the point size
 *   already baked in. Scaling it by the transform multiplied it by that size a
 *   second time, so a 101pt name claimed 913pt on a 595pt page and the frame
 *   ran off the edge, clamped, and swallowed its neighbours.
 * - Hanging the box a whole em above the baseline framed the line too high and
 *   left the descenders hanging below the bottom edge.
 */
export function spanBox(
  tx: number[],
  itemWidth: number,
  itemHeight: number,
  viewport: { width: number; height: number; scale: number },
): { x: number; y: number; w: number; h: number } {
  const fontH = Math.hypot(tx[2], tx[3]) || itemHeight || 8;
  const wPx = Math.max((itemWidth || 0) * viewport.scale, fontH * 0.25);
  const hPx = Math.max(fontH * (GLYPH_ASCENT + GLYPH_DESCENT), 4);
  return {
    x: tx[4] / viewport.width,
    y: (tx[5] - fontH * GLYPH_ASCENT) / viewport.height,
    w: wPx / viewport.width,
    h: hPx / viewport.height,
  };
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

/**
 * Narrow a span to the characters the match actually covers.
 *
 * pdf.js gives no per-glyph positions, so this apportions the span's width by
 * character count. Proportional rather than exact — a run of `l`s will be over-
 * covered and a run of `W`s under — but for a quote inside a paragraph-long
 * item it is the difference between framing the quote and framing the paragraph.
 */
export function sliceSpan(span: TextSpan, range: { first: number; last: number }): TextSpan {
  const len = normalizeNeedle(span.str).length;
  if (len <= 0) return span;
  const from = Math.max(0, Math.min(range.first, len - 1));
  const to = Math.max(from, Math.min(range.last, len - 1));
  // A match spanning the whole item needs no slicing, and slicing it would only
  // shave the trailing advance off the last glyph.
  if (from === 0 && to >= len - 1) return span;
  return {
    ...span,
    x: span.x + (span.w * from) / len,
    w: Math.max((span.w * (to - from + 1)) / len, span.w / len),
  };
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
  // A hair of padding so the frame reads as a frame, not as a strikethrough.
  // Small on purpose: with the box now the width of the text, generous padding
  // is the difference between framing the quote and framing its neighbours.
  const padX = Math.min(0.005, w * 0.05);
  const padY = Math.min(0.004, h * 0.18);
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
  // Which characters of which spans the match actually covers. pdf.js often
  // hands back a whole paragraph line as ONE item, so boxing the span outright
  // frames 400pt of prose to point at a 13-character reference number.
  const hits = new Map<number, { first: number; last: number }>();
  for (let i = idx; i < end && i < map.length; i++) {
    const { span, offset } = map[i];
    if (offset < 0) continue;
    const cur = hits.get(span);
    if (cur) cur.last = offset;
    else hits.set(span, { first: offset, last: offset });
  }
  const sliced = [...hits].map(([i, range]) => sliceSpan(pageSpans[i], range));
  return unionBox(sliced);
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
      const box = spanBox(tx, item.width, item.height, viewport);
      spans.push({ str: item.str, ...box, page: p });
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
