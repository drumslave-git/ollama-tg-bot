import {
  isBase64MediaHistoryContent,
  parseBase64MediaHistoryContent,
  replaceBase64WithVisionDescription,
  type StoredMessage,
} from "@llm-tg-bot/modules-history";
import { describeVisionImages, type VisionDescribeConfig } from "./describe.js";
import type { VisionModuleConfig } from "./module-config.js";

export type VisionJobStatus = "idle" | "scheduled" | "running";

export interface VisionQueueSchedulerDeps {
  getQueueSize: () => number;
  getConfig: () => VisionModuleConfig;
  listHistoryChatKeys: (limit: number) => string[];
  getHistory: (chatKey: string) => StoredMessage[];
  mapHistoryBase64Media: (
    convKey: string,
    isBase64Media: (content: string) => boolean,
    replace: (content: string) => string | null,
  ) => number;
  describeConfig: VisionDescribeConfig;
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
    deps.onStatusChange?.(next);
  }

  async function runJob(): Promise<void> {
    if (deps.getQueueSize() > 0) return;
    setStatus("running");
    abort = false;
    deps.logEvent?.("vision_backfill_started", {});

    try {
      for (const convKey of deps.listHistoryChatKeys(50)) {
        if (deps.getQueueSize() > 0 || abort) break;

        const messages = deps.getHistory(convKey);
        for (const row of messages) {
          if (deps.getQueueSize() > 0 || abort) break;
          if (!isBase64MediaHistoryContent(row.content)) continue;

          const parsed = parseBase64MediaHistoryContent(row.content);
          if (!parsed) continue;

          const description = await describeVisionImages(
            {
              images: [{ base64: parsed.base64, mimeHint: parsed.mimeHint }],
              logContext: { convKey, backfill: true },
            },
            deps.describeConfig,
          );
          if (!description) continue;

          deps.mapHistoryBase64Media(
            convKey,
            (content) => content === row.content,
            (content) =>
              replaceBase64WithVisionDescription(content, description),
          );
        }
      }
      deps.logEvent?.("vision_backfill_finished", {});
    } catch (err) {
      deps.logEventError?.("vision_backfill_failed", err, {});
    } finally {
      if (deps.getQueueSize() === 0) setStatus("idle");
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    if (deps.getQueueSize() > 0) {
      setStatus("idle");
      return;
    }
    setStatus("scheduled");
    const delayMs = deps.getConfig().backfillDebounceSec * 1000;
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
        setStatus("idle");
        return;
      }
      schedule();
    },
    getStatus(): VisionJobStatus {
      return status;
    },
  };
}
