/**
 * Local PDF classify + Markdown extraction via Firecrawl pdf-inspector (Rust/napi).
 * Routes text-based PDFs away from the vision/OCR path.
 */

import { processPdf } from "@firecrawl/pdf-inspector";
import type { ExtractRequest, PdfInspectMeta } from "../shared/types.ts";
import { FIDELITY_SAMPLE_PAGES, looksGarbled } from "../shared/text-fidelity.ts";
import { ExtractError } from "./errors.ts";
import { FETCH_MAX_BYTES, isBlockedHost } from "./net.ts";

const TEXT_ROUTE_MIN_CONFIDENCE = 0.6;

export type PdfRoute =
  | { mode: "local_text"; markdown: string; inspect: PdfInspectMeta }
  | {
      mode: "vision";
      markdown?: string;
      inspect: PdfInspectMeta;
      /** When set, attach these bytes to Claude instead of re-fetching a URL. */
      pdfBase64?: string;
    };

function toMeta(result: {
  pdfType: string;
  pageCount: number;
  pagesNeedingOcr: number[];
  confidence: number;
  processingTimeMs: number;
  hasEncodingIssues: boolean;
  title?: string | null;
}): PdfInspectMeta {
  return {
    pdfType: result.pdfType as PdfInspectMeta["pdfType"],
    pageCount: result.pageCount,
    pagesNeedingOcr: result.pagesNeedingOcr,
    confidence: result.confidence,
    processingTimeMs: result.processingTimeMs,
    hasEncodingIssues: result.hasEncodingIssues,
    title: result.title ?? undefined,
  };
}

/**
 * True when native text is trustworthy enough to skip sending the PDF to the model.
 * Key off pdfType + confidence + Markdown — pagesNeedingOcr can still be non-empty
 * on some TextBased docs (library heuristics); Mixed/Scanned always take vision.
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

/** pdf.js is only ever needed to second-guess the inspector — load it on demand. */
let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

/**
 * The document's text as pdf.js reads it, sampled from the front. An independent
 * second opinion on the inspector's Markdown; "" means pdf.js had no opinion
 * either, which the caller must not read as a verdict.
 */
async function referenceText(buffer: Buffer): Promise<string> {
  try {
    pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjs = await pdfjsPromise;
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      isEvalSupported: false,
    }).promise;
    try {
      const pages = Math.min(FIDELITY_SAMPLE_PAGES, doc.numPages);
      const out: string[] = [];
      for (let i = 1; i <= pages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      }
      return out.join("\n");
    } finally {
      void doc.destroy();
    }
  } catch {
    return "";
  }
}

/**
 * Run pdf-inspector on PDF bytes, then check its Markdown against pdf.js before
 * handing it on. The inspector can return mangled text while reporting full
 * confidence (see shared/text-fidelity.ts); when it does, pdf.js's flat reading
 * of the same bytes is the better answer, and the document stays off vision.
 */
export async function inspectPdfBuffer(buffer: Buffer): Promise<{
  inspect: PdfInspectMeta;
  markdown?: string;
  markdownSource?: "pdf-inspector" | "pdfjs-fallback";
}> {
  const result = processPdf(buffer);
  const inspect = toMeta(result);
  const markdown = result.markdown?.trim() ? result.markdown : undefined;

  const reference = await referenceText(buffer);
  if (looksGarbled(markdown, reference)) {
    console.warn("[pdf-local] inspector Markdown failed the pdf.js cross-check — using pdf.js text");
    return { inspect, markdown: reference, markdownSource: "pdfjs-fallback" };
  }
  return { inspect, markdown, markdownSource: markdown ? "pdf-inspector" : undefined };
}

/** Decide local Markdown vs vision/OCR routing from an inspect result. */
export function routeFromInspect(
  inspect: PdfInspectMeta,
  markdown: string | undefined,
  pdfBase64?: string,
): PdfRoute {
  if (canUseLocalTextRoute(inspect, markdown)) {
    return { mode: "local_text", markdown: markdown!, inspect };
  }
  return { mode: "vision", markdown, inspect, pdfBase64 };
}

/**
 * Resolve PDF bytes for inspection: upload base64, or fetch a public URL.
 */
export async function loadPdfBuffer(req: ExtractRequest): Promise<Buffer | null> {
  const { source } = req;
  if (source.doc !== "pdf") return null;

  if (source.kind === "upload" && source.data) {
    try {
      return Buffer.from(source.data, "base64");
    } catch {
      throw new ExtractError("Invalid PDF base64 payload", 400);
    }
  }

  if (source.kind === "url" && source.url) {
    return fetchPdfBytes(source.url);
  }

  return null;
}

async function fetchPdfBytes(rawUrl: string): Promise<Buffer> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new ExtractError("Invalid document URL", 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new ExtractError("Only http/https URLs are allowed", 400);
  }
  if (isBlockedHost(target.hostname)) {
    throw new ExtractError("This host is not allowed", 400);
  }

  let res: Response;
  try {
    res = await fetch(target.href, {
      redirect: "follow",
      headers: { Accept: "application/pdf,*/*" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch PDF";
    throw new ExtractError(`Could not fetch PDF: ${msg}`, 502);
  }
  if (!res.ok) {
    throw new ExtractError(`PDF fetch failed (${res.status})`, 502);
  }

  const len = Number(res.headers.get("content-length") || 0);
  if (len > FETCH_MAX_BYTES) {
    throw new ExtractError("PDF exceeds the 40 MB size limit", 400);
  }

  const ab = await res.arrayBuffer();
  if (ab.byteLength > FETCH_MAX_BYTES) {
    throw new ExtractError("PDF exceeds the 40 MB size limit", 400);
  }
  return Buffer.from(ab);
}

/**
 * Prefer a trusted client WASM result when present; otherwise inspect server-side.
 * Client results are only trusted for the text route when markdown is non-empty.
 */
export async function resolvePdfRoute(req: ExtractRequest): Promise<PdfRoute | null> {
  if (req.source.doc !== "pdf") return null;

  const clientMd = req.localMarkdown?.trim();
  const clientInspect = req.pdfInspect;
  if (clientInspect && clientMd && canUseLocalTextRoute(clientInspect, clientMd)) {
    return { mode: "local_text", markdown: clientMd, inspect: clientInspect };
  }

  const buffer = await loadPdfBuffer(req);
  if (!buffer) {
    // No bytes (e.g. URL we couldn't fetch) — fall through to Claude URL document.
    if (clientInspect) {
      return routeFromInspect(clientInspect, clientMd);
    }
    return null;
  }

  const pdfBase64 = buffer.toString("base64");
  try {
    const { inspect, markdown } = await inspectPdfBuffer(buffer);
    // Prefer richer server markdown; fall back to client if server returned none.
    return routeFromInspect(inspect, markdown ?? clientMd, pdfBase64);
  } catch (e) {
    // Inspector failure must not block extraction — vision path still works.
    console.warn("[pdf-local] inspect failed, falling back to vision:", e);
    if (clientInspect) return routeFromInspect(clientInspect, clientMd, pdfBase64);
    return {
      mode: "vision",
      markdown: clientMd,
      inspect: {
        pdfType: "Scanned",
        pageCount: 0,
        pagesNeedingOcr: [],
        confidence: 0,
        processingTimeMs: 0,
        hasEncodingIssues: false,
      },
      pdfBase64,
    };
  }
}
