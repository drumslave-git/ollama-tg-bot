import { formatLinkFetchContext, formatLinkFetchFailure } from "./format.js";
import { isSafePublicUrl } from "./extract.js";
import { fetchPagesWithPlaywright } from "./playwright.js";
import type { LinkFetchConfig } from "./fetch.js";
import type { FetchedPage } from "./types.js";

export interface FetchLinkOutput {
  page: FetchedPage;
  context: string;
  resolved: boolean;
  reason: string;
}

export async function fetchLink(
  url: string,
  config: LinkFetchConfig = {},
): Promise<FetchLinkOutput> {
  const normalized = url.trim();
  if (!normalized) {
    return {
      page: { url: normalized, title: "", text: "", error: "URL is empty" },
      context: "URL is empty",
      resolved: false,
      reason: "URL is empty",
    };
  }

  if (!isSafePublicUrl(normalized)) {
    const page: FetchedPage = {
      url: normalized,
      title: "",
      text: "",
      error: "URL blocked for safety (private network or unsupported scheme)",
    };
    return {
      page,
      context: formatLinkFetchContext([page]),
      resolved: false,
      reason: page.error!,
    };
  }

  const fetchPages =
    config.fetchPages ??
    ((batch: string[]) => fetchPagesWithPlaywright(batch, 1));

  try {
    const pages = await fetchPages([normalized]);
    const page = pages[0] ?? {
      url: normalized,
      title: "",
      text: "",
      error: "No page result returned",
    };
    const resolved = !page.error;
    const output = {
      page,
      context: formatLinkFetchContext([page]),
      resolved,
      reason: resolved ? "Page fetched" : "Page fetch failed",
    };
    if (resolved) {
      config.log?.logEvent?.("link_fetch_done", {
        urlCount: 1,
        loadedCount: 1,
        failedCount: 0,
      });
    }
    return output;
  } catch (err) {
    config.log?.logEventError?.("link_fetch_failed", err, { urlCount: 1 });
    return {
      page: {
        url: normalized,
        title: "",
        text: "",
        error: err instanceof Error ? err.message : String(err),
      },
      context: formatLinkFetchFailure([normalized], err),
      resolved: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
