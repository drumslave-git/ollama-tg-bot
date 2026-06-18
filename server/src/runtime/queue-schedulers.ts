import {
  createMemoryQueueScheduler,
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
} from "@llm-tg-bot/modules-memory";
import { createVisionQueueScheduler } from "@llm-tg-bot/modules-vision";
import { configureVisionJobDebugStats } from "@llm-tg-bot/modules-vision";
import { responseFormatForThinking } from "@llm-tg-bot/modules-utils";
import { isBase64MediaHistoryContent } from "@llm-tg-bot/modules-history";
import { getMemoryModuleConfig } from "@llm-tg-bot/modules-memory-db";
import { getVisionModuleConfig } from "@llm-tg-bot/modules-vision-db";
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
import type { PipelineHostServices } from "@llm-tg-bot/modules-registry";
import { loadChatParticipants } from "../pipeline/chat-messages.js";
import { getMessageQueueSize } from "./message-queue.js";
import {
  setMemoryJobStatus,
  setVisionJobStatus,
} from "./pipeline-status.js";

let pipelineServices: PipelineHostServices | null = null;

function getPipelineServices(): PipelineHostServices {
  pipelineServices ??= createPipelineServices();
  return pipelineServices;
}

configureVisionJobDebugStats(() => {
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
});

const memoryScheduler = createMemoryQueueScheduler({
  getQueueSize: getMessageQueueSize,
  getConfig: getMemoryModuleConfig,
  listHistoryChatKeys,
  getHistory,
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

const visionScheduler = createVisionQueueScheduler({
  getQueueSize: getMessageQueueSize,
  getConfig: getVisionModuleConfig,
  listHistoryChatKeys,
  getHistory,
  mapHistoryBase64Media,
  describeConfig: {
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
  },
  onStatusChange: setVisionJobStatus,
  logEvent: (event, fields) => logEvent(event, fields as never),
  logEventError: (event, err, fields) =>
    logEventError(event, err, fields as never),
});

export function onQueueActivity(): void {
  memoryScheduler.onQueueActivity();
  visionScheduler.onQueueActivity();
}

export function onQueueDrained(): void {
  onQueueActivity();
}
