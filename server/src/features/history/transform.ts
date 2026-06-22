import {
  parseUserRole,
  stripAssistantHistoryEnvelope,
  filterInjectableHistory,
} from "./format.js";
import {
  ASSISTANT_ROLE,
  type HistoryChatMessage,
  type StoredMessage,
} from "./types.js";

export {
  formatHistoryPointer,
  parseHistoryPointer,
} from "./history-pointer.js";

/** Chat id for DM or group. Forum topics share the group key (no thread suffix). */
export function conversationKey(chatId: number): string {
  return String(chatId);
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

    if (isAssistant) {
      content = stripAssistantHistoryEnvelope(m.content);
    } else if (parsedUser) {
      name = parsedUser.username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
      content = m.content;
    }

    return { role, content, name };
  });
}
