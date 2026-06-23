import type {
  MessageReportDetail,
  ReportDetail,
  ReportPhase,
} from "../../api";
import { DebugJsonView } from "../../components/DebugJsonView";
import { cn } from "../../lib/cn";
import { formatDuration, statusClass } from "./debugUtils";

export function buildLogFileContent(detail: MessageReportDetail): string {
  const header = [
    `Debug report #${detail.id}`,
    `Exported: ${new Date().toISOString()}`,
    `Created: ${detail.createdAt}`,
    `Status: ${detail.status}`,
    `Duration: ${detail.report.durationMs}ms`,
    `Chat: ${detail.chatType} · ${detail.chatId}`,
    `Conv key: ${detail.convKey || "—"}`,
    detail.userId ? `User id: ${detail.userId}` : null,
    detail.messageId != null ? `Telegram message id: ${detail.messageId}` : null,
    "",
    detail.report.headline,
    "",
    "--- raw report ---",
    JSON.stringify(detail, null, 2),
  ].filter((line) => line != null);

  return `${header.join("\n")}\n`;
}

export function downloadReportLog(detail: MessageReportDetail): void {
  const text = buildLogFileContent(detail);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = detail.createdAt.slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `debug-${detail.id}-${stamp}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function phaseStatusLabel(status: ReportPhase["status"]): string {
  if (status === "ok") return "OK";
  if (status === "skipped") return "N/A";
  if (status === "waiting") return "Waiting";
  if (status === "failed") return "Failed";
  return status;
}

function phaseStatusColor(status: ReportPhase["status"]): string {
  if (status === "ok") return "text-accent";
  if (status === "failed") return "text-danger";
  if (status === "waiting") return "text-warning";
  return "text-muted";
}

const fieldsGridClass =
  "m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-4 gap-y-3";

const fieldLabelClass =
  "mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted";

const preClass =
  "m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-3 font-mono text-[0.78rem] leading-snug";

const sectionClass =
  "mt-2 overflow-hidden rounded-md border border-border [&_summary]:cursor-pointer [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden [&_summary]:px-2.5 [&_summary]:py-1.5 [&_summary]:text-sm [&_summary]:font-semibold";

function ReportFields({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <dl className={cn(fieldsGridClass, className)}>{children}</dl>;
}

function PhaseDetail({ detail }: { detail: ReportDetail }) {
  if (detail.type === "fields") {
    return (
      <ReportFields>
        {detail.fields.map(({ label, value }) => (
          <div key={label}>
            <dt className={fieldLabelClass}>{label}</dt>
            <dd className="m-0 text-sm">{value}</dd>
          </div>
        ))}
      </ReportFields>
    );
  }

  if (detail.type === "text") {
    return (
      <div>
        <h5 className="m-0 mb-1.5 text-sm text-muted">{detail.title}</h5>
        <pre className={preClass}>{detail.body}</pre>
      </div>
    );
  }

  if (detail.type === "mood") {
    return (
      <ReportFields className="pt-2">
        {Object.entries(detail.traits)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([trait, value]) => (
            <div key={trait}>
              <dt className={fieldLabelClass}>{trait}</dt>
              <dd className="m-0 text-sm">{value}</dd>
            </div>
          ))}
      </ReportFields>
    );
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-3 text-xs text-muted">
        <span>{detail.model}</span>
        {detail.sampling ? <span>{detail.sampling}</span> : null}
        {detail.output.meta ? <span>{detail.output.meta}</span> : null}
      </div>
      {detail.requestBody != null ? (
        <details className={sectionClass}>
          <summary>Request body</summary>
          <DebugJsonView value={detail.requestBody} />
        </details>
      ) : null}
      {detail.responseBody != null ? (
        <details className={sectionClass}>
          <summary>Response body</summary>
          <DebugJsonView value={detail.responseBody} />
        </details>
      ) : null}
      {detail.sections.map((section) => (
        <details key={section.title} className={sectionClass}>
          <summary>{section.title}</summary>
          <pre className={cn(preClass, "max-h-[280px] rounded-none border-t border-border")}>
            {section.body}
          </pre>
        </details>
      ))}
      {detail.output.toolCalls && detail.output.toolCalls.length > 0 ? (
        <details className={sectionClass} open>
          <summary>Tool calls ({detail.output.toolCalls.length})</summary>
          <div className="border-t border-border">
            {detail.output.toolCalls.map((call, index) => (
              <div
                key={`${call.name}-${index}`}
                className="border-b border-border/60 px-3 py-2 last:border-b-0"
              >
                <div className="mb-1 font-mono text-sm font-semibold text-accent">
                  {call.name}
                </div>
                <DebugJsonView value={call.arguments || "{}"} />
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {detail.output.content || !detail.output.toolCalls?.length ? (
        <details className={sectionClass}>
          <summary>Output</summary>
          <DebugJsonView value={detail.output.content || "(empty)"} />
        </details>
      ) : null}
      <details className={sectionClass} open={Boolean(detail.output.reasoning)}>
        <summary>
          Reasoning{detail.output.reasoning ? "" : " (none)"}
        </summary>
        <DebugJsonView value={detail.output.reasoning || "(empty)"} />
      </details>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-150 group-open:rotate-90"
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhaseRowBody({
  phase,
  hasDetail,
}: {
  phase: ReportPhase;
  hasDetail: boolean;
}) {
  const isWaiting = phase.status === "waiting";
  return (
    <>
      <span
        className={cn(
          "row-span-2 text-[0.68rem] font-bold uppercase tracking-wide",
          phaseStatusColor(phase.status),
        )}
      >
        {phaseStatusLabel(phase.status)}
      </span>
      <span className="text-sm font-semibold">{phase.title}</span>
      <span className="row-span-2 flex items-center gap-2 text-xs tabular-nums text-muted">
        {phase.durationMs != null ? (
          formatDuration(phase.durationMs)
        ) : isWaiting ? (
          <span className="text-xs uppercase tracking-wide text-warning">
            live
          </span>
        ) : null}
        {hasDetail ? <ChevronIcon /> : null}
      </span>
      <span className="col-start-2 text-sm text-muted">{phase.summary}</span>
    </>
  );
}

const phaseRowGridClass =
  "grid grid-cols-[auto_1fr_auto] grid-rows-2 items-center gap-x-2.5 gap-y-0.5 px-3.5 py-2.5";

export function PhaseRow({ phase }: { phase: ReportPhase }) {
  const isWaiting = phase.status === "waiting";

  if (!phase.detail) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-black/12">
        <div className={phaseRowGridClass}>
          <PhaseRowBody phase={phase} hasDetail={false} />
        </div>
      </div>
    );
  }

  return (
    <details
      className="group overflow-hidden rounded-lg border border-border bg-black/12"
      open={isWaiting}
    >
      <summary
        className={cn(
          phaseRowGridClass,
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <PhaseRowBody phase={phase} hasDetail />
      </summary>
      <div className="border-t border-border px-3.5 pb-3.5">
        <PhaseDetail detail={phase.detail} />
      </div>
    </details>
  );
}

export { statusClass };
