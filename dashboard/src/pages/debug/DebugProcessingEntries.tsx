import type {
  JobRunDetail,
  MessageProcessingDetail,
  ProcessingEntry,
} from "../../api";
import { DebugJsonView } from "../../components/DebugJsonView";
import { formatTime } from "./debugUtils";

const preClass =
  "m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-3 font-mono text-[0.78rem] leading-snug";

const rowHeadClass =
  "grid grid-cols-[1fr_auto] items-center gap-x-3 px-3.5 py-2.5";

export function EntryRow({ entry }: { entry: ProcessingEntry }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black/12">
      <div className={rowHeadClass}>
        <span className="text-sm font-semibold">{entry.title}</span>
        <span className="flex items-center gap-2 text-xs tabular-nums text-muted">
          <span className="rounded-full bg-slate-400/15 px-1.5 py-0.5 uppercase tracking-wide">
            {entry.type}
          </span>
          {formatTime(entry.createdAt)}
        </span>
      </div>
      <div className="border-t border-border px-3.5 py-3">
        {entry.type === "json" ? (
          <DebugJsonView value={entry.content} collapsed={true} />
        ) : (
          <pre className={preClass}>{entry.content || "(empty)"}</pre>
        )}
      </div>
    </div>
  );
}

export function buildLogFileContent(detail: MessageProcessingDetail): string {
  const header = [
    `Message processing #${detail.id}`,
    `Exported: ${new Date().toISOString()}`,
    `Created: ${detail.createdAt}`,
    `Status: ${detail.status}`,
    detail.totalTimeSpent != null
      ? `Total time: ${detail.totalTimeSpent}ms`
      : null,
    `Chat: ${detail.entityId}`,
    detail.messageId != null
      ? `Telegram message id: ${detail.messageId}`
      : null,
    `Message: ${detail.messagePreview}`,
    "",
    "--- entries ---",
    JSON.stringify(detail.entries, null, 2),
  ].filter((line) => line != null);

  return `${header.join("\n")}\n`;
}

export function downloadProcessingLog(detail: MessageProcessingDetail): void {
  const text = buildLogFileContent(detail);
  downloadLog(`processing-${detail.id}`, detail.createdAt, text);
}

export function buildJobRunLogContent(detail: JobRunDetail): string {
  const header = [
    `Job run #${detail.id} · ${detail.featureId}`,
    `Exported: ${new Date().toISOString()}`,
    `Created: ${detail.createdAt}`,
    `Status: ${detail.status}`,
    detail.totalTimeSpent != null
      ? `Total time: ${detail.totalTimeSpent}ms`
      : null,
    `Summary: ${detail.summary}`,
    "",
    "--- entries ---",
    JSON.stringify(detail.entries, null, 2),
  ].filter((line) => line != null);

  return `${header.join("\n")}\n`;
}

export function downloadJobRunLog(detail: JobRunDetail): void {
  const text = buildJobRunLogContent(detail);
  downloadLog(`${detail.featureId}-run-${detail.id}`, detail.createdAt, text);
}

function downloadLog(prefix: string, createdAt: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = createdAt.slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `${prefix}-${stamp}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
