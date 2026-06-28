import type { FeatureDefinition, FeatureLogging } from "../../shared/index.js";
import {
  extractWebSearchSources,
  formatWebSearchContext,
  formatWebSearchFailure,
} from "./format.js";
import { fetchTavilySearch, type TavilyFetchConfig } from "./tavily.js";
import type { WebSearchPayload, WebSearchResult, WebSearchSource } from "./types.js";

export interface WebSearchInput {
  query: string;
}

export interface WebSearchConfig extends TavilyFetchConfig {
  log?: FeatureLogging;
}

export interface WebSearchOutput {
  ok: boolean;
  results: WebSearchResult[];
  sources: WebSearchSource[];
  answer: string | null;
  /** Text injected into the main LLM turn (success or failure message). */
  context: string;
  reason: string;
}

export async function runWebSearch(
  input: WebSearchInput,
  config: WebSearchConfig,
): Promise<WebSearchOutput> {
  const query = input.query.trim();
  if (!query) {
    return {
      ok: false,
      results: [],
      sources: [],
      answer: null,
      context: formatWebSearchFailure("", new Error("Empty search query")),
      reason: "Empty query",
    };
  }

  try {
    const payload: WebSearchPayload = await fetchTavilySearch(query, config);
    const output = {
      ok: true as const,
      results: payload.results,
      sources: extractWebSearchSources(payload),
      answer: payload.answer,
      context: formatWebSearchContext(query, payload),
      reason: "Search completed",
    };
    config.log?.logEvent?.("web_search_done", {
      queryLen: query.length,
      resultCount: output.results.length,
    });
    return output;
  } catch (err) {
    config.log?.logEventError?.("web_search_failed", err, {
      queryLen: query.length,
    });
    return {
      ok: false,
      results: [],
      sources: [],
      answer: null,
      context: formatWebSearchFailure(query, err),
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export const webSearchFeature: FeatureDefinition<
  WebSearchInput,
  WebSearchConfig,
  WebSearchOutput
> = {
  id: "web-search",
  run: runWebSearch,
};
