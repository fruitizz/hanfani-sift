/** Extract pipeline phases shown as an overlay on the document preview. */

export type ExtractPhase =
  | "idle"
  | "reading"
  | "classifying"
  | "extracting"
  | "locating"
  | "done";

export interface ProgressInfo {
  phase: ExtractPhase;
  /** 0–100 approximate. */
  pct: number;
}

const PHASE_PCT: Record<ExtractPhase, number> = {
  idle: 0,
  reading: 12,
  classifying: 28,
  extracting: 62,
  locating: 88,
  done: 100,
};

export function progressFor(phase: ExtractPhase): ProgressInfo {
  return { phase, pct: PHASE_PCT[phase] };
}
