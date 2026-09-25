/**
 * Browser-side pdf-inspector (WASM). Classifies PDFs and extracts Markdown locally
 * so text-based files never need a full OCR/vision round-trip.
 */

import init, { processPdf } from "@firecrawl/pdf-inspector-wasm";
import * as pdfjs from "pdfjs-dist";
import type { PdfInspectMeta } from "../../shared/types.ts";
import { FIDELITY_SAMPLE_PAGES, looksGarbled } from "../../shared/text-fidelity.ts";
import { proxied } from "./routes.ts";

// Same worker as PreviewPane — pdf.js de-dupes GlobalWorkerOptions.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const TEXT_ROUTE_MIN_CONFIDENCE = 0.6;

export interface LocalPdfInspect {
  inspect: PdfInspectMeta;
  markdown?: string;
  /** Set when the WASM Markdown was discarded for pdf.js's reading of the page. */
  markdownSource?: "pdf-inspector" | "pdfjs-fallback";
}

/**
 * The document's text as pdf.js reads it — an independent second opinion on the
 * WASM Markdown. Sampled from the front: a font that maps badly does so at once,
 * and parsing every page of a long PDF to check would cost more than it saves.
 * Returns "" when pdf.js cannot read it either, which the caller treats as
 * "no opinion" rather than as a verdict.
 */
async function referenceText(bytes: Uint8Array): Promise<string> {
  let doc: pdfjs.PDFDocumentProxy | null = null;
  try {
    doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pages = Math.min(FIDELITY_SAMPLE_PAGES, doc.numPages);
    const out: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    return out.join("\n");
  } catch {
    return "";
  } finally {
    void doc?.destroy();
  }
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

  // Cross-check against pdf.js before trusting the Markdown. pdf.js gets its own
  // copy: getDocument can detach the buffer it is handed.
  const reference = await referenceText(data.slice());
  if (looksGarbled(markdown, reference)) {
    // Not an encoding issue any more: pdf.js read this document fine, so the
    // document stays on the cheap text route — with pdf.js's text, not the
    // inspector's. Flat instead of laid out, and correct instead of neither.
    return { inspect, markdown: reference, markdownSource: "pdfjs-fallback" };
  }
  return { inspect, markdown, markdownSource: markdown ? "pdf-inspector" : undefined };
}

/** Fetch a same-origin proxied URL and inspect it (for URL PDF sources). */
export async function inspectPdfFromUrl(url: string): Promise<LocalPdfInspect | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return await inspectPdfBytes(buf);
  } catch {
    return null;
  }
}
