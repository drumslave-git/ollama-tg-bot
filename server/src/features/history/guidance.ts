export const HISTORY_TODAY_GET_LATEST_DESCRIPTION =
  "Return the most recent messages from THIS chat today. " +
  "Use to recall what was just said when you need immediate conversation context.";

export const HISTORY_TODAY_SEARCH_DESCRIPTION =
  "Full-text search over THIS chat's messages from today only. " +
  "Start here for recall; most questions are about something said today. " +
  "Pass an array of queries to search several terms/phrasings in one call. " +
  "If you find nothing relevant, escalate to history_summaries_search for older days.";

export const HISTORY_GET_MESSAGES_DESCRIPTION =
  "Fetch the exact original messages for a list of message ids, typically the message_ids " +
  "returned by history_summaries_search for a topic. This is how you read the real wording " +
  "behind a summary. entity_id is the chat id from the [SESSION] block.";

export const HISTORY_SEARCH_DESCRIPTION =
  "Full-text search over ALL of THIS chat's stored messages (every day). " +
  "Use as a fallback when history_summaries_search found no relevant topic, or for a direct " +
  "keyword/name lookup across the whole history. Pass an array of queries to search several " +
  "terms/phrasings in one call. entity_id is the chat id from the [SESSION] block.";

export const HISTORY_GET_IN_RANGE_DESCRIPTION =
  "Return messages stored within a datetime range (ISO-8601, e.g. 2026-06-22T00:00:00Z). " +
  "Use to read a whole day once history_summaries_search points you to a date; pass that " +
  "day's start and end. entity_id is the chat id from the [SESSION] block.";
