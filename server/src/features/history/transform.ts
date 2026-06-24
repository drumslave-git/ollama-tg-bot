export {
  formatHistoryPointer,
  parseHistoryPointer,
} from "./history-pointer.js";

/** Chat id for DM or group. Forum topics share the group key (no thread suffix). */
export function conversationKey(chatId: number): string {
  return String(chatId);
}
