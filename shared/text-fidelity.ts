/**
 * Does the extracted Markdown actually contain the document's text?
 *
 * pdf-inspector reports `hasEncodingIssues` when it knows it struggled, but it
 * can also fail silently: with some subsetted fonts the WASM build emits glyph
 * ids as characters, so `INV-2026-0417` comes out `INV6A9AF69C@H` while the
 * result still claims `confidence: 1` and `hasEncodingIssues: false`. The model
 * then reads the mangled text faithfully and returns a wrong value with a quote
 * that appears to prove it — the worst possible shape for a tool whose whole
 * promise is that every field is checkable.
 *
 * So we don't take the extractor's word for it. pdf.js is already a dependency
 * (it draws the preview) and its text layer is an independent reading of the
 * same bytes: cross-check one against the other, and when the Markdown has lost
 * the document's text, use pdf.js's reading instead. Plainer, but true.
 *
 * Two thresholds rather than one, because the failure is lopsided. A font that
 * maps badly usually mangles a *minority* of runs, so overall coverage barely
 * moves — on the invoice that started this, 0.956. But what it mangles are
 * reference numbers, amounts and dates, and those are the fields anyone
 * actually extracts: coverage over digit-bearing tokens fell to 0.813 while
 * every clean document scores 1.000.
 *
 * Deliberately one-directional: Markdown holding *more* than the reference is
 * fine (headings, table pipes, page markers). Only missing text counts.
 */

/** Below this share of all reference tokens, the Markdown has lost the document. */
export const MIN_TEXT_FIDELITY = 0.85;

/** Below this share of digit-bearing tokens, it has lost the values that matter. */
export const MIN_DIGIT_FIDELITY = 0.9;

/** Fewer digit tokens than this and that ratio is noise — fall back to the global one. */
export const MIN_DIGIT_TOKENS = 8;

/** Pages sampled from the front of the document. A font failure shows up at once. */
export const FIDELITY_SAMPLE_PAGES = 3;

/** Under this many reference tokens there is nothing to conclude — don't judge. */
const MIN_REFERENCE_TOKENS = 12;

/** Lowercase, alphanumerics only — spacing and Markdown syntax must not matter. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The words worth checking: long enough to be distinctive, or carrying a digit
 * (the values that hurt most when corrupted — amounts, dates, reference numbers).
 */
export function fidelityTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    if (raw.length >= 4 || (/[0-9]/.test(raw) && raw.length >= 3)) seen.add(raw);
  }
  return [...seen];
}

export interface TextFidelity {
  /** Share of all reference tokens present in the candidate, 0–1. */
  overall: number;
  /** Same, over digit-bearing tokens only. 1 when there are too few to judge. */
  digits: number;
  /** How many digit-bearing tokens the reference had. */
  digitTokens: number;
  /** True when the reference was too thin to conclude anything. */
  inconclusive: boolean;
}

/** Measure how much of `reference` survives into `candidate`. */
export function measureFidelity(candidate: string, reference: string): TextFidelity {
  const tokens = fidelityTokens(reference);
  const digitTokens = tokens.filter((t) => /[0-9]/.test(t));
  if (tokens.length < MIN_REFERENCE_TOKENS) {
    return { overall: 1, digits: 1, digitTokens: digitTokens.length, inconclusive: true };
  }
  const haystack = normalise(candidate);
  const share = (list: string[]) =>
    list.length ? list.filter((t) => haystack.includes(t)).length / list.length : 1;
  return {
    overall: share(tokens),
    digits: digitTokens.length >= MIN_DIGIT_TOKENS ? share(digitTokens) : 1,
    digitTokens: digitTokens.length,
    inconclusive: false,
  };
}

/**
 * True when the Markdown has lost or mangled too much of the reference text.
 * An empty candidate against a real reference is garbled by definition; a
 * reference we couldn't read is never held against the candidate.
 */
export function looksGarbled(candidate: string | undefined, reference: string): boolean {
  if (!reference.trim()) return false;
  const tokens = fidelityTokens(reference);
  if (tokens.length < MIN_REFERENCE_TOKENS) return false;
  if (!candidate?.trim()) return true;
  const f = measureFidelity(candidate, reference);
  return f.overall < MIN_TEXT_FIDELITY || f.digits < MIN_DIGIT_FIDELITY;
}
