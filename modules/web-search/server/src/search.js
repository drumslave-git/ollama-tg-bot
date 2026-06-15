import { extractWebSearchSources, formatWebSearchContext, formatWebSearchFailure, } from "./format.js";
import { fetchTavilySearch } from "./tavily.js";
export async function runWebSearch(input, config) {
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
        const payload = await fetchTavilySearch(query, config);
        return {
            ok: true,
            results: payload.results,
            sources: extractWebSearchSources(payload),
            answer: payload.answer,
            context: formatWebSearchContext(query, payload),
            reason: "Search completed",
        };
    }
    catch (err) {
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
export const webSearchModule = {
    id: "web-search",
    run: runWebSearch,
};
