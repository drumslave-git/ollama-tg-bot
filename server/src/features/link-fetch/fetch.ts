import { errorMessage } from "../../logging/index.js";
import type { FeatureDefinition, FeatureLogging } from "../../shared/index.js";
import { extractUrls } from "./extract.js";
import {
  formatLinkFetchContext,
  formatLinkFetchFailure,
} from "./format.js";
import {
  DEFAULT_MAX_URLS_PER_TURN,
  fetchPagesWithPlaywright,
} from "./playwright.js";
import type {
  FetchedPage,
  LinkFetchInput,
  LinkFetchOutput,
} from "./types.js";

export interface LinkFetchConfig {
  maxUrls?: number;
  log?: FeatureLogging;
  /**
   * Optional host-provided page fetcher (e.g. tests).
   * When omitted, Playwright is used.
   */
  fetchPages?: (urls: string[]) => Promise<FetchedPage[]>;
}

export async function runLinkFetch(
  input: LinkFetchInput,
  config: LinkFetchConfig = {},
): Promise<LinkFetchOutput> {
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
  const fetchPages =
    config.fetchPages ??
    ((batch: string[]) => fetchPagesWithPlaywright(batch, maxUrls));

  try {
    const pages = await fetchPages(limited);
    const loaded = pages.filter((p) => !p.error).length;
    const output = {
      context: formatLinkFetchContext(pages),
      urlCount: urls.length,
      resolved: loaded > 0,
      reason: loaded > 0 ? "Pages fetched" : "All page fetches failed",
      pages,
    };
    if (output.urlCount > 0) {
      config.log?.logEvent?.("link_fetch_done", {
        urlCount: output.urlCount,
        loadedCount: loaded,
        failedCount: pages.length - loaded,
      });
    }
    return output;
  } catch (err) {
    config.log?.logEventError?.("link_fetch_failed", err, {
      urlCount: urls.length,
    });
    return {
      context: formatLinkFetchFailure(limited, err),
      urlCount: urls.length,
      resolved: false,
      reason: errorMessage(err),
      pages: [],
    };
  }
}

export const linkFetchFeature: FeatureDefinition<
  LinkFetchInput,
  LinkFetchConfig,
  LinkFetchOutput
> = {
  id: "link-fetch",
  run: runLinkFetch,
};
