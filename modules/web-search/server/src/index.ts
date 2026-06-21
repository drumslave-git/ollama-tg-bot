export {
  webSearchModule,
  runWebSearch,
  type WebSearchConfig,
  type WebSearchInput,
  type WebSearchOutput,
} from "./search.js";
export {
  SEARCH_WEB_TOOL_NAME,
  readSearchWebSources,
  registerWebSearchMcpTools,
} from "./mcp-tools.js";
export { registerMcpTools } from "./register-mcp-tools.js";
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
