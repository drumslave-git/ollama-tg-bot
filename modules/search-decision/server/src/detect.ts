import {
  auxiliaryChatComplete,
  type ChatMessage,
  type ModuleDefinition,
} from "@llm-tg-bot/modules-utils";
import {
  buildSearchAnalyzerMessages,
  getSearchResponseFormat,
  parseSearchDecision,
  type SearchDecisionOutput,
} from "./prompt.js";

const DEFAULT_NUM_PREDICT = 192;

export interface SearchDecisionInput {
  message: string;
  replyContext?: string | null;
  thinkingEnabled?: boolean;
}

export interface SearchDecisionConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  numPredict?: number;
  /**
   * Optional host-provided completion (e.g. debug tracing).
   * When set, `baseUrl` / `model` / `apiKey` are ignored for the LLM call.
   */
  chatComplete?: (messages: ChatMessage[]) => Promise<string>;
}

export async function decideSearch(
  input: SearchDecisionInput,
  config: SearchDecisionConfig,
): Promise<SearchDecisionOutput> {
  const text = input.message.trim();
  if (!text && !input.replyContext?.trim()) {
    return { needsSearch: false, query: null, reason: "Empty message" };
  }

  const messages = buildSearchAnalyzerMessages({
    message: text,
    replyContext: input.replyContext,
    thinkingEnabled: input.thinkingEnabled,
  });

  const responseFormat = getSearchResponseFormat(
    Boolean(input.thinkingEnabled),
  );

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
            numPredict: config.numPredict ?? DEFAULT_NUM_PREDICT,
            responseFormat,
          },
        );
    return parseSearchDecision(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      needsSearch: false,
      query: null,
      reason: `LLM request failed: ${message}`,
    };
  }
}

export const searchDecisionModule: ModuleDefinition<
  SearchDecisionInput,
  SearchDecisionConfig,
  SearchDecisionOutput
> = {
  id: "search-decision",
  run: decideSearch,
};
