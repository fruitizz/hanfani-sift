import type { ExtractResponse } from "../../shared/types.ts";

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** CSV for Google Sheets / Excel (UTF-8 BOM so Sheets detects encoding). */
export function toSheetsCsv(r: ExtractResponse): string {
  const header = ["key", "value", "source", "confidence", "page"];
  const rows = r.fields.map((f) =>
    [f.key, f.value, f.source, f.confidence, f.bbox ? String(f.bbox.page) : ""].map(csvEscape).join(","),
  );
  return "\uFEFF" + [header.join(","), ...rows].join("\n");
}

/** Notion-friendly markdown page (paste into a new Notion page or import). */
export function toNotionMarkdown(r: ExtractResponse): string {
  const lines = [
    `# ${r.documentType || "Extraction"}`,
    "",
    `Detected type: **${r.documentType}**`,
    "",
    "| Field | Value | Source | Confidence |",
    "| --- | --- | --- | --- |",
  ];
  for (const f of r.fields) {
    const src = (f.source || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const val = (f.value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${f.key} | ${val} | ${src} | ${f.confidence} |`);
  }
  lines.push("", "## Plain text", "", "```", r.plainText, "```", "");
  return lines.join("\n");
}

/**
 * Cabane workspace file - markdown that opens as a readable doc; includes a
 * CSV table block Cabane can also keep as a sibling .csv if the user prefers.
 */
export function toCabaneMarkdown(r: ExtractResponse): string {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const lines = [
    `# Sift extraction: ${r.documentType || "document"}`,
    "",
    `Exported ${stamp} · schema-driven · cited sources`,
    "",
    "## Fields",
    "",
  ];
  for (const f of r.fields) {
    lines.push(`### \`${f.key}\``);
    lines.push("");
    lines.push(`- **Value:** ${f.value}`);
    lines.push(`- **Confidence:** ${f.confidence}`);
    if (f.source) lines.push(`- **Source:** “${f.source}”`);
    if (f.bbox) {
      lines.push(
        `- **Locate:** page ${f.bbox.page} · box (${f.bbox.x.toFixed(3)}, ${f.bbox.y.toFixed(3)}, ${f.bbox.w.toFixed(3)}×${f.bbox.h.toFixed(3)})`,
      );
    }
    lines.push("");
  }
  lines.push("## Plain text", "", "```", r.plainText, "```", "");
  lines.push("## JSON", "", "```json", JSON.stringify(r.json, null, 2), "```", "");
  return lines.join("\n");
}

export type ExportTarget = "cabane" | "notion" | "sheets";

export function exportExtraction(target: ExportTarget, r: ExtractResponse): void {
  if (target === "sheets") {
    download("sift-extraction.csv", toSheetsCsv(r), "text/csv;charset=utf-8");
    return;
  }
  if (target === "notion") {
    download("sift-extraction.notion.md", toNotionMarkdown(r), "text/markdown;charset=utf-8");
    return;
  }
  download("sift-extraction.cabane.md", toCabaneMarkdown(r), "text/markdown;charset=utf-8");
}
