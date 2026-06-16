import { config } from "../config.js";
import {
  extractWebSearchSources,
  formatWebSearchContext,
  formatWebSearchFailure,
  fetchTavilySearch,
  runWebSearch,
  type WebSearchResult,
  type WebSearchSource,
} from "@llm-tg-bot/modules-web-search";
import { hostLogging } from "../module-host.js";

export {
  extractWebSearchSources as tavilySources,
  formatWebSearchContext as formatTavilyContext,
  formatWebSearchFailure as formatTavilyFailure,
  runWebSearch,
  webSearchModule,
  type WebSearchConfig,
  type WebSearchInput,
  type WebSearchOutput,
} from "@llm-tg-bot/modules-web-search";

export type TavilyResult = WebSearchResult;
export type TavilySource = WebSearchSource;

export function isTavilyConfigured(): boolean {
  return config.tavilyApiKey.length > 0;
}

export async function tavilySearch(
  query: string,
  options?: { maxResults?: number },
): Promise<{ results: TavilyResult[]; answer: string | null }> {
  const payload = await fetchTavilySearch(query, {
    apiKey: config.tavilyApiKey,
    maxResults: options?.maxResults,
  });
  return payload;
}

export async function executeWebSearch(query: string) {
  return runWebSearch(
    { query },
    { apiKey: config.tavilyApiKey, log: hostLogging() },
  );
}

/** Lightweight check that the API key works (uses one search credit). */
export async function checkTavilyHealth(): Promise<boolean> {
  if (!isTavilyConfigured()) return false;
  const result = await runWebSearch(
    { query: "test" },
    { apiKey: config.tavilyApiKey, maxResults: 1, log: hostLogging() },
  );
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return true;
}
