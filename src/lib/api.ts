import type { ExtractRequest, ExtractResponse } from "../../shared/types.ts";
import { isStaticBuild } from "./routes.ts";

export async function extract(req: ExtractRequest): Promise<ExtractResponse> {
  // The GitHub Pages build is static files only: there is no /api/extract to
  // reach and no server to hold a provider key. Say so, rather than let the
  // fetch fail with an opaque 404 nobody can act on.
  if (isStaticBuild) {
    throw new Error(
      "Live preview: static files only, so there is no server to hold an API key and no model call. " +
        "Clone the repo and run `npm run dev` to extract for real.",
    );
  }
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = (await res.json()) as ExtractResponse | { error: string };
  if (!res.ok) {
    throw new Error("error" in data ? data.error : `Request failed (${res.status})`);
  }
  return data as ExtractResponse;
}

/** Read a File into raw bytes (preferred over base64 for hashing / WASM inspect). */
export async function readFileBytes(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/** Encode ArrayBuffer → base64 without building a giant intermediate data-URL string. */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Fast non-crypto fingerprint of file bytes for cache keys (FNV-1a over bytes). */
export function fnv1aBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Read a File into { base64, mime, doc }. Prefer readFileBytes + bytesToBase64 for new code. */
export function readFileAsBase64(
  file: File,
): Promise<{ base64: string; mime: string; doc: "image" | "pdf" }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      const mime = file.type || "application/octet-stream";
      resolve({ base64, mime, doc: mime === "application/pdf" ? "pdf" : "image" });
    };
    reader.readAsDataURL(file);
  });
}
