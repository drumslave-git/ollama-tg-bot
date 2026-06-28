import {
  isBase64MediaHistoryContent,
  parseBase64MediaHistoryContent,
  replaceBase64WithVisionDescription,
  type StoredMessage,
} from "../history/index.js";
import { describeVisionImages, type VisionDescribeConfig } from "./describe.js";
import type { VisionConfig } from "./config.js";
import { visionJobDebug } from "./job-debug.js";
import { beginJobProcessing } from "../../debug/job-report.js";

function backfillSummary(
  backfilled: number,
  failed: number,
  interrupted: boolean,
): string {
  const parts = [`${backfilled} backfilled`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (interrupted) parts.push("interrupted");
  return parts.join(", ");
}

export type VisionJobStatus = "idle" | "scheduled" | "running";

export interface VisionQueueSchedulerDeps {
  getQueueSize: () => number;
  getConfig: () => Promise<VisionConfig>;
  listHistoryChatKeys: (limit: number) => Promise<string[]>;
  getHistory: (chatKey: string) => Promise<StoredMessage[]>;
  mapHistoryBase64Media: (
    convKey: string,
    isBase64Media: (content: string) => boolean,
    replace: (content: string) => string | null,
  ) => Promise<number>;
  buildDescribeConfig: () => Promise<
    VisionDescribeConfig & {
      model: string;
      llmTimeoutSec: number;
    }
  >;
  onStatusChange?: (status: VisionJobStatus) => void;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
  logEventError?: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

export function createVisionQueueScheduler(deps: VisionQueueSchedulerDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let status: VisionJobStatus = "idle";
  let abort = false;

  function setStatus(next: VisionJobStatus): void {
    status = next;
    visionJobDebug.setStatus(next);
    deps.onStatusChange?.(next);
  }

  async function runJob(): Promise<void> {
    if (deps.getQueueSize() > 0) return;
    setStatus("running");
    const report = await beginJobProcessing("vision");
    abort = false;
    deps.logEvent?.("vision_backfill_started", {});

    let backfilled = 0;
    let failed = 0;
    let interrupted = false;

    try {
      // The describe config's chatComplete forwards traceTurnId, so the backfill
      // LLM call's request/response are captured as entries on this run.
      const describeConfig: VisionDescribeConfig = {
        ...(await deps.buildDescribeConfig()),
      };

      const convKeys = await deps.listHistoryChatKeys(50);
      report?.note("Scan chats", `Found ${convKeys.length} recent chat(s)`);
      for (const convKey of convKeys) {
        if (deps.getQueueSize() > 0 || abort) {
          interrupted = true;
          break;
        }

        const messages = await deps.getHistory(convKey);
        for (const row of messages) {
          if (deps.getQueueSize() > 0 || abort) {
            interrupted = true;
            break;
          }
          if (!isBase64MediaHistoryContent(row.content)) continue;

          const parsed = parseBase64MediaHistoryContent(row.content);
          if (!parsed) continue;

          const description = await describeVisionImages(
            {
              images: [{ base64: parsed.base64, mimeHint: parsed.mimeHint }],
              traceTurnId: report?.traceId,
              logContext: { convKey, backfill: true },
            },
            describeConfig,
          );
          if (!description) {
            failed += 1;
            report?.note(`Describe failed · ${convKey}`, parsed.mediaKind);
            continue;
          }

          await deps.mapHistoryBase64Media(
            convKey,
            (content) => content === row.content,
            (content) =>
              replaceBase64WithVisionDescription(content, description),
          );
          backfilled += 1;
          report?.note(
            `Backfilled · ${convKey}`,
            `${parsed.mediaKind} · ${description.length} chars`,
          );
        }
      }
      if (interrupted) report?.note("Interrupted", "Queue activity resumed");
      deps.logEvent?.("vision_backfill_finished", {});
      report?.complete("processed", {
        summary: backfillSummary(backfilled, failed, interrupted),
      });
    } catch (err) {
      deps.logEventError?.("vision_backfill_failed", err, {});
      report?.complete("error", {
        summary: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (deps.getQueueSize() === 0) setStatus("idle");
    }
  }

  async function schedule(): Promise<void> {
    if (timer) clearTimeout(timer);
    if (deps.getQueueSize() > 0) {
      visionJobDebug.cancelScheduled();
      setStatus("idle");
      return;
    }
    const delayMs = (await deps.getConfig()).backfillDebounceSec * 1000;
    const runAt = new Date(Date.now() + delayMs);
    setStatus("scheduled");
    visionJobDebug.scheduleRun(runAt);
    timer = setTimeout(() => {
      timer = null;
      if (deps.getQueueSize() > 0) {
        setStatus("idle");
        return;
      }
      void runJob();
    }, delayMs);
  }

  return {
    onQueueActivity(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      abort = true;
      if (deps.getQueueSize() > 0) {
        visionJobDebug.cancelScheduled();
        setStatus("idle");
        return;
      }
      void schedule();
    },
    getStatus(): VisionJobStatus {
      return status;
    },
  };
}
