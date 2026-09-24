import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractResponse } from "../../shared/types.ts";
import { loadExtractCache, normalizeSourceUrl, persistExtractCache } from "./cache.ts";

describe("normalizeSourceUrl", () => {
  it("strips hash, lowercases host, and trims trailing slash", () => {
    expect(normalizeSourceUrl(" HTTPS://Example.COM/Docs/A.pdf/#page=2 ")).toBe(
      "https://example.com/Docs/A.pdf",
    );
  });

  it("keeps root slash and returns trimmed junk on parse failure", () => {
    expect(normalizeSourceUrl("https://example.com/")).toBe("https://example.com/");
    expect(normalizeSourceUrl("  not a url  ")).toBe("not a url");
  });
});

describe("persistExtractCache", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  it("upserts newest entries and persists to localStorage", () => {
    const map = new Map<string, ExtractResponse>();
    const value: ExtractResponse = {
      documentType: "invoice",
      plainText: "x",
      fields: [],
      json: { _document_type: "invoice" },
    };
    persistExtractCache(map, "k1", value);
    expect(map.get("k1")).toEqual(value);
    expect(loadExtractCache().get("k1")?.documentType).toBe("invoice");

    persistExtractCache(map, "k1", { ...value, documentType: "receipt" });
    expect([...map.keys()]).toEqual(["k1"]);
    expect(map.get("k1")?.documentType).toBe("receipt");
  });
});
