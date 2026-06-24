import type {
  MessageReportDetail,
  ReportDetail,
  ReportPhase,
} from "../db/debug/traces.js";

/** Hard cap on any single rendered field so a giant prompt/response can't blow up the explain prompt. */
const MAX_FIELD_CHARS = 4000;
/** Hard cap on the whole rendered trace, so it leaves room in the context window to answer. */
const MAX_TRACE_CHARS = 18000;

function clip(value: string, max = MAX_FIELD_CHARS): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]`;
}

function formatDetail(detail: ReportDetail): string[] {
  switch (detail.type) {
    case "fields":
      return detail.fields.map((f) => `  - ${f.label}: ${f.value}`);
    case "text":
      return [`  ${detail.title}:`, indent(clip(detail.body))];
    case "mood":
      return [
        `  Mood: ${Object.entries(detail.traits)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`,
      ];
    case "llm": {
      const lines: string[] = [`  Model: ${detail.model}`];
      if (detail.sampling) lines.push(`  Sampling: ${detail.sampling}`);
      for (const section of detail.sections) {
        lines.push(`  ${section.title}:`, indent(clip(section.body)));
      }
      lines.push(`  Output:`, indent(clip(detail.output.content)));
      if (detail.output.reasoning?.trim()) {
        lines.push(`  Reasoning:`, indent(clip(detail.output.reasoning)));
      }
      if (detail.output.toolCalls?.length) {
        lines.push(
          `  Tool calls:`,
          ...detail.output.toolCalls.map(
            (c) => `    - ${c.name}(${clip(c.arguments, 500)})`,
          ),
        );
      }
      return lines;
    }
  }
}

function indent(value: string): string {
  return value
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function formatPhase(phase: ReportPhase): string {
  const head = `### ${phase.title} · ${phase.status}${
    phase.durationMs != null ? ` · ${phase.durationMs}ms` : ""
  }`;
  const lines = [head, `  ${phase.summary}`];
  if (phase.detail) lines.push(...formatDetail(phase.detail));
  return lines.join("\n");
}

function formatRouting(routing: MessageReportDetail["report"]["routing"]): string {
  switch (routing.decision) {
    case "accepted":
      return `Routing: accepted (${routing.triggerLabel}${
        routing.addressSource ? `, via ${routing.addressSource}` : ""
      })`;
    case "ignored":
      return `Routing: ignored (${routing.ignoreLabel})`;
    case "queued":
      return `Routing: queued (#${routing.position})`;
    case "pending":
      return `Routing: ${routing.pendingLabel}`;
  }
}

/**
 * Render a stored message trace as a readable text block for the /explain pass.
 * Covers intake, routing, every phase (including LLM request/response, mood, and
 * memory phases) and the final result — this is the model's whole evidence base.
 */
export function formatTraceForExplain(detail: MessageReportDetail): string {
  const { report } = detail;
  const lines: string[] = [
    `Status: ${report.status} · ${report.durationMs}ms`,
    `Triggering message: ${report.intake.messagePreview || "(none)"}`,
    formatRouting(report.routing),
    "",
    "## Phases",
    ...report.phases.map(formatPhase),
  ];

  const result: string[] = [];
  if (report.result.replyChars != null)
    result.push(`reply chars: ${report.result.replyChars}`);
  if (report.result.chunks != null)
    result.push(`chunks: ${report.result.chunks}`);
  if (report.result.sticker) result.push(`sticker: ${report.result.sticker}`);
  if (report.result.error) result.push(`error: ${report.result.error}`);
  if (result.length > 0) {
    lines.push("", "## Result", `  ${result.join(" · ")}`);
  }

  return clip(lines.join("\n"), MAX_TRACE_CHARS);
}
