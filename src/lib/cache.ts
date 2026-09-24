import type { ExtractResponse } from "../../shared/types.ts";

const STORAGE_KEY = "sift-extract-cache-v4";
const MAX_ENTRIES = 48;

/** Normalize a document URL so trivial differences don't bust the cache. */
export function normalizeSourceUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // Strip a trailing slash on the path (keep root as "/").
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.href;
  } catch {
    return raw.trim();
  }
}

function readStore(): [string, ExtractResponse][] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is [string, ExtractResponse] =>
        Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && e[1] && typeof e[1] === "object",
    );
  } catch {
    return [];
  }
}

function writeStore(entries: [string, ExtractResponse][]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* quota / private mode — memory cache still works */
  }
}

/** Load persisted cache into a Map (call once on boot). */
export function loadExtractCache(): Map<string, ExtractResponse> {
  return new Map(readStore());
}

/** Upsert one entry and persist (LRU-ish: newest at the end). */
export function persistExtractCache(map: Map<string, ExtractResponse>, key: string, value: ExtractResponse) {
  map.delete(key);
  map.set(key, value);
  // Drop oldest if over cap.
  while (map.size > MAX_ENTRIES) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
  writeStore([...map.entries()]);
}
