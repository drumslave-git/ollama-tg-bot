import { extractUrls } from "./extract.js";
import { formatLinkFetchContext, formatLinkFetchFailure, } from "./format.js";
import { DEFAULT_MAX_URLS_PER_TURN, fetchPagesWithPlaywright, } from "./playwright.js";
export async function runLinkFetch(input, config = {}) {
    const urls = extractUrls(input.message, input.replyContext);
    if (urls.length === 0) {
        return {
            context: null,
            urlCount: 0,
            resolved: false,
            reason: "No links in message",
            pages: [],
        };
    }
    const maxUrls = config.maxUrls ?? DEFAULT_MAX_URLS_PER_TURN;
    const limited = urls.slice(0, maxUrls);
    const fetchPages = config.fetchPages ??
        ((batch) => fetchPagesWithPlaywright(batch, maxUrls));
    try {
        const pages = await fetchPages(limited);
        const loaded = pages.filter((p) => !p.error).length;
        return {
            context: formatLinkFetchContext(pages),
            urlCount: urls.length,
            resolved: loaded > 0,
            reason: loaded > 0 ? "Pages fetched" : "All page fetches failed",
            pages,
        };
    }
    catch (err) {
        return {
            context: formatLinkFetchFailure(limited, err),
            urlCount: urls.length,
            resolved: false,
            reason: err instanceof Error ? err.message : String(err),
            pages: [],
        };
    }
}
export const linkFetchModule = {
    id: "link-fetch",
    run: runLinkFetch,
};
