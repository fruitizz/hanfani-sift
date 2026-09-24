import { describe, expect, it } from "vitest";
import { normalizeBBox } from "./bbox.ts";

describe("normalizeBBox", () => {
  it("keeps already-normalized 0–1 boxes", () => {
    expect(normalizeBBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.05, page: 2 })).toEqual({
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.05,
      page: 2,
    });
  });

  it("converts percentage-style coordinates", () => {
    const box = normalizeBBox({ x: 10, y: 20, w: 30, h: 5, page: 1 });
    expect(box).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.05, page: 1 });
  });

  it("clamps overflow and defaults page", () => {
    const box = normalizeBBox({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
    expect(box?.x).toBe(0.9);
    expect(box?.y).toBe(0.9);
    expect(box?.w).toBeCloseTo(0.1);
    expect(box?.h).toBeCloseTo(0.1);
    expect(box?.page).toBe(1);
  });

  it("rejects invalid or tiny boxes", () => {
    expect(normalizeBBox(undefined)).toBeUndefined();
    expect(normalizeBBox({ x: 0, y: 0, w: 0, h: 0.1 })).toBeUndefined();
    expect(normalizeBBox({ x: 0, y: 0, w: 0.001, h: 0.001 })).toBeUndefined();
    expect(normalizeBBox({ x: NaN, y: 0, w: 0.2, h: 0.2 })).toBeUndefined();
  });
});
