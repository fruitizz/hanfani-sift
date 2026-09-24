import { describe, expect, it } from "vitest";
import { annualTotal, perMonth } from "./pricing.ts";

describe("perMonth", () => {
  it("returns free and custom unchanged", () => {
    expect(perMonth({ monthly: 0 }, true)).toBe(0);
    expect(perMonth({ monthly: 0 }, false)).toBe(0);
    expect(perMonth({ monthly: null }, true)).toBeNull();
  });

  it("keeps list price on monthly billing", () => {
    expect(perMonth({ monthly: 5 }, false)).toBe(5);
  });

  it("applies 2 months free on annual (10/12)", () => {
    expect(perMonth({ monthly: 5 }, true)).toBe(4);
    expect(perMonth({ monthly: 12 }, true)).toBe(10);
  });
});

describe("annualTotal", () => {
  it("bills 10× monthly for paid plans", () => {
    expect(annualTotal({ monthly: 5 })).toBe(50);
    expect(annualTotal({ monthly: 0 })).toBe(0);
    expect(annualTotal({ monthly: null })).toBeNull();
  });
});
