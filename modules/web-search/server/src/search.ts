import type { ModuleDefinition } from "@llm-tg-bot/modules-utils";
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

export interface WebSearchConfig extends TavilyFetchConfig {}

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
    return {
      ok: true,
      results: payload.results,
      sources: extractWebSearchSources(payload),
      answer: payload.answer,
      context: formatWebSearchContext(query, payload),
      reason: "Search completed",
    };
  } catch (err) {
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

export const webSearchModule: ModuleDefinition<
  WebSearchInput,
  WebSearchConfig,
  WebSearchOutput
> = {
  id: "web-search",
  run: runWebSearch,
};
