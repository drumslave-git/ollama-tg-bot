import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import {
  createSummariesScheduler,
  summarizeChatDay,
  type SummariesScheduler,
} from "../features/summaries/index.js";
import {
  getSummariesModuleConfig,
  getLastSummarizedDate,
  setLastSummarizedDate,
} from "../features/summaries/db/index.js";
import { listDistinctHistoryChatIds } from "../db/history/index.js";
import { getMessageQueueSize } from "./message-queue.js";

let scheduler: SummariesScheduler | null = null;

/** Start the daily history-summary scheduler. Called once at startup. */
export function startSummariesScheduler(): void {
  if (scheduler) return;
  scheduler = createSummariesScheduler({
    timezone: config.timezone,
    getConfig: getSummariesModuleConfig,
    getQueueSize: getMessageQueueSize,
    listChatIds: async () =>
      (await listDistinctHistoryChatIds()).map((id) => String(id)),
    getLastSummarizedDate,
    setLastSummarizedDate,
    summarizeChatDay,
    logEvent: (event, fields) => logEvent(event, fields as never),
    logEventError: (event, err, fields) =>
      logEventError(event, err, fields as never),
  });
  scheduler.start();
}

export function stopSummariesScheduler(): void {
  scheduler?.stop();
  scheduler = null;
}
