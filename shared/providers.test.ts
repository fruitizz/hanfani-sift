import { describe, expect, it } from "vitest";
import {
  inferProvider,
  isTextOnlyProvider,
  modelCacheIdentity,
  modelSupportsPdfDocument,
  modelSupportsVision,
  resolveProviderId,
} from "./providers.ts";

describe("inferProvider", () => {
  it("maps known model families", () => {
    expect(inferProvider("deepseek-v4-flash")).toBe("deepseek");
    expect(inferProvider("claude-sonnet-4-6")).toBe("anthropic");
    expect(inferProvider("gpt-4o")).toBe("openai");
    expect(inferProvider("o3")).toBe("openai");
    expect(inferProvider("gemini-2.5-pro")).toBe("google");
    expect(inferProvider("mistral-large-latest")).toBe("mistral");
    expect(inferProvider("pixtral-large-latest")).toBe("mistral");
  });

  it("defaults unknown ids to anthropic", () => {
    expect(inferProvider("mystery-model")).toBe("anthropic");
  });
});

describe("resolveProviderId / modelCacheIdentity", () => {
  it("lets explicit BYOK provider win", () => {
    expect(resolveProviderId("claude-sonnet-4-6", "openai")).toBe("openai");
  });

  it("shares cache identity for default and BYOK of the same model", () => {
    expect(modelCacheIdentity("deepseek-v4-flash")).toBe("deepseek:deepseek-v4-flash");
    expect(modelCacheIdentity("deepseek-v4-flash", "deepseek")).toBe("deepseek:deepseek-v4-flash");
  });
});

describe("capability flags", () => {
  it("marks DeepSeek text-only", () => {
    expect(isTextOnlyProvider("deepseek")).toBe(true);
    expect(isTextOnlyProvider("anthropic")).toBe(false);
    expect(modelSupportsVision("deepseek", "deepseek-v4-flash")).toBe(false);
  });

  it("detects vision and PDF document support", () => {
    expect(modelSupportsVision("anthropic", "claude-haiku-4-5")).toBe(true);
    expect(modelSupportsVision("openai", "gpt-4o")).toBe(true);
    expect(modelSupportsVision("openai", "o3")).toBe(false);
    expect(modelSupportsVision("mistral", "pixtral-large-latest")).toBe(true);
    expect(modelSupportsVision("mistral", "mistral-large-latest")).toBe(false);
    expect(modelSupportsPdfDocument("anthropic")).toBe(true);
    expect(modelSupportsPdfDocument("google")).toBe(true);
    expect(modelSupportsPdfDocument("openai")).toBe(false);
  });
});
