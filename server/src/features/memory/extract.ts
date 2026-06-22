import {
  auxiliaryChatComplete,
  type ChatMessage,
  type ModuleDefinition,
  type ModuleLogging,
} from "../../shared/index.js";
import {
  buildMemoryExtractMessages,
  getMemoryExtractResponseFormat,
  parseMemoryExtract,
  type MemoryExtractInput,
  type MemoryExtractResult,
} from "./extract-prompt.js";
import {
  buildMemoryMergeMessages,
  getMemoryMergeResponseFormat,
  parseMemoryBlock,
  type MemoryMergeInput,
} from "./merge-prompt.js";

export const MEMORY_EXTRACT_NUM_PREDICT = 512;
export const MEMORY_MERGE_NUM_PREDICT = 1536;

export interface MemoryLlmConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  numPredict?: number;
  thinkingEnabled?: boolean;
  log?: ModuleLogging;
  /**
   * Optional host-provided completion (e.g. debug tracing, thinking mode).
   * When set, `baseUrl` / `model` / `apiKey` are ignored for the LLM call.
   */
  chatComplete?: (messages: ChatMessage[]) => Promise<string>;
}

export async function extractMemories(
  input: MemoryExtractInput,
  config: MemoryLlmConfig,
): Promise<MemoryExtractResult> {
  const thinkingEnabled = Boolean(config.thinkingEnabled);
  const messages = buildMemoryExtractMessages(input, thinkingEnabled);
  const responseFormat = getMemoryExtractResponseFormat(thinkingEnabled);

  try {
    const raw = config.chatComplete
      ? await config.chatComplete(messages)
      : await auxiliaryChatComplete(
          {
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
          },
          messages,
          {
            numPredict: config.numPredict ?? MEMORY_EXTRACT_NUM_PREDICT,
            responseFormat,
          },
        );
    const parsed = parseMemoryExtract(raw);
    const allowedIds = new Set(
      (input.knownParticipants ?? []).map((p) => p.userId),
    );
    if (input.currentSpeaker?.userId) {
      allowedIds.add(input.currentSpeaker.userId);
    }
    const observedUserFacts =
      allowedIds.size > 0
        ? parsed.observedUserFacts.filter(
            (entry) =>
              allowedIds.has(entry.userId) &&
              entry.userId !== input.currentSpeaker?.userId,
          )
        : [];
    return {
      userFacts: parsed.userFacts,
      observedUserFacts,
      groupFacts: input.isGroupChat ? parsed.groupFacts : [],
      generalFacts: parsed.generalFacts,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Memory extract LLM request failed: ${message}`);
  }
}

export async function mergeMemoryDocument(
  input: MemoryMergeInput,
  config: MemoryLlmConfig,
): Promise<string> {
  const thinkingEnabled = Boolean(config.thinkingEnabled);
  const messages = buildMemoryMergeMessages(input, thinkingEnabled);
  const responseFormat = getMemoryMergeResponseFormat(thinkingEnabled);

  const raw = config.chatComplete
    ? await config.chatComplete(messages)
    : await auxiliaryChatComplete(
        {
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
        },
        messages,
        {
          numPredict: config.numPredict ?? MEMORY_MERGE_NUM_PREDICT,
          responseFormat,
        },
      );

  return parseMemoryBlock(raw);
}

export const memoryExtractModule: ModuleDefinition<
  MemoryExtractInput,
  MemoryLlmConfig,
  MemoryExtractResult
> = {
  id: "memory-extract",
  run: extractMemories,
};
