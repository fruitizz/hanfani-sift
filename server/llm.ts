/**
 * Multi-provider structured extraction via emit_extraction-equivalent tool/JSON calls.
 * Anthropic/DeepSeek use the Anthropic SDK; OpenAI / Mistral / Google use HTTP APIs.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "../shared/types.ts";
import { ExtractError } from "./errors.ts";
import { DEEPSEEK_BASE_URL } from "./providers.ts";

export type ExtractionParsed = {
  document_type: string;
  plain_text?: string;
  fields: {
    key: string;
    value: string;
    source_quote: string;
    confidence: string;
    bbox?: { x: number; y: number; w: number; h: number; page: number };
  }[];
};

export type LlmCallResult = {
  parsed: ExtractionParsed;
  usage: { inputTokens: number; outputTokens: number };
};

export type VisionAttachment =
  | { kind: "pdf"; data?: string; url?: string; mime?: string }
  | { kind: "image"; data?: string; url?: string; mime?: string };

type CallArgs = {
  provider: Provider;
  model: string;
  apiKey: string;
  maxTokens: number;
  /** User-facing instruction (includes Markdown for text path). */
  instruction: string;
  schema: Record<string, unknown>;
  useLocalText: boolean;
  attachment?: VisionAttachment | null;
};

export async function callEmitExtraction(args: CallArgs): Promise<LlmCallResult> {
  switch (args.provider) {
    case "deepseek":
    case "anthropic":
      return callAnthropicCompatible(args);
    case "openai":
      return callOpenAiCompatible(args, "https://api.openai.com/v1/chat/completions");
    case "mistral":
      return callOpenAiCompatible(args, "https://api.mistral.ai/v1/chat/completions");
    case "google":
      return callGemini(args);
    default:
      throw new ExtractError(`Unknown provider "${args.provider as string}".`, 501);
  }
}

async function callAnthropicCompatible(args: CallArgs): Promise<LlmCallResult> {
  const client =
    args.provider === "deepseek"
      ? new Anthropic({ apiKey: args.apiKey, baseURL: DEEPSEEK_BASE_URL })
      : new Anthropic({ apiKey: args.apiKey });

  const userContent = args.useLocalText
    ? [{ type: "text" as const, text: args.instruction }]
    : buildAnthropicVisionContent(args);

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens,
      tools: [
        {
          name: "emit_extraction",
          description: args.useLocalText
            ? "Return structured fields extracted from the Markdown document."
            : "Return the faithful, cited extraction of the document.",
          input_schema: args.schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "emit_extraction" },
      messages: [{ role: "user", content: userContent as never }],
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    throw new ExtractError(
      err.message || "Extraction request to the model failed.",
      err.status && err.status >= 400 && err.status < 600 ? err.status : 502,
    );
  }

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new ExtractError("Model returned no structured output.", 502);
  }

  return {
    parsed: toolUse.input as ExtractionParsed,
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    },
  };
}

function buildAnthropicVisionContent(args: CallArgs): unknown[] {
  const att = args.attachment;
  if (!att) {
    return [{ type: "text", text: args.instruction }];
  }
  if (att.kind === "pdf") {
    const source = att.data
      ? { type: "base64", media_type: "application/pdf", data: att.data }
      : att.url
        ? { type: "url", url: att.url }
        : null;
    if (!source) return [{ type: "text", text: args.instruction }];
    return [{ type: "document", source }, { type: "text", text: args.instruction }];
  }
  const imageSource = att.url
    ? { type: "url", url: att.url }
    : { type: "base64", media_type: att.mime || "image/png", data: att.data };
  return [
    { type: "image", source: imageSource },
    { type: "text", text: args.instruction },
  ];
}

async function callOpenAiCompatible(args: CallArgs, endpoint: string): Promise<LlmCallResult> {
  const content = args.useLocalText
    ? args.instruction
    : buildOpenAiVisionContent(args);

  const body = {
    model: args.model,
    max_tokens: args.maxTokens,
    messages: [{ role: "user", content }],
    tools: [
      {
        type: "function",
        function: {
          name: "emit_extraction",
          description: args.useLocalText
            ? "Return structured fields extracted from the Markdown document."
            : "Return the faithful, cited extraction of the document.",
          parameters: args.schema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "emit_extraction" } },
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: {
    error?: { message?: string };
    choices?: {
      message?: {
        tool_calls?: { function?: { name?: string; arguments?: string } }[];
      };
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new ExtractError(
      `${args.provider} returned non-JSON (${res.status}): ${raw.slice(0, 200)}`,
      502,
    );
  }

  if (!res.ok) {
    throw new ExtractError(
      data.error?.message || `${args.provider} request failed (${res.status}).`,
      res.status >= 400 && res.status < 600 ? res.status : 502,
    );
  }

  const toolCall = data.choices?.[0]?.message?.tool_calls?.find(
    (t) => t.function?.name === "emit_extraction",
  );
  const argStr = toolCall?.function?.arguments;
  if (!argStr) {
    throw new ExtractError(`${args.provider} returned no structured tool output.`, 502);
  }

  let parsed: ExtractionParsed;
  try {
    parsed = JSON.parse(argStr) as ExtractionParsed;
  } catch {
    throw new ExtractError(`${args.provider} tool arguments were not valid JSON.`, 502);
  }

  return {
    parsed,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}

function buildOpenAiVisionContent(
  args: CallArgs,
): string | { type: string; text?: string; image_url?: { url: string } }[] {
  const att = args.attachment;
  if (!att || att.kind === "pdf") {
    // OpenAI/Mistral chat tools path: PDF bytes aren't document blocks - caller
    // should prefer local Markdown. Fall back to instruction-only if somehow here.
    return args.instruction;
  }
  const url =
    att.url ||
    (att.data ? `data:${att.mime || "image/png"};base64,${att.data}` : null);
  if (!url) return args.instruction;
  return [
    { type: "text", text: args.instruction },
    { type: "image_url", image_url: { url } },
  ];
}

async function callGemini(args: CallArgs): Promise<LlmCallResult> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent` +
    `?key=${encodeURIComponent(args.apiKey)}`;

  const parts: Record<string, unknown>[] = [];
  if (!args.useLocalText && args.attachment) {
    if (args.attachment.kind === "pdf") {
      if (!args.attachment.data) {
        throw new ExtractError(
          "Gemini needs PDF bytes for vision. Upload the file, or use a text-based PDF / Claude.",
          400,
        );
      }
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: args.attachment.data,
        },
      });
    } else if (args.attachment.kind === "image") {
      if (args.attachment.data) {
        parts.push({
          inline_data: {
            mime_type: args.attachment.mime || "image/png",
            data: args.attachment.data,
          },
        });
      } else if (args.attachment.url) {
        // Gemini prefers inline/file; fetch URL server-side when possible would be
        // heavier - pass the instruction and note the URL for the model text path.
        parts.push({ text: `Document image URL: ${args.attachment.url}` });
      }
    }
  }
  parts.push({ text: args.instruction });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      maxOutputTokens: args.maxTokens,
      responseMimeType: "application/json",
      responseSchema: geminiSchema(args.schema),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new ExtractError(`Google returned non-JSON (${res.status}): ${raw.slice(0, 200)}`, 502);
  }

  if (!res.ok) {
    throw new ExtractError(
      data.error?.message || `Google request failed (${res.status}).`,
      res.status >= 400 && res.status < 600 ? res.status : 502,
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) {
    throw new ExtractError("Google returned no structured output.", 502);
  }

  let parsed: ExtractionParsed;
  try {
    parsed = JSON.parse(text) as ExtractionParsed;
  } catch {
    throw new ExtractError("Google JSON response was not valid.", 502);
  }

  return {
    parsed,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/** Strip JSON Schema keywords Gemini's responseSchema rejects. */
function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "additionalProperties") continue;
      out[k] = walk(v);
    }
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}
