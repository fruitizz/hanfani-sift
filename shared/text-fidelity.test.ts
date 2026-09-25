import { describe, expect, it } from "vitest";
import {
  fidelityTokens,
  looksGarbled,
  measureFidelity,
  MIN_DIGIT_FIDELITY,
  MIN_DIGIT_TOKENS,
  MIN_TEXT_FIDELITY,
} from "./text-fidelity.ts";

/** pdf.js's reading of the invoice that exposed the bug. */
const REFERENCE = `INVOICE Acme Supplies Inc. 1200 Harbour Road, Rotterdam, NL
VAT NL8231.44.912.B01 Invoice no. INV-2026-0417 Date 12 Mar 2026
Due date 11 Apr 2026 Terms Net 30 PO number PO-88301
BILLED TO Northwind Logistics BV Keizersgracht 210 1016 DX Amsterdam, NL
Reinforced pallet rack 12 $64.00 $768.00 Anti-slip decking board 40 $6.20 $248.00
Subtotal $1,240.00 VAT 0% reverse charge $0.00 Total due $1,240.00`;

/** What the WASM inspector actually returned for it: bold runs mangled. */
const GARBLED = `**Invoice no.** INV6A9AF69C@H
# INVOICE Date 12 Mar 2026
**Due date** 11 T%A9AF Acme Supplies Inc. **Terms** Net 30
1200 Harbour Road, Rotterdam, NL **PO number** PO-88301 VAT%khIAB@7CC7K@A7U9@
|Northwind Logistics BV|Northwind DC Utrecht|
|Reinforced pallet rack|12|$64.00|$768.00|
|Anti-slip decking board|40|$6.20|$248.00|
## Total due $1,240.00`;

/**
 * A faithful Markdown rendering: the same text, plus the structure Markdown adds.
 * Built from the reference so the fixture cannot drift away from it.
 */
const CLEAN = `<!-- Page 1 -->\n\n# ${REFERENCE.split("\n").join("\n\n")}\n\n|---|---|\n`;

/**
 * The same faithful rendering with the three corruptions the WASM inspector
 * actually produced. Note what survives: "2026" and "0417" still appear
 * elsewhere in the document, which is exactly why the overall ratio hides this.
 */
const GARBLED_FROM_CLEAN = CLEAN.replace("INV-2026-0417", "INV6A9AF69C@H")
  .replace("VAT NL8231.44.912.B01", "VAT%khIAB@7CC7K@A7U9@")
  .replace("Due date 11 Apr 2026", "Due date 11 T%A9AF");

describe("fidelityTokens", () => {
  it("keeps distinctive words and anything carrying a digit", () => {
    const tokens = fidelityTokens("Total due $1,240.00 on 11 Apr 2026");
    expect(tokens).toContain("total");
    expect(tokens).toContain("2026");
    expect(tokens).toContain("240");
  });

  it("drops words under four characters unless they carry a digit", () => {
    expect(fidelityTokens("a of to due vat")).toEqual([]);
    expect(fidelityTokens("b01 no 30")).toEqual(["b01"]);
  });

  it("is case- and punctuation-insensitive, and de-duplicates", () => {
    expect(fidelityTokens("Total, TOTAL. total")).toEqual(["total"]);
  });
});

describe("measureFidelity", () => {
  it("scores a faithful rendering at 1 on both ratios", () => {
    const f = measureFidelity(CLEAN, REFERENCE);
    expect(f.overall).toBe(1);
    expect(f.digits).toBe(1);
    expect(f.inconclusive).toBe(false);
  });

  it("separates the real corruption on digits, where overall would miss it", () => {
    const f = measureFidelity(GARBLED_FROM_CLEAN, REFERENCE);
    // The whole reason there are two thresholds. A font that maps badly mangles
    // a minority of runs, so the overall ratio stays above its own threshold —
    // a single global check would wave this document straight through.
    expect(f.overall).toBeGreaterThanOrEqual(MIN_TEXT_FIDELITY);
    expect(f.digits).toBeLessThan(MIN_DIGIT_FIDELITY);
  });

  it("declines to judge a reference with almost no text in it", () => {
    const f = measureFidelity("", "page 1");
    expect(f.inconclusive).toBe(true);
    expect(f.overall).toBe(1);
  });

  it("ignores the digit ratio until there are enough digit tokens to mean something", () => {
    const prose = Array.from({ length: 20 }, (_, i) => `word${"x".repeat(i + 3)}`).join(" ");
    const f = measureFidelity("", `${prose} 2026`);
    expect(f.digitTokens).toBeLessThan(MIN_DIGIT_TOKENS);
    expect(f.digits).toBe(1);
  });
});

describe("looksGarbled", () => {
  it("catches the mangled Markdown that started this", () => {
    expect(looksGarbled(GARBLED, REFERENCE)).toBe(true);
    expect(looksGarbled(GARBLED_FROM_CLEAN, REFERENCE)).toBe(true);
  });

  it("passes a faithful rendering", () => {
    expect(looksGarbled(CLEAN, REFERENCE)).toBe(false);
  });

  it("passes Markdown that adds structure the reference has no idea about", () => {
    expect(looksGarbled(`${CLEAN}\n\n<!-- Page 2 -->\n| a | b |`, REFERENCE)).toBe(false);
  });

  it("treats empty Markdown against a real document as garbled", () => {
    expect(looksGarbled(undefined, REFERENCE)).toBe(true);
    expect(looksGarbled("   ", REFERENCE)).toBe(true);
  });

  it("never blames the Markdown when pdf.js read nothing", () => {
    // A scan has no text layer; that is not evidence against the inspector.
    expect(looksGarbled(CLEAN, "")).toBe(false);
    expect(looksGarbled(undefined, "")).toBe(false);
    expect(looksGarbled(undefined, "page 1 of 2")).toBe(false);
  });
});
