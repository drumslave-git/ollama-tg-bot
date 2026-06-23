import {
  auxiliaryChatComplete,
  type ChatMessage,
  type ModuleLogging,
} from "../../shared/index.js";
import {
  buildMemoryMergeMessages,
  getMemoryMergeResponseFormat,
  parseMemoryBlock,
  splitMergedMemoryFacts,
  type MemoryMergeInput,
} from "./merge-prompt.js";

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

/**
 * Run one LLM pass over a memory document: dedupe, drop contradicted/ephemeral
 * lines, and compact. Returns the cleaned document text (possibly empty).
 */
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

/**
 * Maintenance pass for an existing memory document: feed the current content as
 * "existing" with no new information, so the merge model validates, dedupes,
 * resolves contradictions, and compacts it. Returns the cleaned lines.
 */
export async function cleanMemoryDocument(
  kind: MemoryMergeInput["kind"],
  content: string,
  config: MemoryLlmConfig,
): Promise<string[]> {
  const existing = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (existing.length === 0) return [];

  const cleaned = await mergeMemoryDocument(
    { kind, existing, incoming: [] },
    config,
  );
  return splitMergedMemoryFacts(cleaned);
}
