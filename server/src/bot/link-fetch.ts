import {
  runLinkFetch,
  type LinkFetchInput,
  type LinkFetchOutput,
} from "@llm-tg-bot/modules-link-fetch";
import { hostLogging } from "../module-host.js";

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

export async function resolveLinkFetchContext(
  input: LinkFetchInput,
): Promise<LinkFetchResult> {
  const result = await runLinkFetch(input, { log: hostLogging() });
  return toLinkFetchResult(result);
}
