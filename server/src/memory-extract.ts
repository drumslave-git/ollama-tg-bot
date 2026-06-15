import { replaceGeneralFacts } from "./db/general-memory.js";
import { replaceGroupFacts } from "./db/group-memory.js";
import { replaceUserFacts } from "./db/user-memory.js";
import { logEvent, logEventError } from "./event-log.js";
import { getMessageReport } from "./message-report.js";
import { chatComplete } from "./llm/client.js";
import { config } from "./config.js";
import { getResolvedSettings } from "./settings-runtime.js";
import {
  extractMemories,
  mergeMemoryDocument,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
  splitMergedMemoryFacts,
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  type MemoryExtractInput,
  type MemoryExtractResult,
  type MemoryLlmConfig,
} from "@llm-tg-bot/modules-memory";

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

function buildMemoryLlmConfig(
  traceTurnId: number | undefined,
  traceLabel: string,
  numPredict: number,
  responseFormat: typeof MEMORY_EXTRACT_RESPONSE_FORMAT | typeof MEMORY_MERGE_RESPONSE_FORMAT,
): MemoryLlmConfig {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
    numPredict,
    chatComplete: (messages) =>
      chatComplete(messages, {
        numPredict,
        auxiliary: true,
        think: true,
        responseFormat,
        traceTurnId,
        traceLabel,
      }),
  };
}

export async function extractMemoriesFromTurn(
  input: MemoryExtractInput,
  traceTurnId?: number,
): Promise<MemoryExtractResult> {
  try {
    return await extractMemories(
      input,
      buildMemoryLlmConfig(traceTurnId, "memory extract", MEMORY_EXTRACT_NUM_PREDICT, MEMORY_EXTRACT_RESPONSE_FORMAT),
    );
  } catch (err) {
    logEventError("memory_extract_failed", err, {
      isGroupChat: input.isGroupChat,
    });
    return { userFacts: [], groupFacts: [], generalFacts: [] };
  }
}

export interface MemoryPersistContext {
  input: MemoryExtractInput;
  userId: string | null;
  groupChatId: string | null;
  turnId?: number;
}

/** Run memory extraction and DB writes without blocking the Telegram reply. */
export function scheduleMemoryPersistence(ctx: MemoryPersistContext): void {
  logEvent("memory_extract_scheduled", {
    userId: ctx.userId,
    groupId: ctx.groupChatId,
    isGroupChat: ctx.input.isGroupChat,
  });
  void persistMemories(ctx).catch((err) => {
    logEventError("memory_persist_failed", err, {
      userId: ctx.userId,
      groupId: ctx.groupChatId,
    });
    if (ctx.turnId != null) {
      getMessageReport(ctx.turnId)?.completeMemory({
        updated: false,
        scopes: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

async function persistMemories(ctx: MemoryPersistContext): Promise<void> {
  logEvent("memory_extract_started", {
    userId: ctx.userId,
    groupId: ctx.groupChatId,
    isGroupChat: ctx.input.isGroupChat,
  });

  const extracted = await extractMemoriesFromTurn(ctx.input, ctx.turnId);
  let anyUpdated = false;
  const updatedScopes: string[] = [];

  if (ctx.userId && extracted.userFacts.length > 0) {
    const merged = await mergeMemoryDocument(
      {
        kind: "user",
        existing: ctx.input.existingUserFacts,
        incoming: extracted.userFacts,
      },
      buildMemoryLlmConfig(
        ctx.turnId,
        "user memory merge",
        MEMORY_MERGE_NUM_PREDICT,
        MEMORY_MERGE_RESPONSE_FORMAT,
      ),
    );
    replaceUserFacts(ctx.userId, merged ? [merged] : []);
    logEvent("memory_updated", {
      scope: "user",
      userId: ctx.userId,
      factCount: extracted.userFacts.length,
    });
    anyUpdated = true;
    updatedScopes.push("user");
  }

  if (ctx.groupChatId && extracted.groupFacts.length > 0) {
    const merged = await mergeMemoryDocument(
      {
        kind: "group",
        existing: ctx.input.existingGroupFacts,
        incoming: extracted.groupFacts,
      },
      buildMemoryLlmConfig(
        ctx.turnId,
        "group memory merge",
        MEMORY_MERGE_NUM_PREDICT,
        MEMORY_MERGE_RESPONSE_FORMAT,
      ),
    );
    replaceGroupFacts(ctx.groupChatId, merged ? [merged] : []);
    logEvent("memory_updated", {
      scope: "group",
      groupId: ctx.groupChatId,
      factCount: extracted.groupFacts.length,
    });
    anyUpdated = true;
    updatedScopes.push("group");
  }

  const generalNew = extracted.generalFacts;
  if (generalNew.length > 0) {
    const merged = await mergeMemoryDocument(
      {
        kind: "general",
        existing: ctx.input.existingGeneralFacts,
        incoming: generalNew,
      },
      buildMemoryLlmConfig(
        ctx.turnId,
        "general memory merge",
        MEMORY_MERGE_NUM_PREDICT,
        MEMORY_MERGE_RESPONSE_FORMAT,
      ),
    );
    if (merged) {
      replaceGeneralFacts(splitMergedMemoryFacts(merged));
    }
    logEvent("memory_updated", {
      scope: "general",
      factCount: generalNew.length,
    });
    anyUpdated = true;
    updatedScopes.push("general");
  }

  if (ctx.turnId != null) {
    getMessageReport(ctx.turnId)?.completeMemory({
      updated: anyUpdated,
      scopes: updatedScopes,
    });
  }

  if (!anyUpdated) {
    logEvent("memory_extract_no_changes", {
      userId: ctx.userId,
      groupId: ctx.groupChatId,
    });
  }
}
