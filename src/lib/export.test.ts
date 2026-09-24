import { describe, expect, it } from "vitest";
import type { ExtractResponse } from "../../shared/types.ts";
import { toCabaneMarkdown, toNotionMarkdown, toSheetsCsv } from "./export.ts";

const sample: ExtractResponse = {
  documentType: "invoice",
  plainText: "Total due $12",
  fields: [
    {
      key: "total",
      value: '$1,240.00, "quoted"',
      source: "Total due $1,240.00",
      confidence: "high",
      bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04, page: 1 },
    },
  ],
  json: { _document_type: "invoice", total: { value: "$1,240.00" } },
};

describe("toSheetsCsv", () => {
  it("includes UTF-8 BOM and escapes commas/quotes", () => {
    const csv = toSheetsCsv(sample);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("key,value,source,confidence,page");
    expect(csv).toContain('"$1,240.00, ""quoted"""');
    expect(csv).toContain(",1");
  });
});

describe("toNotionMarkdown", () => {
  it("renders a markdown table and plain text fence", () => {
    const md = toNotionMarkdown(sample);
    expect(md).toContain("# invoice");
    expect(md).toContain("| total |");
    expect(md).toContain("```\nTotal due $12\n```");
  });
});

describe("toCabaneMarkdown", () => {
  it("includes field sections, locate, and JSON", () => {
    const md = toCabaneMarkdown(sample);
    expect(md).toContain("# Sift extraction: invoice");
    expect(md).toContain("### `total`");
    expect(md).toContain("page 1");
    expect(md).toContain('"total"');
  });
});
