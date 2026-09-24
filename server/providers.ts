/**
 * Resolve which LLM backend to call and which API key to use.
 */

import type { ExtractRequest, Provider } from "../shared/types.ts";
import {
  inferProvider,
  isTextOnlyProvider,
  modelSupportsPdfDocument,
  modelSupportsVision,
  resolveProviderId,
} from "../shared/providers.ts";
import { ExtractError } from "./errors.ts";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";

export const DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
export const CLAUDE_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;

export type BundledModelId =
  | (typeof DEEPSEEK_MODELS)[number]
  | (typeof CLAUDE_MODELS)[number];

export function isDeepSeekModel(id: string): boolean {
  return id.startsWith("deepseek-");
}

export function isClaudeModel(id: string): boolean {
  return id.startsWith("claude-");
}

/** Effective provider for this request (default path infers from model id). */
export function resolveProvider(req: ExtractRequest): Provider {
  return resolveProviderId(
    req.model.id,
    req.model.mode === "byok" ? req.model.provider : undefined,
  );
}

const ENV_KEYS: Record<Provider, string | undefined> = {
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

export function resolveApiKey(req: ExtractRequest, provider: Provider): string {
  if (req.model.mode === "byok") {
    const key = req.model.apiKey?.trim();
    if (!key) {
      throw new ExtractError(`Missing API key for ${provider}.`, 400);
    }
    return key;
  }

  const envName = ENV_KEYS[provider];
  const key = envName ? process.env[envName]?.trim() : undefined;
  if (!key) {
    if (provider === "deepseek") {
      throw new ExtractError(
        "Server is missing DEEPSEEK_API_KEY. Set it in the backend .env (free / open-source default).",
        500,
      );
    }
    if (provider === "anthropic") {
      throw new ExtractError(
        "Server is missing ANTHROPIC_API_KEY (required for Claude vision models). Use DeepSeek for text PDFs, or set the key / BYOK.",
        500,
      );
    }
    throw new ExtractError(
      `Server is missing ${envName} for bundled ${provider} models. Use BYOK with your own key, or pick DeepSeek / Claude.`,
      500,
    );
  }
  return key;
}

export type ResolvedLlm = {
  provider: Provider;
  model: string;
  apiKey: string;
  textOnly: boolean;
  supportsVision: boolean;
  supportsPdfDocument: boolean;
};

export function resolveLlm(req: ExtractRequest): ResolvedLlm {
  const model = req.model.id?.trim() || "deepseek-v4-flash";
  const provider =
    req.model.mode === "byok" && req.model.provider
      ? req.model.provider
      : inferProvider(model);

  return {
    provider,
    model,
    apiKey: resolveApiKey(req, provider),
    textOnly: isTextOnlyProvider(provider),
    supportsVision: modelSupportsVision(provider, model),
    supportsPdfDocument: modelSupportsPdfDocument(provider),
  };
}

/** @deprecated use resolveLlm - kept for any leftover imports */
export function createLlmClient(req: ExtractRequest): {
  model: string;
  provider: Provider;
  apiKey: string;
} {
  const r = resolveLlm(req);
  return { model: r.model, provider: r.provider, apiKey: r.apiKey };
}
