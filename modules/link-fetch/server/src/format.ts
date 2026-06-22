import type { FetchedPage } from "./types.js";

export function formatLinkFetchContext(pages: FetchedPage[]): string {
  const parts: string[] = [
    "The user's message included link(s). Page content fetched with Playwright:",
  ];

  for (const [i, page] of pages.entries()) {
    const header = `${i + 1}. ${page.url}`;
    if (page.error) {
      parts.push(`${header}\nFailed to load: ${page.error}`);
      continue;
    }
    const titleLine = page.title ? `\nTitle: ${page.title}` : "";
    const bodyLine = page.text
      ? `\nContent:\n${page.text}`
      : "\nContent: (page had no readable text)";
    parts.push(`${header}${titleLine}${bodyLine}`);
  }

  parts.push(
    "\nUse the fetched page content above in your reply. " +
      "Do not tell the user you cannot open links when this block is present. " +
      "If Content is empty or says fetch failed, do not invent page or video details from chat history — say the page could not be read.",
  );

  return parts.join("\n\n");
}

export function formatLinkFetchFailure(urls: string[], err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  const list = urls.join(", ");
  return (
    `The message included link(s) (${list}) but Playwright could not fetch them: ${detail}\n\n` +
    `Tell the user live page fetch failed. Do not pretend you opened the links successfully.`
  );
}
