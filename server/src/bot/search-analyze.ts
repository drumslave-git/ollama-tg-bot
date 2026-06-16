import {
  analyzeSearchNeed,
  SEARCH_RESPONSE_FORMAT,
  type SearchDecisionOutput,
} from "@llm-tg-bot/modules-search-decision";
import { config } from "../config.js";
import {
  hostAuxiliaryChatComplete,
  hostLlmConfig,
  hostLogging,
} from "../module-host.js";

export {
  SEARCH_ANALYZER_SYSTEM,
  SEARCH_RESPONSE_FORMAT,
  buildSearchAnalyzerMessages,
  parseSearchDecision,
  searchDecisionModule,
  searchAnalyzeModule,
  decideSearch,
  analyzeSearchNeed,
  type SearchDecisionConfig,
  type SearchDecisionInput,
  type SearchDecisionOutput,
  type SearchAnalyzeConfig,
  type SearchAnalyzeInput,
} from "@llm-tg-bot/modules-search-decision";

const SEARCH_CHECK_NUM_PREDICT = 192;

/** Host-facing decision shape (legacy name kept for call sites). */
export type SearchDecision = SearchDecisionOutput;

export interface SearchAnalyzeHostInput {
  userMessage: string;
  replyContext?: string | null;
  traceTurnId?: number;
}

export async function analyzeSearchNeedForTurn(
  input: SearchAnalyzeHostInput,
): Promise<SearchDecisionOutput> {
  return analyzeSearchNeed(
    {
      message: input.userMessage,
      replyContext: input.replyContext,
      traceTurnId: input.traceTurnId,
    },
    {
      ...hostLlmConfig(),
      searchEnabled: config.tavilyApiKey.length > 0,
      numPredict: SEARCH_CHECK_NUM_PREDICT,
      log: hostLogging(),
      chatComplete: hostAuxiliaryChatComplete({
        numPredict: SEARCH_CHECK_NUM_PREDICT,
        responseFormat: SEARCH_RESPONSE_FORMAT,
        traceTurnId: input.traceTurnId,
        traceLabel: "web search decision",
      }),
    },
  );
}
