import type { ChatMessage, JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import {
  asObject,
  parseJsonContent,
  readBoolean,
  readNullableString,
  reasoningJsonUserTail,
  reasoningSchemaSystemSuffix,
  responseFormatForThinking,
  strictObjectSchema,
} from "@llm-tg-bot/modules-utils";

export const SEARCH_RESPONSE_FORMAT: JsonSchemaResponseFormat =
  strictObjectSchema(
    "search_decision",
    {
      needs_search: {
        type: "boolean",
        description: "True when a web search should run before answering.",
      },
      query: {
        type: ["string", "null"],
        description:
          "Short search-engine query when needs_search is true; otherwise null.",
      },
    },
    ["needs_search", "query"],
  );

export function getSearchResponseFormat(
  thinkingEnabled: boolean,
): JsonSchemaResponseFormat {
  return responseFormatForThinking(SEARCH_RESPONSE_FORMAT, thinkingEnabled);
}

export const SEARCH_ANALYZER_SYSTEM = `You decide whether a Telegram bot should run a web search before answering.

Respond with JSON only, matching the provided schema:
- needs_search (boolean): true when the open web is needed before answering
- query (string or null): a short search-engine query when needs_search is true; null when false

Say needs_search=true when the user needs information that is likely:
- Current (news, prices, weather, releases, "today", recent events)
- Specific factual lookup (who is X now, when did Y happen, statistics, laws)
- About a product, company, person, or place you would not reliably know from training alone

Say needs_search=false when:
- Casual chat, opinions, creativity, jokes, roleplay
- Explaining general concepts that do not need up-to-date data
- Discussing the attached image/sticker only
- The answer is clearly in the message or quoted reply alone
- Memory/personal context questions with no need for the open web

When needs_search is true, query must be a short search-engine query (few keywords), in the user's language when obvious.`;

export interface SearchDecisionOutput {
  needsSearch: boolean;
  query: string | null;
  reason: string;
}

export function parseSearchDecision(raw: string): SearchDecisionOutput {
  const parsed = asObject(parseJsonContent(raw));
  if (!parsed) {
    return {
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    };
  }

  const needsSearch = readBoolean(parsed, "needs_search");
  if (needsSearch === null) {
    return {
      needsSearch: false,
      query: null,
      reason: "Could not parse LLM search decision",
    };
  }

  if (!needsSearch) {
    return {
      needsSearch: false,
      query: null,
      reason: "LLM decision: no",
    };
  }

  const query = readNullableString(parsed, "query");
  if (!query) {
    return {
      needsSearch: false,
      query: null,
      reason: "LLM said yes but query was missing",
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
  thinkingEnabled?: boolean;
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
    "\n\n" +
    reasoningJsonUserTail(
      "needs_search and query (null when needs_search is false)",
      !!params.thinkingEnabled,
    );

  return [
    {
      role: "system",
      content:
        SEARCH_ANALYZER_SYSTEM +
        reasoningSchemaSystemSuffix(!!params.thinkingEnabled),
    },
    { role: "user", content },
  ];
}
