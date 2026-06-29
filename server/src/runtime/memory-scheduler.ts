import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import {
  createMemoryScheduler,
  runMemoryConsolidation,
  type MemoryScheduler,
} from "../features/memory/index.js";
import { getMemoryConfig } from "../features/memory/db/index.js";
import { getMessageQueueSize } from "./message-queue.js";
import { setMemoryJobStatus } from "./pipeline-status.js";

let scheduler: MemoryScheduler | null = null;

/** Start the daily memory-consolidation scheduler. Called once at startup. */
export function startMemoryScheduler(): void {
  if (scheduler) return;
  scheduler = createMemoryScheduler({
    timezone: config.timezone,
    getConfig: getMemoryConfig,
    getQueueSize: getMessageQueueSize,
    consolidate: async () => {
      setMemoryJobStatus("running");
      try {
        return await runMemoryConsolidation();
      } finally {
        setMemoryJobStatus("idle");
      }
    },
    logEvent: (event, fields) => logEvent(event, fields as never),
    logEventError: (event, err, fields) =>
      logEventError(event, err, fields as never),
  });
  scheduler.start();
}

export function stopMemoryScheduler(): void {
  scheduler?.stop();
  scheduler = null;
}
