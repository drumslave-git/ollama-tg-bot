import type { DownloadRecord } from "./tools.js";
import { escapeHtml } from "../../telegram/html.js";

/** Human-readable byte size: GB for ≥1 GB, MB for ≥1 MB, else KB. */
export function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  const gb = mb / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  if (mb >= 1) return `${Math.round(mb)} MB`;
  return `${Math.max(1, Math.round(kb))} KB`;
}

/**
 * Deterministic download report — one entry per file with its source url,
 * filename and size. Built in code (no LLM) so every run reports the same,
 * unambiguous form. Telegram HTML, delivered through `prepareTelegramHtml`.
 */
export function formatDownloadReport(downloads: DownloadRecord[]): string {
  if (downloads.length === 0) return "";

  const header =
    downloads.length === 1
      ? "<b>Downloaded 1 file:</b>"
      : `<b>Downloaded ${downloads.length} files:</b>`;

  const lines = downloads.map((d, i) => {
    const n = downloads.length > 1 ? `${i + 1}. ` : "";
    const attached = d.inline ? "" : " (in downloads folder)";
    return (
      `${n}<b>${escapeHtml(d.filename)}</b> — ${formatSize(d.sizeBytes)}${attached}\n` +
      `${escapeHtml(d.sourceUrl)}`
    );
  });

  return `${header}\n\n${lines.join("\n\n")}`;
}
