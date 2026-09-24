/**
 * Browser-side pdf-inspector (WASM). Classifies PDFs and extracts Markdown locally
 * so text-based files never need a full OCR/vision round-trip.
 */

import init, { processPdf } from "@firecrawl/pdf-inspector-wasm";
import type { PdfInspectMeta } from "../../shared/types.ts";

const TEXT_ROUTE_MIN_CONFIDENCE = 0.6;

export interface LocalPdfInspect {
  inspect: PdfInspectMeta;
  markdown?: string;
}

let initPromise: Promise<void> | null = null;

function ensureWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = init().then(() => undefined);
  }
  return initPromise;
}

function toMeta(result: {
  pdfType: string;
  pageCount: number;
  pagesNeedingOcr: number[];
  confidence: number;
  processingTimeMs: number;
  hasEncodingIssues: boolean;
  title?: string;
}): PdfInspectMeta {
  return {
    pdfType: result.pdfType as PdfInspectMeta["pdfType"],
    pageCount: result.pageCount,
    pagesNeedingOcr: result.pagesNeedingOcr,
    confidence: result.confidence,
    processingTimeMs: result.processingTimeMs,
    hasEncodingIssues: result.hasEncodingIssues,
    title: result.title,
  };
}

/**
 * True when we can skip uploading/sending the PDF bytes to the vision path.
 * Matches server routing: TextBased + usable Markdown + confidence.
 */
export function canUseLocalTextRoute(
  inspect: PdfInspectMeta,
  markdown: string | undefined,
): boolean {
  return (
    inspect.pdfType === "TextBased" &&
    !!markdown?.trim() &&
    !inspect.hasEncodingIssues &&
    inspect.confidence >= TEXT_ROUTE_MIN_CONFIDENCE
  );
}

/**
 * Classify + extract Markdown from PDF bytes in the browser.
 * Synchronous after WASM init — call while the extract spinner is already up.
 */
export async function inspectPdfBytes(bytes: ArrayBuffer | Uint8Array): Promise<LocalPdfInspect> {
  await ensureWasm();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const result = processPdf(data, { profile: "fidelity", includePageMarkers: true });
  const inspect = toMeta({
    pdfType: result.pdfType,
    pageCount: result.pageCount,
    pagesNeedingOcr: result.pagesNeedingOcr,
    confidence: result.confidence,
    processingTimeMs: result.processingTimeMs,
    hasEncodingIssues: result.hasEncodingIssues,
    title: result.title,
  });
  const markdown = result.markdown?.trim() ? result.markdown : undefined;
  return { inspect, markdown };
}

/** Fetch a same-origin proxied URL and inspect it (for URL PDF sources). */
export async function inspectPdfFromUrl(url: string): Promise<LocalPdfInspect | null> {
  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return await inspectPdfBytes(buf);
  } catch {
    return null;
  }
}
