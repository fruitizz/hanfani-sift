import type { DocKind, ExtractRequest } from "../shared/types.ts";
import { ExtractError } from "./errors.ts";
import { CLAUDE_MODELS, DEEPSEEK_MODELS } from "./providers.ts";

/** Extensions the public URL API accepts (matches the UI's supported formats). */
const SUPPORTED_EXT = /(?:\.pdf|\.jpe?g|\.png|\.webp)(?:\?|#|$)/i;

/** Reject loopback / private / link-local hosts (defense-in-depth + clean errors). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "::") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(h) || h.startsWith("fe80:")) return true;
  return false;
}

/** Same catalog as the SPA — keep in sync with src/lib/models.ts. */
export const PUBLIC_MODELS = [...DEEPSEEK_MODELS, ...CLAUDE_MODELS] as const;

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 8000;
const MIN_MAX_TOKENS = 256;
const MAX_MAX_TOKENS = 16000;

export interface PublicExtractQuery {
  url?: string;
  model?: string;
  /** Alias accepted as `max_tokens` or `maxTokens`. */
  max_tokens?: string;
  maxTokens?: string;
}

/**
 * Infer image vs PDF from the URL path — same rule the SPA uses for URL sources.
 */
export function inferDocKindFromUrl(url: string): DocKind {
  return /\.pdf(?:\?|#|$)/i.test(url) ? "pdf" : "image";
}

function parseMaxTokens(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MIN_MAX_TOKENS || n > MAX_MAX_TOKENS) {
    throw new ExtractError(
      `max_tokens must be an integer between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}`,
      400,
    );
  }
  return n;
}

/**
 * Validate public extract query params and build the ExtractRequest runExtraction expects.
 * Default model: DeepSeek V4 Flash (open-source / free path).
 */
export function buildPublicExtractRequest(q: PublicExtractQuery): ExtractRequest {
  const rawUrl = q.url;
  if (!rawUrl?.trim()) {
    throw new ExtractError("Missing url query parameter", 400);
  }

  let target: URL;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    throw new ExtractError("Invalid url", 400);
  }
  if (target.protocol !== "https:") {
    throw new ExtractError("Only HTTPS URLs are supported.", 400);
  }
  if (isBlockedHost(target.hostname)) {
    throw new ExtractError("This host is not allowed.", 400);
  }
  if (!SUPPORTED_EXT.test(target.href) && !SUPPORTED_EXT.test(target.pathname)) {
    throw new ExtractError(
      "Unsupported file type. Use a URL ending in .pdf, .jpg, .jpeg, .png, or .webp",
      400,
    );
  }

  const modelId = (q.model ?? DEFAULT_MODEL).trim();
  if (!(PUBLIC_MODELS as readonly string[]).includes(modelId)) {
    throw new ExtractError(
      `Unsupported model "${modelId}". Use one of: ${PUBLIC_MODELS.join(", ")}`,
      400,
    );
  }

  const maxTokens = parseMaxTokens(q.max_tokens ?? q.maxTokens) ?? DEFAULT_MAX_TOKENS;
  const url = target.href;

  return {
    source: { kind: "url", doc: inferDocKindFromUrl(url), url },
    docType: "auto",
    schema: { mode: "auto" },
    model: { mode: "default", id: modelId },
    maxTokens,
  };
}
