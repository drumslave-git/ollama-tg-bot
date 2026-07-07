export const HISTORY_SUMMARIES_SEARCH_DESCRIPTION =
  "Semantic (vector + keyword) search over daily summaries of this chat's past conversations. " +
  "Use this for older recall AFTER checking today's messages with history_today_search: it finds " +
  "the topic/day a subject was discussed. Each result has a date and the message_ids that belong " +
  "to that topic; pass those ids to history_get_messages to read the exact original messages. " +
  "Pass an array of queries to search several topics/phrasings in one call. " +
  "entity_id is the chat id from the [SESSION] block.";
