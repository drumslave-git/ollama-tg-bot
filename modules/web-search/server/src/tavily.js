import { normalizeTavilyResults } from "./format.js";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESULTS = 5;
export async function fetchTavilySearch(query, config) {
    const apiKey = config.apiKey.trim();
    if (!apiKey) {
        throw new Error("Web search API key is not configured");
    }
    const fetchFn = config.fetch ?? fetch;
    const maxResults = config.maxResults ?? DEFAULT_MAX_RESULTS;
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const res = await fetchFn(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
            query: query.trim(),
            search_depth: "basic",
            max_results: maxResults,
            include_answer: true,
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Web search API returned ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json());
    return {
        results: normalizeTavilyResults(data.results),
        answer: data.answer?.trim() || null,
    };
}
