import { addGeneralFacts } from "./db/general-memory.js";
import { replaceGroupFacts } from "./db/group-memory.js";
import { replaceUserFacts } from "./db/user-memory.js";
import { logEvent, logEventError } from "./event-log.js";
import { getMessageReport } from "./message-report.js";
import { chatComplete } from "./llm/client.js";
import { parseStructuredResponse } from "./response-format.js";
import {
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  newFactsOnly,
  parseMemoryBlock,
  type MemoryExtractInput,
  type MemoryExtractResult,
} from "./memory-prompt.js";

export {
  EXTRACTOR_SYSTEM,
  MEMORY_MERGE_SYSTEM,
  buildMemoryExtractMessages,
  buildMemoryMergeMessages,
  newFactsOnly,
  parseMemoryBlock,
  type MemoryExtractInput,
  type MemoryExtractResult,
  type MemoryMergeInput,
} from "./memory-prompt.js";

const MEMORY_EXTRACT_NUM_PREDICT = 384;
// Merge reasons over existing + incoming facts, so reasoning backends need a
// larger budget than the extract pass before the [MEMORY] block is emitted.
const MEMORY_MERGE_NUM_PREDICT = 1024;

export async function extractMemoriesFromTurn(
  input: MemoryExtractInput,
  traceTurnId?: number,
): Promise<MemoryExtractResult> {
  const messages = buildMemoryExtractMessages(input);

  try {
    const raw = await chatComplete(messages, {
      numPredict: MEMORY_EXTRACT_NUM_PREDICT,
      auxiliary: true,
      think: true,
      traceTurnId,
      traceLabel: "memory extract",
    });
    const parsed = parseStructuredResponse(raw);
    return {
      userFacts: parsed.memoryFacts,
      groupFacts: input.isGroupChat ? parsed.groupMemoryFacts : [],
      generalFacts: parsed.generalMemoryFacts,
    };
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
    const merged = await mergeMemoryDocument({
      kind: "user",
      existing: ctx.input.existingUserFacts,
      incoming: extracted.userFacts,
      traceTurnId: ctx.turnId,
    });
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
    const merged = await mergeMemoryDocument({
      kind: "group",
      existing: ctx.input.existingGroupFacts,
      incoming: extracted.groupFacts,
      traceTurnId: ctx.turnId,
    });
    replaceGroupFacts(ctx.groupChatId, merged ? [merged] : []);
    logEvent("memory_updated", {
      scope: "group",
      groupId: ctx.groupChatId,
      factCount: extracted.groupFacts.length,
    });
    anyUpdated = true;
    updatedScopes.push("group");
  }

  const generalNew = newFactsOnly(
    ctx.input.existingGeneralFacts,
    extracted.generalFacts,
  );
  if (generalNew.length > 0) {
    addGeneralFacts(generalNew);
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

async function mergeMemoryDocument(input: {
  kind: "user" | "group";
  existing: string[];
  incoming: string[];
  traceTurnId?: number;
}): Promise<string> {
  const messages = buildMemoryMergeMessages(input);

  const raw = await chatComplete(messages, {
    numPredict: MEMORY_MERGE_NUM_PREDICT,
    auxiliary: true,
    think: true,
    traceTurnId: input.traceTurnId,
    traceLabel: `${input.kind} memory merge`,
  });

  return parseMemoryBlock(raw);
}
