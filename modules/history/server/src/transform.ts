import {
  parseUserRole,
  stripAssistantHistoryEnvelope,
  filterInjectableHistory,
} from "./format.js";
import {
  ASSISTANT_ROLE,
  COMPRESSED_ROLE,
  HISTORY_APPROX_CHARS_PER_TOKEN,
  type HistoryChatMessage,
  type StoredMessage,
} from "./types.js";

export function isCompressedRole(role: string): boolean {
  return role === COMPRESSED_ROLE;
}

/** Chat id for DM or group. Forum topics share the group key (no thread suffix). */
export function conversationKey(chatId: number): string {
  return String(chatId);
}

export function historyTotalChars(history: StoredMessage[]): number {
  return filterInjectableHistory(history).reduce(
    (n, m) => n + m.content.length,
    0,
  );
}

export function historyTotalTokens(history: StoredMessage[]): number {
  if (history.length === 0) return 0;
  return Math.ceil(historyTotalChars(history) / HISTORY_APPROX_CHARS_PER_TOKEN);
}

export function historyToChatMessages(
  history: StoredMessage[],
): HistoryChatMessage[] {
  return filterInjectableHistory(history).map((m) => {
    const role = m.role === ASSISTANT_ROLE ? "assistant" : "user";
    const isAssistant = role === "assistant";
    const parsedUser = parseUserRole(m.role);

    let content = m.content;
    let name: string | undefined;

    if (isCompressedRole(m.role)) {
      content = m.content;
      name = "narrative_summary";
    } else if (isAssistant) {
      content = stripAssistantHistoryEnvelope(m.content);
    } else if (parsedUser) {
      name = parsedUser.username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
      content = m.content;
    }

    return { role, content, name };
  });
}
