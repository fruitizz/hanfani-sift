// Shared request/response contract between the React frontend and the Node backend.

export type SourceKind = "url" | "upload";
export type DocKind = "image" | "pdf";

export interface ExtractSource {
  /** "url" → fetch by URL; "upload" → base64 bytes supplied by the browser. */
  kind: SourceKind;
  /** image or pdf — drives the Claude content-block type. */
  doc: DocKind;
  /** Present when kind === "url". */
  url?: string;
  /** Present when kind === "upload": raw base64 (no data: prefix). */
  data?: string;
  /** MIME type, e.g. "image/png" or "application/pdf". */
  mime?: string;
}

export type DocType = "auto" | "intake" | "invoice";

export type SchemaMode = "auto" | "custom" | "json";
export interface CustomField {
  name: string;
  type: string;
}
export interface SchemaConfig {
  mode: SchemaMode;
  /** mode === "custom" */
  fields?: CustomField[];
  /** mode === "json" — a JSON Schema (object) supplied by the user. */
  json?: unknown;
}

export type ModelMode = "default" | "byok";
export type Provider = "deepseek" | "anthropic" | "openai" | "google" | "mistral";
export interface ModelConfig {
  mode: ModelMode;
  /** model id, e.g. "deepseek-v4-flash" or "claude-sonnet-4-6" */
  id: string;
  /** byok only */
  provider?: Provider;
  apiKey?: string;
}

/** pdf-inspector classification (browser WASM or server native). */
export type PdfInspectType = "TextBased" | "Scanned" | "ImageBased" | "Mixed";

export interface PdfInspectMeta {
  pdfType: PdfInspectType;
  pageCount: number;
  /** 1-indexed pages that still need OCR / vision. */
  pagesNeedingOcr: number[];
  confidence: number;
  processingTimeMs: number;
  hasEncodingIssues: boolean;
  title?: string;
}

export interface ExtractRequest {
  source: ExtractSource;
  docType: DocType;
  schema: SchemaConfig;
  model: ModelConfig;
  /** UI language — steers the plain-text readout language when relevant. */
  lang?: "en" | "fr";
  /**
   * Optional Claude max_tokens cap. When omitted, the server uses its default (8000).
   * Used by the public URL API; the SPA does not send this today.
   */
  maxTokens?: number;
  /**
   * Native Markdown from pdf-inspector (client WASM and/or server). When the PDF
   * is TextBased, the server can extract fields from this text and skip sending
   * the full PDF through the vision path.
   */
  localMarkdown?: string;
  /** Classification metadata accompanying localMarkdown. */
  pdfInspect?: PdfInspectMeta;
}

export type Confidence = "high" | "medium" | "low";

/**
 * Normalized bounding box on the source page/image (0–1 relative to page size).
 * `page` is 1-based (images are always page 1).
 */
export interface FieldBBox {
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

export interface ExtractedField {
  key: string;
  value: string;
  source: string;
  confidence: Confidence;
  /** Present when the model could locate the supporting region on the document. */
  bbox?: FieldBBox;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractResponse {
  documentType: string;
  plainText: string;
  fields: ExtractedField[];
  /** Convenience object: { [field.key]: { value, source, confidence } } + _document_type. */
  json: Record<string, unknown>;
  /** Tokens consumed by this extraction, when the provider reports them. */
  usage?: TokenUsage;
  /** How the PDF was routed (local text vs vision). Omitted for images. */
  pdfInspect?: PdfInspectMeta;
  /** `local_text` = parsed in-process; `vision` = model read the PDF/image. */
  extractPath?: "local_text" | "vision";
}

export interface ApiError {
  error: string;
}
