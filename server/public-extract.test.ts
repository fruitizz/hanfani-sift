import { describe, expect, it } from "vitest";
import { ExtractError } from "./errors.ts";
import { buildPublicExtractRequest, inferDocKindFromUrl } from "./public-extract.ts";

describe("inferDocKindFromUrl", () => {
  it("detects pdf vs image from path", () => {
    expect(inferDocKindFromUrl("https://x.com/a.pdf")).toBe("pdf");
    expect(inferDocKindFromUrl("https://x.com/a.PDF?x=1")).toBe("pdf");
    expect(inferDocKindFromUrl("https://x.com/a.png")).toBe("image");
    expect(inferDocKindFromUrl("https://x.com/a.jpg")).toBe("image");
  });
});

describe("buildPublicExtractRequest", () => {
  it("builds a default DeepSeek request for a public PDF", () => {
    const req = buildPublicExtractRequest({
      url: "https://example.com/docs/invoice.pdf",
    });
    expect(req.source).toEqual({
      kind: "url",
      doc: "pdf",
      url: "https://example.com/docs/invoice.pdf",
    });
    expect(req.model).toEqual({ mode: "default", id: "deepseek-v4-flash" });
    expect(req.schema).toEqual({ mode: "auto" });
    expect(req.maxTokens).toBe(8000);
  });

  it("accepts model and max_tokens overrides", () => {
    const req = buildPublicExtractRequest({
      url: "https://example.com/scan.jpg",
      model: "claude-sonnet-4-6",
      max_tokens: "4000",
    });
    expect(req.source.doc).toBe("image");
    expect(req.model.id).toBe("claude-sonnet-4-6");
    expect(req.maxTokens).toBe(4000);
  });

  it("rejects missing/invalid/insecure URLs and private hosts", () => {
    expect(() => buildPublicExtractRequest({})).toThrow(ExtractError);
    expect(() => buildPublicExtractRequest({ url: "not-a-url" })).toThrow(/Invalid url/);
    expect(() => buildPublicExtractRequest({ url: "http://example.com/a.pdf" })).toThrow(/HTTPS/);
    expect(() => buildPublicExtractRequest({ url: "https://127.0.0.1/a.pdf" })).toThrow(/not allowed/);
  });

  it("rejects unsupported extensions and models", () => {
    expect(() => buildPublicExtractRequest({ url: "https://example.com/a.docx" })).toThrow(
      /Unsupported file type/,
    );
    expect(() =>
      buildPublicExtractRequest({
        url: "https://example.com/a.pdf",
        model: "gpt-4o",
      }),
    ).toThrow(/Unsupported model/);
  });

  it("rejects out-of-range max_tokens", () => {
    expect(() =>
      buildPublicExtractRequest({
        url: "https://example.com/a.pdf",
        max_tokens: "10",
      }),
    ).toThrow(/max_tokens/);
  });
});
