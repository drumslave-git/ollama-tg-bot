import { filterInjectableHistory } from "./format.js";
import type { StoredMessage } from "./types.js";

/** Queue / turn anchor: `{convKey}:{telegramMessageId}`. */
export function formatHistoryPointer(
  convKey: string,
  messageId: number,
): string {
  return `${convKey}:${messageId}`;
}

export function parseHistoryPointer(
  pointer: string,
): { convKey: string; messageId: number } | null {
  const sep = pointer.lastIndexOf(":");
  if (sep <= 0) return null;
  const convKey = pointer.slice(0, sep);
  const messageId = Number(pointer.slice(sep + 1));
  if (!convKey || !Number.isFinite(messageId)) return null;
  return { convKey, messageId };
}

export function findMessageRowRange(
  history: StoredMessage[],
  messageId: number,
): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < history.length; i++) {
    if (history[i]!.messageId !== messageId) continue;
    if (start < 0) start = i;
    end = i;
  }
  return start >= 0 ? { start, end } : null;
}

/** Injectable rows strictly before the anchored Telegram message. */
export function historyBeforeMessageId(
  history: StoredMessage[],
  messageId: number,
): StoredMessage[] {
  const range = findMessageRowRange(history, messageId);
  if (range) {
    return filterInjectableHistory(history.slice(0, range.start));
  }
  const firstLater = history.findIndex(
    (row) => row.messageId != null && row.messageId >= messageId,
  );
  if (firstLater < 0) return filterInjectableHistory(history);
  return filterInjectableHistory(history.slice(0, firstLater));
}

export function insertIndexAfterMessageId(
  history: StoredMessage[],
  messageId: number,
): number {
  const range = findMessageRowRange(history, messageId);
  return range ? range.end + 1 : history.length;
}
