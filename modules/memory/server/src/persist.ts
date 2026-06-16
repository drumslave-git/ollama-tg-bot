import type { ModuleLogging } from "@llm-tg-bot/modules-utils";
import {
  extractMemories,
  mergeMemoryDocument,
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  type MemoryLlmConfig,
} from "./extract.js";
import {
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  type MemoryExtractInput,
  type MemoryExtractResult,
} from "./extract-prompt.js";
import {
  MEMORY_MERGE_RESPONSE_FORMAT,
  splitMergedMemoryFacts,
} from "./merge-prompt.js";

export interface MemoryPersistCallbacks {
  replaceUserFacts: (userId: string, facts: string[]) => void;
  replaceGroupFacts: (groupId: string, facts: string[]) => void;
  replaceGeneralFacts: (facts: string[]) => void;
}

export interface MemoryPersistContext {
  input: MemoryExtractInput;
  userId: string | null;
  groupChatId: string | null;
  turnId?: number;
}

export interface MemoryPersistConfig {
  extract: MemoryLlmConfig;
  merge: MemoryLlmConfig;
  log?: ModuleLogging;
}

export interface MemoryPersistReport {
  updated: boolean;
  scopes: string[];
  error?: string;
}

export async function extractMemoriesFromTurn(
  input: MemoryExtractInput,
  config: MemoryLlmConfig,
): Promise<MemoryExtractResult> {
  try {
    return await extractMemories(input, config);
  } catch (err) {
    config.log?.logEventError?.("memory_extract_failed", err, {
      isGroupChat: input.isGroupChat,
    });
    return { userFacts: [], groupFacts: [], generalFacts: [] };
  }
}

/** Run memory extraction and persistence. */
export async function persistMemories(
  ctx: MemoryPersistContext,
  config: MemoryPersistConfig,
  callbacks: MemoryPersistCallbacks,
): Promise<MemoryPersistReport> {
  const log = config.log;
  log?.logEvent?.("memory_extract_started", {
    userId: ctx.userId ?? undefined,
    groupId: ctx.groupChatId ?? undefined,
    isGroupChat: ctx.input.isGroupChat,
  });

  const extracted = await extractMemoriesFromTurn(ctx.input, config.extract);
  let anyUpdated = false;
  const updatedScopes: string[] = [];

  if (ctx.userId && extracted.userFacts.length > 0) {
    const merged = await mergeMemoryDocument(
      {
        kind: "user",
        existing: ctx.input.existingUserFacts,
        incoming: extracted.userFacts,
      },
      config.merge,
    );
    callbacks.replaceUserFacts(ctx.userId, merged ? [merged] : []);
    log?.logEvent?.("memory_updated", {
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
      config.merge,
    );
    callbacks.replaceGroupFacts(ctx.groupChatId, merged ? [merged] : []);
    log?.logEvent?.("memory_updated", {
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
      config.merge,
    );
    if (merged) {
      callbacks.replaceGeneralFacts(splitMergedMemoryFacts(merged));
    }
    log?.logEvent?.("memory_updated", {
      scope: "general",
      factCount: generalNew.length,
    });
    anyUpdated = true;
    updatedScopes.push("general");
  }

  if (!anyUpdated) {
    log?.logEvent?.("memory_extract_no_changes", {
      userId: ctx.userId ?? undefined,
      groupId: ctx.groupChatId ?? undefined,
    });
  }

  return { updated: anyUpdated, scopes: updatedScopes };
}

/** Schedule memory persistence without blocking the caller. */
export function scheduleMemoryPersistence(
  ctx: MemoryPersistContext,
  config: MemoryPersistConfig,
  callbacks: MemoryPersistCallbacks,
  onComplete?: (report: MemoryPersistReport) => void,
  onError?: (err: unknown) => void,
): void {
  config.log?.logEvent?.("memory_extract_scheduled", {
    userId: ctx.userId ?? undefined,
    groupId: ctx.groupChatId ?? undefined,
    isGroupChat: ctx.input.isGroupChat,
  });
  void persistMemories(ctx, config, callbacks)
    .then((report) => onComplete?.(report))
    .catch((err) => {
      config.log?.logEventError?.("memory_persist_failed", err, {
        userId: ctx.userId ?? undefined,
        groupId: ctx.groupChatId ?? undefined,
      });
      onError?.(err);
    });
}

export {
  MEMORY_EXTRACT_NUM_PREDICT,
  MEMORY_MERGE_NUM_PREDICT,
  MEMORY_EXTRACT_RESPONSE_FORMAT,
  MEMORY_MERGE_RESPONSE_FORMAT,
};
