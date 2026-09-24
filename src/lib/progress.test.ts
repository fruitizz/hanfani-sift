import { describe, expect, it } from "vitest";
import { progressFor, type ExtractPhase } from "./progress.ts";

describe("progressFor", () => {
  it("maps every phase to a monotonic percent", () => {
    const phases: ExtractPhase[] = [
      "idle",
      "reading",
      "classifying",
      "extracting",
      "locating",
      "done",
    ];
    const pcts = phases.map((p) => progressFor(p).pct);
    expect(pcts[0]).toBe(0);
    expect(pcts[pcts.length - 1]).toBe(100);
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i]).toBeGreaterThan(pcts[i - 1]);
    }
  });
});
