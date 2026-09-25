/**
 * Snap field source quotes to native PDF text boxes (pdf-inspector positions).
 * Fixes Locate accuracy vs model-guessed bboxes.
 */

import { extractTextWithPositions } from "@firecrawl/pdf-inspector";
import type { ExtractedField, FieldBBox } from "../shared/types.ts";

interface NormSpan {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

function normalizeNeedle(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** pdf.js is only needed for the true page box — load it on demand. */
let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

/**
 * The real MediaBox of every page, from pdf.js.
 *
 * This replaces guessing it from glyph extents floored to 595×792, and that was
 * not a rounding error. An A4 page whose text stops short of the bottom was read
 * as 800pt tall instead of 841.9, so every box landed ~5% too high: on the
 * invoice that prompted this, "Northwind Logistics BV" came out 34.5pt up the
 * page — three lines away from the text it cites. The floor also mixed A4 width
 * with Letter height, so it could not be right for either paper size.
 */
async function pageSizes(buffer: Buffer): Promise<Map<number, { w: number; h: number }>> {
  const sizes = new Map<number, { w: number; h: number }>();
  try {
    pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = await pdfjsPromise;
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      isEvalSupported: false,
    }).promise;
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        const vp = (await doc.getPage(p)).getViewport({ scale: 1 });
        sizes.set(p, { w: vp.width, h: vp.height });
      }
    } finally {
      void doc.destroy();
    }
  } catch {
    // Leave it empty; the caller falls back to glyph extents.
  }
  return sizes;
}

async function pageSpansFromBuffer(buffer: Buffer): Promise<Map<number, NormSpan[]>> {
  const items = extractTextWithPositions(buffer);
  const real = await pageSizes(buffer);
  // Fallback only, for a PDF pdf.js could not open: extents of the glyphs.
  const pageMax = new Map<number, { w: number; h: number }>();
  for (const it of items) {
    const cur = pageMax.get(it.page) ?? { w: 0, h: 0 };
    cur.w = Math.max(cur.w, it.x + it.width);
    cur.h = Math.max(cur.h, it.y + it.height);
    pageMax.set(it.page, cur);
  }

  const byPage = new Map<number, NormSpan[]>();
  for (const it of items) {
    if (it.itemType !== "Text" || !it.text.trim()) continue;
    const known = real.get(it.page);
    const dim = pageMax.get(it.page) ?? { w: 612, h: 792 };
    const pageW = known?.w ?? Math.max(dim.w, 595);
    const pageH = known?.h ?? Math.max(dim.h, 792);
    // Convert bottom-left PDF points → top-left normalized fractions.
    const span: NormSpan = {
      str: it.text,
      x: it.x / pageW,
      y: (pageH - it.y - it.height) / pageH,
      w: it.width / pageW,
      h: it.height / pageH,
      page: it.page,
    };
    const list = byPage.get(it.page) ?? [];
    list.push(span);
    byPage.set(it.page, list);
  }
  return byPage;
}

function unionBox(spans: NormSpan[]): FieldBBox | undefined {
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
  // Matches the client's framing (src/lib/locate-pdf.ts): tight enough that the
  // box frames the quote and not the lines around it.
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

function findOnPage(spans: NormSpan[], quote: string): FieldBBox | undefined {
  const needle = normalizeNeedle(quote);
  if (needle.length < 2) return undefined;
  let hay = "";
  const map: { i: number; gap: boolean }[] = [];
  for (let i = 0; i < spans.length; i++) {
    const piece = normalizeNeedle(spans[i].str);
    if (!piece) continue;
    if (hay) {
      hay += " ";
      map.push({ i, gap: true });
    }
    for (let c = 0; c < piece.length; c++) map.push({ i, gap: false });
    hay += piece;
  }
  let idx = hay.indexOf(needle);
  if (idx < 0 && needle.length > 24) idx = hay.indexOf(needle.slice(0, 24));
  if (idx < 0) {
    const compact = needle.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (compact.length >= 2) idx = hay.indexOf(compact);
  }
  if (idx < 0) return undefined;
  const end = Math.min(hay.length, idx + needle.length);
  const used = new Set<number>();
  for (let k = idx; k < end && k < map.length; k++) {
    if (!map[k].gap) used.add(map[k].i);
  }
  return unionBox([...used].map((i) => spans[i]));
}

/** Attach accurate bboxes from the PDF text layer when quotes match. */
export async function locateFieldsInPdfBuffer(
  buffer: Buffer,
  fields: ExtractedField[],
): Promise<ExtractedField[]> {
  if (!fields.length) return fields;
  try {
    const byPage = await pageSpansFromBuffer(buffer);
    const pages = [...byPage.keys()].sort((a, b) => a - b);
    return fields.map((f) => {
      const quote = (f.source || f.value || "").trim();
      if (!quote) return f;
      const order = f.bbox?.page ? [f.bbox.page, ...pages.filter((p) => p !== f.bbox!.page)] : pages;
      for (const p of order) {
        const box = findOnPage(byPage.get(p) || [], quote);
        if (box) return { ...f, bbox: box };
      }
      const value = f.value.trim();
      if (value && value !== quote) {
        for (const p of order) {
          const box = findOnPage(byPage.get(p) || [], value);
          if (box) return { ...f, bbox: box };
        }
      }
      return f;
    });
  } catch (e) {
    console.warn("[locate-pdf] failed:", e);
    return fields;
  }
}
