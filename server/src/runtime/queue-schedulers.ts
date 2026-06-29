import { createVisionQueueScheduler } from "../features/vision/index.js";
import {
  configureVisionJobDebugStats,
  getVisionJobScheduledRunAt,
} from "../features/vision/index.js";
import { getVisionConfig } from "../features/vision/db/index.js";
import {
  getHistory,
  listHistoryChatKeys,
  mapHistoryBase64Media,
} from "../features/history/db/index.js";
import { getSettings } from "../db/index.js";
import { chatComplete } from "../llm/client.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { getMessageQueueSize } from "./message-queue.js";
import { setVisionJobStatus, setVisionJobRunAt } from "./pipeline-status.js";

type QueueScheduler = { onQueueActivity(): void };

let visionScheduler: QueueScheduler | null = null;

/**
 * Wire the debounced background-job schedulers. Called once at startup.
 * Kept out of the file top-level so importing this file has no side effects
 * (avoids import-order traps in the feature/runtime dependency graph).
 *
 * Memory consolidation is no longer debounced here — it runs once daily via the
 * memory scheduler (see runtime/memory-scheduler.ts).
 */
export function initQueueSchedulers(): void {
  if (visionScheduler) return;

  configureVisionJobDebugStats(() => {
    setVisionJobRunAt(getVisionJobScheduledRunAt());
    void import("../dashboard/live-events.js").then(({ emitStatsUpdated }) => {
      emitStatsUpdated();
    });
  });

  visionScheduler = createVisionQueueScheduler({
    getQueueSize: getMessageQueueSize,
    getConfig: getVisionConfig,
    listHistoryChatKeys,
    getHistory,
    mapHistoryBase64Media,
    buildDescribeConfig: async () => {
      const settings = await getSettings();
      return {
        model: settings.model,
        llmTimeoutSec: settings.chatTimeoutSec,
        chatComplete: (messages, opts) =>
          chatComplete(messages, {
            numPredict: opts.numPredict,
            auxiliary: opts.auxiliary,
            traceLabel: opts.traceLabel ?? "vision describe (backfill)",
            traceTurnId: opts.traceTurnId,
          }),
        log: {
          logEvent: (event, fields) => logEvent(event, fields as never),
          logEventError: (event, err, fields) =>
            logEventError(event, err, fields as never),
        },
      };
    },
    onStatusChange: setVisionJobStatus,
    logEvent: (event, fields) => logEvent(event, fields as never),
    logEventError: (event, err, fields) =>
      logEventError(event, err, fields as never),
  });
}

export function onQueueActivity(): void {
  visionScheduler?.onQueueActivity();
}

export function onQueueDrained(): void {
  onQueueActivity();
}
