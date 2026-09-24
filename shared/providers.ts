import type { Provider } from "./types.ts";

/** Infer provider from a model id when BYOK provider is omitted (default path). */
export function inferProvider(modelId: string): Provider {
  const id = modelId.trim().toLowerCase();
  if (id.startsWith("deepseek-")) return "deepseek";
  if (id.startsWith("claude-")) return "anthropic";
  if (id.startsWith("gpt-") || id === "o3" || id.startsWith("o1") || id.startsWith("o4")) return "openai";
  if (id.startsWith("gemini-")) return "google";
  if (id.includes("mistral") || id.includes("pixtral") || id.includes("codestral")) return "mistral";
  return "anthropic";
}

/** Canonical provider for a request: explicit BYOK provider wins, else infer from id. */
export function resolveProviderId(modelId: string, explicit?: Provider | null): Provider {
  return explicit ?? inferProvider(modelId);
}

/**
 * Cache / routing identity: same underlying model shares a key whether it was
 * picked from the bundled list (`default`) or BYOK.
 */
export function modelCacheIdentity(modelId: string, explicit?: Provider | null): string {
  return `${resolveProviderId(modelId, explicit)}:${modelId.trim()}`;
}

/** Providers that cannot accept PDF/image vision blocks (text / Markdown only). */
export function isTextOnlyProvider(provider: Provider): boolean {
  return provider === "deepseek";
}

/** True when this model can take image inputs (not necessarily PDF documents). */
export function modelSupportsVision(provider: Provider, modelId: string): boolean {
  if (provider === "deepseek") return false;
  if (provider === "anthropic") return true;
  if (provider === "openai") return modelId === "gpt-4o" || modelId === "gpt-4o-mini" || modelId.startsWith("gpt-4.1");
  if (provider === "google") return true;
  if (provider === "mistral") return modelId.includes("pixtral");
  return false;
}

/** Anthropic-style PDF document blocks (native PDF). Others use Markdown or images. */
export function modelSupportsPdfDocument(provider: Provider): boolean {
  return provider === "anthropic" || provider === "google";
}
