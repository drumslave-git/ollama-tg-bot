import type { ChatMessage } from "@llm-tg-bot/modules-utils";
import { extractLastClosedBlock } from "@llm-tg-bot/modules-utils";

export const SEARCH_TAG = "SEARCH";
export const QUERY_TAG = "QUERY";

export const SEARCH_ANALYZER_SYSTEM = `You decide whether a Telegram bot should run a web search before answering.

Your entire assistant message must be exactly one of these two shapes — nothing before, nothing after, no other text or tags:

[SEARCH]
no
[/SEARCH]

or

[SEARCH]
yes
[/SEARCH]
[QUERY]
concise search query
[/QUERY]

Output rules (mandatory):
- Put the decision only in the assistant message content using the blocks above.
- For no: exactly one [SEARCH]…[/SEARCH] block with "no" (lowercase) inside.
- For yes: [SEARCH]…[/SEARCH] with "yes" inside, then [QUERY]…[/QUERY] with a short search-engine query.
- Always include opening and closing tags on their own lines.
- Do not output bare "yes"/"no", [yes], [no], or any tag other than [SEARCH] and [QUERY].
- Do not output reasoning, analysis, or explanation — only the block(s).

Say yes when the user needs information that is likely:
- Current (news, prices, weather, releases, "today", recent events)
- Specific factual lookup (who is X now, when did Y happen, statistics, laws)
- About a product, company, person, or place you would not reliably know from training alone

Say no when:
- Casual chat, opinions, creativity, jokes, roleplay
- Explaining general concepts that do not need up-to-date data
- Discussing the attached image/sticker only
- The answer is clearly in the message or quoted reply alone
- Memory/personal context questions with no need for the open web

When yes, [QUERY] must be a short search-engine query (few keywords), in the user's language when obvious.`;

export interface SearchDecisionOutput {
  needsSearch: boolean;
  query: string | null;
  reason: string;
}

export function parseSearchDecision(raw: string): SearchDecisionOutput {
  let searchValue =
    extractLastClosedBlock(raw, SEARCH_TAG)?.toLowerCase() ?? "";

  if (!searchValue) {
    const unclosed = raw.match(/\[SEARCH\]\s*(yes|no)\b\s*$/i);
    searchValue = unclosed?.[1]?.toLowerCase() ?? "";
  }

  if (!searchValue) {
    return {
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    };
  }

  if (/^no\b/.test(searchValue) || searchValue === "n") {
    return {
      needsSearch: false,
      query: null,
      reason: "LLM decision: no",
    };
  }

  if (!(/^y(es)?\b/.test(searchValue) || searchValue === "y")) {
    return {
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    };
  }

  const query = extractLastClosedBlock(raw, QUERY_TAG)?.trim() ?? "";
  if (!query) {
    return {
      needsSearch: false,
      query: null,
      reason: "LLM said yes but no [QUERY] block",
    };
  }

  return {
    needsSearch: true,
    query,
    reason: "LLM decision: yes",
  };
}

function isReplyThreadContext(context: string | null | undefined): boolean {
  return Boolean(context?.includes("[REPLY THREAD"));
}

export function buildSearchAnalyzerMessages(params: {
  message: string;
  replyContext?: string | null;
}): ChatMessage[] {
  const userText = params.message.trim();
  const replyContext = params.replyContext?.trim() ?? "";
  let content: string;
  if (isReplyThreadContext(replyContext)) {
    content = replyContext;
  } else {
    content = `User message:\n${userText || "(empty or non-text)"}`;
    if (replyContext) {
      content += `\n\nQuoted reply context:\n${replyContext}`;
    }
  }
  content +=
    "\n\nReply with only the required [SEARCH] block, or [SEARCH] plus [QUERY] when yes.";

  return [
    { role: "system", content: SEARCH_ANALYZER_SYSTEM },
    { role: "user", content },
  ];
}
