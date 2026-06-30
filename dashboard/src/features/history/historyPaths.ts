/** Route helpers for the History feature (chat list → summaries → source messages). */

export const historyRootPath = "/history";

export function chatSummariesPath(chatId: string): string {
  return `/history/chat/${encodeURIComponent(chatId)}`;
}

export function topicMessagesPath(chatId: string, topicId: number): string {
  return `/history/chat/${encodeURIComponent(chatId)}/topic/${topicId}`;
}
