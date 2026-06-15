import { chatComplete } from "../llm/client.js";
import { config } from "../config.js";
import {
  decideSearch,
  type SearchDecisionConfig,
  type SearchDecisionOutput,
} from "@llm-tg-bot/modules-search-decision";
import { logEventError } from "../event-log.js";
import { isTavilyConfigured } from "../tavily/client.js";
import { getResolvedSettings } from "../settings-runtime.js";

export {
  SEARCH_ANALYZER_SYSTEM,
  SEARCH_TAG,
  QUERY_TAG,
  buildSearchAnalyzerMessages,
  parseSearchDecision,
  searchDecisionModule,
  decideSearch,
  type SearchDecisionConfig,
  type SearchDecisionInput,
  type SearchDecisionOutput,
} from "@llm-tg-bot/modules-search-decision";

const SEARCH_CHECK_NUM_PREDICT = 192;

/** Host-facing decision shape (legacy name kept for call sites). */
export interface SearchDecision {
  needsSearch: boolean;
  query: string | null;
  reason?: string;
}

export interface SearchAnalyzeInput {
  userMessage: string;
  replyContext?: string | null;
  traceTurnId?: number;
}

function buildSearchConfig(traceTurnId?: number): SearchDecisionConfig {
  const settings = getResolvedSettings();
  return {
    baseUrl: settings.apiBaseUrl,
    model: settings.model,
    apiKey: config.openAiApiKey || undefined,
    numPredict: SEARCH_CHECK_NUM_PREDICT,
    chatComplete: (messages) =>
      chatComplete(messages, {
        numPredict: SEARCH_CHECK_NUM_PREDICT,
        auxiliary: true,
        traceTurnId,
        traceLabel: "web search decision",
      }),
  };
}

function toSearchDecision(output: SearchDecisionOutput): SearchDecision {
  return {
    needsSearch: output.needsSearch,
    query: output.query,
    reason: output.reason,
  };
}

/**
 * Ask the model whether Tavily web search should run before the main reply.
 */
export async function analyzeSearchNeed(
  input: SearchAnalyzeInput,
): Promise<SearchDecision> {
  if (!isTavilyConfigured()) {
    return { needsSearch: false, query: null };
  }

  const userText = input.userMessage.trim();
  if (!userText && !input.replyContext?.trim()) {
    return { needsSearch: false, query: null };
  }

  try {
    const result = await decideSearch(
      {
        message: userText,
        replyContext: input.replyContext,
      },
      buildSearchConfig(input.traceTurnId),
    );
    return toSearchDecision(result);
  } catch (err) {
    logEventError("search_analyze_failed", err);
    return { needsSearch: false, query: null };
  }
}
