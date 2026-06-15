import {
  auxiliaryChatComplete,
  type ChatMessage,
  type ModuleDefinition,
} from "@llm-tg-bot/modules-utils";
import {
  buildMemoryExtractMessages,
  parseMemoryExtract,
  type MemoryExtractInput,
  type MemoryExtractResult,
} from "./extract-prompt.js";
import {
  buildMemoryMergeMessages,
  parseMemoryBlock,
  type MemoryMergeInput,
} from "./merge-prompt.js";

export const MEMORY_EXTRACT_NUM_PREDICT = 384;
export const MEMORY_MERGE_NUM_PREDICT = 1024;

export interface MemoryLlmConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  numPredict?: number;
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
  const messages = buildMemoryExtractMessages(input);

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
          { numPredict: config.numPredict ?? MEMORY_EXTRACT_NUM_PREDICT },
        );
    const parsed = parseMemoryExtract(raw);
    return {
      userFacts: parsed.userFacts,
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
  const messages = buildMemoryMergeMessages(input);

  const raw = config.chatComplete
    ? await config.chatComplete(messages)
    : await auxiliaryChatComplete(
        {
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
        },
        messages,
        { numPredict: config.numPredict ?? MEMORY_MERGE_NUM_PREDICT },
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
