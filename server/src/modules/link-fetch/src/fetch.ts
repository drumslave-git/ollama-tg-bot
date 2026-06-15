import type { ModuleDefinition } from "@llm-tg-bot/modules-utils";
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
    return {
      context: formatLinkFetchContext(pages),
      urlCount: urls.length,
      resolved: loaded > 0,
      reason: loaded > 0 ? "Pages fetched" : "All page fetches failed",
      pages,
    };
  } catch (err) {
    return {
      context: formatLinkFetchFailure(limited, err),
      urlCount: urls.length,
      resolved: false,
      reason: err instanceof Error ? err.message : String(err),
      pages: [],
    };
  }
}

export const linkFetchModule: ModuleDefinition<
  LinkFetchInput,
  LinkFetchConfig,
  LinkFetchOutput
> = {
  id: "link-fetch",
  run: runLinkFetch,
};
