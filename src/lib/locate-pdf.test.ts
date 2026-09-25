import { describe, expect, it } from "vitest";
import { spanBox } from "./locate-pdf.ts";

/** A4 at scale 1, the page the Locate mis-framing was found on. */
const A4 = { width: 595, height: 841.9, scale: 1 };

/**
 * Real pdf.js output for "Northwind Logistics BV" on that invoice: 9pt text,
 * 101.5pt wide, baseline 180.75pt down the page.
 */
const NAME = { tx: [9, 0, 0, -9, 45, 180.75], width: 101.5, height: 9 };

describe("spanBox", () => {
  it("keeps the width pdf.js reported, in page units", () => {
    const box = spanBox(NAME.tx, NAME.width, NAME.height, A4);
    expect(box.w * A4.width).toBeCloseTo(101.5, 1);
  });

  it("does not multiply the width by the point size", () => {
    // The bug: width * hypot(tx[0], tx[1]) made this 913.5pt on a 595pt page,
    // so the frame hit the right edge and was clamped across the whole line.
    const box = spanBox(NAME.tx, NAME.width, NAME.height, A4);
    expect(box.w).toBeLessThan(0.2);
    expect(box.x + box.w).toBeLessThan(1);
  });

  it("straddles the baseline instead of hanging above it", () => {
    const box = spanBox(NAME.tx, NAME.width, NAME.height, A4);
    const top = box.y * A4.height;
    const bottom = (box.y + box.h) * A4.height;
    const baseline = NAME.tx[5];
    expect(top).toBeLessThan(baseline);
    // The old box ended exactly on the baseline, clipping every descender.
    expect(bottom).toBeGreaterThan(baseline);
    // And it stays on its own line: an em and a bit, not two lines' worth.
    expect(bottom - top).toBeLessThan(NAME.height * 1.4);
  });

  it("puts the left edge where pdf.js put it", () => {
    const box = spanBox(NAME.tx, NAME.width, NAME.height, A4);
    expect(box.x * A4.width).toBeCloseTo(45, 1);
  });

  it("gives a zero-width item something clickable rather than nothing", () => {
    const box = spanBox(NAME.tx, 0, NAME.height, A4);
    expect(box.w).toBeGreaterThan(0);
  });

  it("falls back to the item height when the transform carries no scale", () => {
    const box = spanBox([0, 0, 0, 0, 10, 100], 40, 11, A4);
    expect(box.h * A4.height).toBeCloseTo(11 * 1.02, 1);
  });

  it("scales with the viewport", () => {
    const at1 = spanBox(NAME.tx, NAME.width, NAME.height, A4);
    const at2 = spanBox(NAME.tx, NAME.width, NAME.height, {
      width: A4.width * 2,
      height: A4.height * 2,
      scale: 2,
    });
    // Normalized coordinates must not care how big the viewport is.
    expect(at2.w).toBeCloseTo(at1.w, 6);
  });
});
