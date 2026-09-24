import type { Provider } from "../../shared/types.ts";

/**
 * Bundled models. DeepSeek is the open-source default (text PDFs via local Markdown).
 * Claude models need ANTHROPIC_API_KEY and support vision for scans/images.
 */
export const DEFAULT_MODELS: { id: string; label: string }[] = [
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash · free / open-source" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro · open-source, higher quality" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 · vision (scans)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 · fast vision" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 · best vision quality" },
];

/** BYOK model ids per provider (real ids — a select, so no wrong names get typed). */
export const BYOK_MODELS: Record<Provider, string[]> = {
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  mistral: ["mistral-large-latest", "pixtral-large-latest"],
};

/** Short capability hint shown next to BYOK model ids. */
export const BYOK_MODEL_HINTS: Record<string, string> = {
  "deepseek-v4-flash": "text PDFs",
  "deepseek-v4-pro": "text PDFs",
  "claude-opus-4-8": "vision + PDF",
  "claude-sonnet-4-6": "vision + PDF",
  "claude-haiku-4-5": "vision + PDF",
  "gpt-4o": "vision · text PDFs",
  "gpt-4o-mini": "vision · text PDFs",
  o3: "text PDFs",
  "gemini-2.5-pro": "vision + PDF",
  "gemini-2.5-flash": "vision + PDF",
  "mistral-large-latest": "text PDFs",
  "pixtral-large-latest": "vision · text PDFs",
};

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "deepseek", label: "DeepSeek (open-source)" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google Gemini" },
  { id: "mistral", label: "Mistral" },
];

export const DEFAULT_MODEL_ID = "deepseek-v4-flash";
