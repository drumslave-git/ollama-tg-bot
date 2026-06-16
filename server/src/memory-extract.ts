import { replaceGeneralFacts } from "./db/general-memory.js";
import { replaceGroupFacts } from "./db/group-memory.js";
import { replaceUserFacts } from "./db/user-memory.js";
import { getMessageReport } from "./message-report.js";
import {
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
  scheduleMemoryPersistence as runMemoryPersistence,
  type MemoryExtractInput,
  type MemoryPersistContext,
} from "@llm-tg-bot/modules-memory";
import {
  hostAuxiliaryChatComplete,
  hostLlmConfig,
  hostLogging,
} from "./module-host.js";

export {
  EXTRACTOR_SYSTEM,
  MEMORY_MERGE_SYSTEM,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  parseMemoryBlock,
  sanitizeMergedMemory,
  parseMemoryExtract,
  splitMergedMemoryFacts,
  extractMemories,
  mergeMemoryDocument,
  memoryExtractModule,
  formatGeneralMemoryForPrompt,
  formatGroupMemoryForPrompt,
  formatUserMemoryForPrompt,
  buildGeneralMemorySection,
  buildGroupMemorySection,
  buildParticipantMemoriesSection,
  type MemoryExtractInput,
  type MemoryExtractResult,
  type MemoryMergeInput,
  type ParticipantMemoryFacts,
} from "@llm-tg-bot/modules-memory";

function buildMemoryConfig(
  traceTurnId: number | undefined,
  traceLabel: string,
  numPredict: number,
  responseFormat: typeof MEMORY_EXTRACT_RESPONSE_FORMAT | typeof MEMORY_MERGE_RESPONSE_FORMAT,
) {
  return {
    ...hostLlmConfig(),
    numPredict,
    log: hostLogging(),
    chatComplete: hostAuxiliaryChatComplete({
      numPredict,
      think: true,
      responseFormat,
      traceTurnId,
      traceLabel,
    }),
  };
}

/** Run memory extraction and DB writes without blocking the Telegram reply. */
export function scheduleMemoryPersistence(ctx: MemoryPersistContext): void {
  runMemoryPersistence(
    ctx,
    {
      extract: buildMemoryConfig(
        ctx.turnId,
        "memory extract",
        MEMORY_EXTRACT_NUM_PREDICT,
        MEMORY_EXTRACT_RESPONSE_FORMAT,
      ),
      merge: buildMemoryConfig(
        ctx.turnId,
        "memory merge",
        MEMORY_MERGE_NUM_PREDICT,
        MEMORY_MERGE_RESPONSE_FORMAT,
      ),
      log: hostLogging(),
    },
    {
      replaceUserFacts,
      replaceGroupFacts,
      replaceGeneralFacts,
    },
    (report) => {
      if (ctx.turnId != null) {
        getMessageReport(ctx.turnId)?.completeMemory(report);
      }
    },
    (err) => {
      if (ctx.turnId != null) {
        getMessageReport(ctx.turnId)?.completeMemory({
          updated: false,
          scopes: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
}
