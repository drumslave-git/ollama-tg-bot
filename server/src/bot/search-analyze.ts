import { chatComplete } from "../llm/client.js";
import { logEventError } from "../event-log.js";
import { isTavilyConfigured } from "../tavily/client.js";
import {
  buildSearchAnalyzerMessages,
  parseSearchDecision,
  type SearchAnalyzeInput,
  type SearchDecision,
} from "./search-analyze-prompt.js";

export {
  SEARCH_ANALYZER_SYSTEM,
  buildSearchAnalyzerMessages,
  parseSearchDecision,
  type SearchAnalyzeInput,
  type SearchDecision,
} from "./search-analyze-prompt.js";

const SEARCH_CHECK_NUM_PREDICT = 192;

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
  if (!userText) return { needsSearch: false, query: null };

  const messages = buildSearchAnalyzerMessages(input);

  try {
    const raw = await chatComplete(messages, {
      numPredict: SEARCH_CHECK_NUM_PREDICT,
      auxiliary: true,
      traceTurnId: input.traceTurnId,
      traceLabel: "web search decision",
    });
    return parseSearchDecision(raw);
  } catch (err) {
    logEventError("search_analyze_failed", err);
    return { needsSearch: false, query: null };
  }
}
