import type { MessageProcessingDetail } from "../db/debug/message-processing.js";

/** Hard cap on any single rendered entry so a giant prompt/response can't blow up the explain prompt. */
const MAX_FIELD_CHARS = 4000;
/** Hard cap on the whole rendered trace, so it leaves room in the context window to answer. */
const MAX_TRACE_CHARS = 18000;

function clip(value: string, max = MAX_FIELD_CHARS): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]`;
}

function indent(value: string): string {
  return value
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

/**
 * Render a message's processing entries as a readable text block for the
 * /explain pass — the model's whole evidence base for what happened on the turn.
 */
export function formatTraceForExplain(detail: MessageProcessingDetail): string {
  const duration =
    detail.totalTimeSpent != null ? ` · ${detail.totalTimeSpent}ms` : "";
  const lines: string[] = [
    `Status: ${detail.status}${duration}`,
    `Triggering message: ${detail.messagePreview || "(none)"}`,
    "",
    "## Processing entries",
  ];

  for (const entry of detail.entries) {
    lines.push(`### ${entry.title}`);
    lines.push(indent(clip(entry.content)));
  }

  return clip(lines.join("\n"), MAX_TRACE_CHARS);
}
