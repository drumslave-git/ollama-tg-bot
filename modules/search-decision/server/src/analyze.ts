import type { ModuleDefinition, ModuleLogging } from "@llm-tg-bot/modules-utils";
import {
  decideSearch,
  type SearchDecisionConfig,
  type SearchDecisionInput,
} from "./detect.js";
import type { SearchDecisionOutput } from "./prompt.js";

export interface SearchAnalyzeInput extends SearchDecisionInput {
  traceTurnId?: number;
}

export interface SearchAnalyzeConfig extends SearchDecisionConfig {
  /** When false, search is skipped (e.g. API key not configured). */
  searchEnabled: boolean;
  log?: ModuleLogging;
}

/**
 * Ask the model whether web search should run before the main reply.
 */
export async function analyzeSearchNeed(
  input: SearchAnalyzeInput,
  config: SearchAnalyzeConfig,
): Promise<SearchDecisionOutput> {
  if (!config.searchEnabled) {
    return { needsSearch: false, query: null, reason: "Search not configured" };
  }

  const userText = input.message.trim();
  if (!userText && !input.replyContext?.trim()) {
    return { needsSearch: false, query: null, reason: "Empty message" };
  }

  try {
    const result = await decideSearch(input, config);
    if (result.needsSearch && result.query) {
      config.log?.logEvent?.("web_search_triggered", {
        queryLen: result.query.length,
        turnId: input.traceTurnId,
      });
    }
    return result;
  } catch (err) {
    config.log?.logEventError?.("search_analyze_failed", err, {
      turnId: input.traceTurnId,
    });
    return { needsSearch: false, query: null, reason: "Search analysis failed" };
  }
}

export const searchAnalyzeModule: ModuleDefinition<
  SearchAnalyzeInput,
  SearchAnalyzeConfig,
  SearchDecisionOutput
> = {
  id: "search-decision",
  run: analyzeSearchNeed,
};
