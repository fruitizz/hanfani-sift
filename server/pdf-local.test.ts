import { describe, expect, it } from "vitest";
import type { PdfInspectMeta } from "../shared/types.ts";
import { canUseLocalTextRoute, routeFromInspect } from "./pdf-local.ts";

function meta(over: Partial<PdfInspectMeta> = {}): PdfInspectMeta {
  return {
    pdfType: "TextBased",
    pageCount: 2,
    pagesNeedingOcr: [],
    confidence: 0.9,
    processingTimeMs: 12,
    hasEncodingIssues: false,
    ...over,
  };
}

describe("canUseLocalTextRoute", () => {
  it("allows trusted TextBased markdown", () => {
    expect(canUseLocalTextRoute(meta(), "# Hello")).toBe(true);
  });

  it("rejects scans, weak confidence, encoding issues, or empty markdown", () => {
    expect(canUseLocalTextRoute(meta({ pdfType: "Scanned" }), "# Hello")).toBe(false);
    expect(canUseLocalTextRoute(meta({ confidence: 0.4 }), "# Hello")).toBe(false);
    expect(canUseLocalTextRoute(meta({ hasEncodingIssues: true }), "# Hello")).toBe(false);
    expect(canUseLocalTextRoute(meta(), "   ")).toBe(false);
    expect(canUseLocalTextRoute(meta(), undefined)).toBe(false);
  });
});

describe("routeFromInspect", () => {
  it("routes text PDFs to local_text", () => {
    const route = routeFromInspect(meta(), "# Invoice\nTotal: 1");
    expect(route.mode).toBe("local_text");
    if (route.mode === "local_text") {
      expect(route.markdown).toContain("Invoice");
    }
  });

  it("routes scans to vision and keeps optional bytes", () => {
    const route = routeFromInspect(meta({ pdfType: "Scanned" }), undefined, "YmFzZTY0");
    expect(route).toMatchObject({ mode: "vision", pdfBase64: "YmFzZTY0" });
  });
});
