export {
  webSearchModule,
  runWebSearch,
  type WebSearchConfig,
  type WebSearchInput,
  type WebSearchOutput,
} from "./search.js";
export {
  extractWebSearchSources,
  formatWebSearchContext,
  formatWebSearchFailure,
  normalizeTavilyResults,
} from "./format.js";
export { fetchTavilySearch, type TavilyFetchConfig } from "./tavily.js";
export type {
  WebSearchPayload,
  WebSearchResult,
  WebSearchSource,
} from "./types.js";
