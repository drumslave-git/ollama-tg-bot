import { logEvent, logEventError } from "../event-log.js";
import {
  runLinkFetch,
  type LinkFetchInput,
  type LinkFetchOutput,
} from "@llm-tg-bot/modules-link-fetch";

export {
  extractUrls,
  isSafePublicUrl,
  formatLinkFetchContext,
  formatLinkFetchFailure,
  fetchPagesWithPlaywright,
  closePlaywrightBrowser,
  runLinkFetch,
  linkFetchModule,
  DEFAULT_MAX_URLS_PER_TURN,
  type FetchedPage,
  type LinkFetchConfig,
  type LinkFetchInput,
  type LinkFetchOutput,
} from "@llm-tg-bot/modules-link-fetch";

/** Host-facing result shape (legacy name kept for call sites). */
export interface LinkFetchResult {
  context: string | null;
  urlCount: number;
  resolved: boolean;
}

function toLinkFetchResult(output: LinkFetchOutput): LinkFetchResult {
  return {
    context: output.context,
    urlCount: output.urlCount,
    resolved: output.resolved,
  };
}

/**
 * Detect http(s) links in the addressed turn, visit them with Playwright,
 * and format context for the main reply (similar to Tavily web search).
 */
export async function resolveLinkFetchContext(
  input: LinkFetchInput,
): Promise<LinkFetchResult> {
  const result = await runLinkFetch(input);

  if (result.urlCount === 0) {
    return toLinkFetchResult(result);
  }

  if (result.resolved) {
    const loaded = result.pages.filter((p) => !p.error).length;
    logEvent("link_fetch_done", {
      urlCount: result.urlCount,
      loadedCount: loaded,
      failedCount: result.pages.length - loaded,
    });
    return toLinkFetchResult(result);
  }

  if (result.pages.length > 0) {
    logEvent("link_fetch_done", {
      urlCount: result.urlCount,
      loadedCount: 0,
      failedCount: result.pages.length,
    });
    return toLinkFetchResult(result);
  }

  logEventError("link_fetch_failed", new Error(result.reason), {
    urlCount: result.urlCount,
  });
  return toLinkFetchResult(result);
}
