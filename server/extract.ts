import type { ExtractRequest, ExtractResponse, ExtractedField } from "../shared/types.ts";
import { normalizeBBox } from "./bbox.ts";
import { ExtractError } from "./errors.ts";
import { callEmitExtraction, type VisionAttachment } from "./llm.ts";
import { locateFieldsInPdfBuffer } from "./locate-pdf.ts";
import { loadPdfBuffer, resolvePdfRoute, type PdfRoute } from "./pdf-local.ts";
import { resolveLlm } from "./providers.ts";

export { ExtractError };

/** Full schema for vision / image path (bbox optional — server/client snap Locate). */
const OUTPUT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    document_type: { type: "string" },
    plain_text: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          source_quote: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          bbox: {
            type: "object",
            additionalProperties: false,
            description:
              "Normalized 0–1 box (top-left origin). Optional — omit when unsure; server snaps Locate from text.",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
              page: { type: "integer" },
            },
            required: ["x", "y", "w", "h", "page"],
          },
        },
        required: ["key", "value", "source_quote", "confidence"],
      },
    },
  },
  required: ["document_type", "plain_text", "fields"],
};

/** Lean schema for local Markdown path — no plain_text / bbox (we already have Markdown). */
const TEXT_OUTPUT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    document_type: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          source_quote: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["key", "value", "source_quote", "confidence"],
      },
    },
  },
  required: ["document_type", "fields"],
};

const LOCAL_TEXT_MAX_TOKENS = 2500;
const MARKDOWN_MODEL_CAP = 60_000;

function buildSchemaLines(req: ExtractRequest): string[] {
  const lines: string[] = [];
  if (req.docType !== "auto") lines.push(`The document is expected to be a(n) ${req.docType}.`);

  const s = req.schema;
  if (s.mode === "auto") {
    lines.push('Design a fitting set of fields for this document on your own, then fill "fields" with them.');
  } else if (s.mode === "custom" && s.fields?.length) {
    const spec = s.fields.filter((f) => f.name.trim()).map((f) => `- ${f.name} (${f.type})`).join("\n");
    lines.push('Extract these fields into "fields" (use each name as the key):\n' + spec);
  } else if (s.mode === "json" && s.json) {
    lines.push(
      "Extract the properties described by this JSON schema; use each property name as a field key:\n" +
        JSON.stringify(s.json, null, 2),
    );
  }
  return lines;
}

function buildVisionInstruction(req: ExtractRequest, route: PdfRoute | null): string {
  const lang = req.lang === "fr" ? "French" : "English";
  const lines: string[] = [
    "You are a meticulous document-extraction engine. Call the emit_extraction tool with your result.",
    "Read the attached document and extract exactly what is on it — never invent, guess, or fill in values that are not present. If something is illegible, say so in the value and mark confidence low.",
    `Write "plain_text" as a faithful, human-readable transcription of the whole document, preserving its labels and structure. Use ${lang} for any wording you add; keep proper nouns and printed text verbatim.`,
    'For every extracted value, put the exact supporting snippet from the document in "source_quote", and set "confidence" to high/medium/low.',
    'Omit "bbox" unless you are very sure — Locate is snapped from the PDF text layer server-side.',
  ];

  if (route?.inspect) {
    const { pdfType, pagesNeedingOcr, pageCount } = route.inspect;
    lines.push(
      `PDF preflight (local parser): type=${pdfType}, pages=${pageCount}, pages_needing_ocr=${JSON.stringify(pagesNeedingOcr)}.`,
    );
    if (pagesNeedingOcr.length > 0) {
      lines.push(
        `Focus OCR-quality reading on pages ${pagesNeedingOcr.join(", ")} — other pages already have a native text layer.`,
      );
    }
    if (route.markdown?.trim()) {
      // Cap assist markdown so the vision prompt stays small.
      const md =
        route.markdown.length > MARKDOWN_MODEL_CAP
          ? route.markdown.slice(0, MARKDOWN_MODEL_CAP) + "\n…[truncated]"
          : route.markdown;
      lines.push(
        "A native Markdown extraction of text-bearing pages follows. Prefer it for text pages; use the attached PDF for scanned/image pages:\n\n" +
          md,
      );
    }
  }

  lines.push(...buildSchemaLines(req));
  return lines.join("\n\n");
}

function buildTextInstruction(req: ExtractRequest, markdown: string): string {
  const md =
    markdown.length > MARKDOWN_MODEL_CAP
      ? markdown.slice(0, MARKDOWN_MODEL_CAP) + "\n…[truncated]"
      : markdown;
  const lines: string[] = [
    "You are a fast structured-extraction engine. Call emit_extraction with fields only.",
    "The document was already parsed locally into Markdown (native PDF text — no OCR). Extract structured fields from that Markdown — never invent values.",
    'For every field: exact "source_quote" from the Markdown, and "confidence" high/medium/low.',
    "Do not return plain_text or bbox.",
    "",
    "--- BEGIN DOCUMENT MARKDOWN ---",
    md,
    "--- END DOCUMENT MARKDOWN ---",
  ];
  lines.push(...buildSchemaLines(req));
  return lines.join("\n\n");
}

function mapFields(
  parsed: {
    fields?: {
      key: string;
      value: string;
      source_quote: string;
      confidence: string;
      bbox?: { x: number; y: number; w: number; h: number; page: number };
    }[];
  },
): ExtractedField[] {
  return (parsed.fields || []).map((f) => {
    const field: ExtractedField = {
      key: f.key,
      value: f.value,
      source: f.source_quote,
      confidence: (["high", "medium", "low"].includes(f.confidence)
        ? f.confidence
        : "medium") as ExtractedField["confidence"],
    };
    const normalized = normalizeBBox(f.bbox);
    if (normalized) field.bbox = normalized;
    return field;
  });
}

export async function runExtraction(req: ExtractRequest): Promise<ExtractResponse> {
  if (!req.source) throw new ExtractError("Missing source");
  if (req.source.kind === "url" && !req.source.url) throw new ExtractError("A URL is required for URL sources");
  if (req.source.kind === "upload" && !req.source.data && !req.localMarkdown) {
    throw new ExtractError("File bytes or local Markdown are required for uploads");
  }

  const llm = resolveLlm(req);

  const route = await resolvePdfRoute(req);
  // Prefer local Markdown when the PDF is text-based. Text-only providers
  // (DeepSeek) and chat APIs without PDF document blocks (OpenAI / Mistral)
  // also take Markdown whenever any native text exists (incl. Mixed).
  let useLocalText = route?.mode === "local_text";
  let textMarkdown = useLocalText && route ? route.markdown : undefined;

  const forceText =
    llm.textOnly ||
    (req.source.doc === "pdf" && !llm.supportsPdfDocument);

  if (forceText) {
    if (route?.markdown?.trim()) {
      useLocalText = true;
      textMarkdown = route.markdown;
    } else if (req.localMarkdown?.trim()) {
      useLocalText = true;
      textMarkdown = req.localMarkdown;
    } else if (req.source.doc === "pdf") {
      const hint =
        llm.provider === "deepseek"
          ? "DeepSeek is text-only (open-source default)."
          : `${labelProvider(llm.provider)} cannot read scanned PDFs in this build.`;
      throw new ExtractError(
        `${hint} This file looks scanned/image-based with no native text. Switch to Claude or Gemini (vision/PDF), or use a text-based PDF.`,
        400,
      );
    }
  }

  // Image docs need a vision-capable model unless we somehow have Markdown.
  if (req.source.doc === "image" && !useLocalText && !llm.supportsVision) {
    throw new ExtractError(
      `${labelProvider(llm.provider)} model "${llm.model}" does not support image vision. Pick a vision model (Claude, GPT-4o, Gemini, Pixtral) or use a text PDF.`,
      400,
    );
  }

  if (
    !useLocalText &&
    req.source.kind === "upload" &&
    req.source.doc === "pdf" &&
    !req.source.data
  ) {
    throw new ExtractError("PDF bytes are required for scanned or mixed documents", 400);
  }

  const maxTokens = useLocalText
    ? Math.min(req.maxTokens ?? LOCAL_TEXT_MAX_TOKENS, LOCAL_TEXT_MAX_TOKENS)
    : (req.maxTokens ?? 8000);

  const toolSchema = useLocalText ? TEXT_OUTPUT_SCHEMA : OUTPUT_SCHEMA;
  const instruction = useLocalText
    ? buildTextInstruction(req, textMarkdown!)
    : buildVisionInstruction(req, route);
  const attachment = useLocalText ? null : buildVisionAttachment(req, route);

  const { parsed, usage: llmUsage } = await callEmitExtraction({
    provider: llm.provider,
    model: llm.model,
    apiKey: llm.apiKey,
    maxTokens,
    instruction,
    schema: toolSchema as unknown as Record<string, unknown>,
    useLocalText,
    attachment,
  });

  let fields = mapFields(parsed);

  // Snap Locate boxes to native PDF text geometry whenever we have bytes.
  let locateBuf: Buffer | null = null;
  if (route?.mode === "vision" && route.pdfBase64) {
    locateBuf = Buffer.from(route.pdfBase64, "base64");
  } else if (req.source.doc === "pdf") {
    try {
      locateBuf = await loadPdfBuffer(req);
    } catch {
      locateBuf = null;
    }
  }
  if (locateBuf) {
    fields = locateFieldsInPdfBuffer(locateBuf, fields);
  }

  const plainText = useLocalText ? textMarkdown! : parsed.plain_text || "";

  const json: Record<string, unknown> = { _document_type: parsed.document_type };
  for (const f of fields) {
    const entry: Record<string, unknown> = {
      value: f.value,
      source: f.source,
      confidence: f.confidence,
    };
    if (f.bbox) entry.bbox = f.bbox;
    json[f.key] = entry;
  }

  return {
    documentType: parsed.document_type,
    plainText,
    fields,
    json,
    usage: llmUsage,
    pdfInspect: route?.inspect,
    extractPath: useLocalText ? "local_text" : "vision",
  };
}

function labelProvider(provider: string): string {
  switch (provider) {
    case "deepseek":
      return "DeepSeek";
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google Gemini";
    case "mistral":
      return "Mistral";
    default:
      return provider;
  }
}

function buildVisionAttachment(req: ExtractRequest, route: PdfRoute | null): VisionAttachment | null {
  const { source } = req;
  if (source.doc === "pdf") {
    const pdfData =
      (route?.mode === "vision" && route.pdfBase64) || source.data || undefined;
    if (pdfData) return { kind: "pdf", data: pdfData, mime: "application/pdf" };
    if (source.url) return { kind: "pdf", url: source.url, mime: "application/pdf" };
    return null;
  }
  if (source.kind === "url" && source.url) {
    return { kind: "image", url: source.url, mime: source.mime };
  }
  if (source.data) {
    return { kind: "image", data: source.data, mime: source.mime || "image/png" };
  }
  return null;
}
