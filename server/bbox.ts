import type { ExtractedField } from "../shared/types.ts";

/**
 * Normalize model-returned boxes. Models sometimes emit 0–100 percentages
 * (or occasional pixel-ish values); the UI expects 0–1 fractions.
 */
export function normalizeBBox(
  b: { x: number; y: number; w: number; h: number; page?: number } | undefined,
): ExtractedField["bbox"] | undefined {
  if (!b) return undefined;
  let { x, y, w, h } = b;
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n))) return undefined;
  if (w <= 0 || h <= 0) return undefined;

  if ([x, y, w, h].some((n) => n > 1.5)) {
    x /= 100;
    y /= 100;
    w /= 100;
    h /= 100;
  }

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  x = clamp01(x);
  y = clamp01(y);
  w = clamp01(w);
  h = clamp01(h);
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w <= 0.002 || h <= 0.002) return undefined;

  return {
    x,
    y,
    w,
    h,
    page: Math.max(1, Math.round(Number(b.page) || 1)),
  };
}
