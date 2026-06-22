import {
  createMemoryQueueScheduler,
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
  configureMemoryJobDebugStats,
  getMemoryJobScheduledRunAt,
} from "../features/memory/index.js";
import { createVisionQueueScheduler } from "../features/vision/index.js";
import {
  configureVisionJobDebugStats,
  getVisionJobScheduledRunAt,
} from "../features/vision/index.js";
import { responseFormatForThinking } from "../shared/index.js";
import { isBase64MediaHistoryContent } from "../features/history/index.js";
import {
  getMemoryChatFingerprint,
  getMemoryModuleConfig,
  setMemoryChatFingerprint,
} from "../features/memory/db/index.js";
import { getVisionModuleConfig } from "../features/vision/db/index.js";
import {
  getHistory,
  listHistoryChatKeys,
  mapHistoryBase64Media,
} from "../db/history/index.js";
import { getSettings } from "../db/index.js";
import { replaceGeneralFacts } from "../db/memory/general.js";
import { replaceGroupFacts } from "../db/memory/group.js";
import { getUserFacts, replaceUserFacts } from "../db/memory/user.js";
import { getGroupFacts } from "../db/memory/group.js";
import { getGeneralFacts } from "../db/memory/general.js";
import { chatComplete } from "../llm/client.js";
import { config } from "../config/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { createPipelineServices } from "../pipeline/services.js";
import type { PipelineHostServices } from "../contracts/index.js";
import { loadChatParticipants } from "../pipeline/chat-messages.js";
import { getMessageQueueSize } from "./message-queue.js";
import {
  setMemoryJobStatus,
  setMemoryJobRunAt,
  setVisionJobStatus,
  setVisionJobRunAt,
} from "./pipeline-status.js";

let pipelineServices: PipelineHostServices | null = null;

function getPipelineServices(): PipelineHostServices {
  pipelineServices ??= createPipelineServices();
  return pipelineServices;
}

type QueueScheduler = { onQueueActivity(): void };

let memoryScheduler: QueueScheduler | null = null;
let visionScheduler: QueueScheduler | null = null;

/**
 * Wire the debounced background-job schedulers. Called once at startup.
 * Kept out of module top-level so importing this file has no side effects
 * (avoids import-order traps in the feature/runtime dependency graph).
 */
export function initQueueSchedulers(): void {
  if (memoryScheduler && visionScheduler) return;

  configureVisionJobDebugStats(
    () => {
      let pendingMediaRows = 0;
      let chatsWithPending = 0;
      for (const chatKey of listHistoryChatKeys(100)) {
        const pending = getHistory(chatKey).filter((row) =>
          isBase64MediaHistoryContent(row.content),
        ).length;
        if (pending > 0) {
          pendingMediaRows += pending;
          chatsWithPending += 1;
        }
      }
      return { pendingMediaRows, chatsWithPending };
    },
    () => {
      setVisionJobRunAt(getVisionJobScheduledRunAt());
      void import("../dashboard/live-events.js").then(({ emitStatsUpdated }) => {
        emitStatsUpdated();
      });
    },
  );

  configureMemoryJobDebugStats(() => {
    setMemoryJobRunAt(getMemoryJobScheduledRunAt());
    void import("../dashboard/live-events.js").then(({ emitStatsUpdated }) => {
      emitStatsUpdated();
    });
  });

  memoryScheduler = createMemoryQueueScheduler({
  getQueueSize: getMessageQueueSize,
  getConfig: getMemoryModuleConfig,
  listHistoryChatKeys,
  getHistory,
  getChatFingerprint: getMemoryChatFingerprint,
  setChatFingerprint: setMemoryChatFingerprint,
  loadChatParticipants,
  getUserFacts,
  getGroupFacts,
  getGeneralFacts,
  memoryCallbacks: {
    replaceUserFacts,
    replaceGroupFacts,
    replaceGeneralFacts,
    getUserFacts,
  },
  buildPersistConfig: () => {
    const settings = getSettings();
    const thinkingEnabled = Boolean(settings.thinkingEnabled);
    const extractFormat = responseFormatForThinking(
      MEMORY_EXTRACT_RESPONSE_FORMAT,
      thinkingEnabled,
    );
    const mergeFormat = responseFormatForThinking(
      MEMORY_MERGE_RESPONSE_FORMAT,
      thinkingEnabled,
    );
    return {
      model: settings.model,
      llmTimeoutSec: settings.chatTimeoutSec,
      extract: {
        baseUrl: config.llmBaseUrl,
        model: settings.model,
        apiKey: config.llmApiKey || undefined,
        numPredict: MEMORY_EXTRACT_NUM_PREDICT,
        thinkingEnabled,
        chatComplete: getPipelineServices().llm.createAuxiliaryChatComplete({
          numPredict: MEMORY_EXTRACT_NUM_PREDICT,
          think: true,
          responseFormat: extractFormat,
          traceLabel: "memory extract (debounced)",
        }),
      },
      merge: {
        baseUrl: config.llmBaseUrl,
        model: settings.model,
        apiKey: config.llmApiKey || undefined,
        numPredict: MEMORY_MERGE_NUM_PREDICT,
        thinkingEnabled,
        chatComplete: getPipelineServices().llm.createAuxiliaryChatComplete({
          numPredict: MEMORY_MERGE_NUM_PREDICT,
          think: true,
          responseFormat: mergeFormat,
          traceLabel: "memory merge (debounced)",
        }),
      },
    };
  },
  onStatusChange: setMemoryJobStatus,
  logEvent: (event, fields) => logEvent(event, fields as never),
  logEventError: (event, err, fields) =>
    logEventError(event, err, fields as never),
});

  visionScheduler = createVisionQueueScheduler({
  getQueueSize: getMessageQueueSize,
  getConfig: getVisionModuleConfig,
  listHistoryChatKeys,
  getHistory,
  mapHistoryBase64Media,
  buildDescribeConfig: () => {
    const settings = getSettings();
    return {
      model: settings.model,
      llmTimeoutSec: settings.chatTimeoutSec,
      chatComplete: (messages, opts) =>
        chatComplete(messages, {
          numPredict: opts.numPredict,
          auxiliary: opts.auxiliary,
          traceLabel: opts.traceLabel ?? "vision describe (backfill)",
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
  memoryScheduler?.onQueueActivity();
  visionScheduler?.onQueueActivity();
}

export function onQueueDrained(): void {
  onQueueActivity();
}
