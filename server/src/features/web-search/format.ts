import { errorMessage } from "../../logging/index.js";
import type { WebSearchPayload, WebSearchResult, WebSearchSource } from "./types.js";

export function formatWebSearchContext(
  query: string,
  payload: WebSearchPayload,
): string {
  const parts: string[] = [`Web search for "${query}":`];

  if (payload.answer) {
    parts.push(`\nSummary:\n${payload.answer}`);
  }

  if (payload.results.length > 0) {
    const lines = payload.results.map((r, i) => {
      const snippet = r.content ? `\n${r.content}` : "";
      const link = r.url ? `\nSource: ${r.url}` : "";
      return `${i + 1}. ${r.title}${link}${snippet}`;
    });
    parts.push(`\nSources:\n${lines.join("\n\n")}`);
  }

  if (!payload.answer && payload.results.length === 0) {
    return (
      `Web search was run for "${query}" but returned no results.\n` +
      `Answer from general knowledge and say if you are unsure about current facts.`
    );
  }

  parts.push(
    "\nUse the summary and sources above in your reply. " +
      "Do not tell the user to search themselves or that you cannot access the web. " +
      "Do not add a sources list yourself; the bot will append it automatically.",
  );

  return parts.join("\n");
}

export function extractWebSearchSources(
  payload: Pick<WebSearchPayload, "results">,
): WebSearchSource[] {
  const sources: WebSearchSource[] = [];
  const seen = new Set<string>();

  for (const result of payload.results) {
    const url = result.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: result.title.trim() || url,
      url,
    });
  }

  return sources;
}

export function formatWebSearchFailure(query: string, err: unknown): string {
  const detail = errorMessage(err);
  return (
    `Web search was attempted for "${query}" but failed: ${detail}\n\n` +
    `Tell the user live lookup failed. Do not pretend you searched successfully.`
  );
}

export function normalizeTavilyResults(
  rows: Array<{ title?: string; url?: string; content?: string }> | undefined,
): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  for (const row of rows ?? []) {
    const title = row.title?.trim() ?? "";
    const url = row.url?.trim() ?? "";
    const content = row.content?.trim() ?? "";
    if (!title && !url && !content) continue;
    results.push({
      title: title || url || "Result",
      url,
      content,
    });
  }
  return results;
}
