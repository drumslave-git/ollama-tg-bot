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
