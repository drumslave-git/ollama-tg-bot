export const ASSISTANT_ROLE = "assistant";

export interface StoredMessage {
  role: string;
  content: string;
  /** Telegram message_id for passive user rows (queue history pointer). */
  messageId?: number;
  /** Unix epoch seconds when the row was stored. */
  createdAt?: number;
}

export interface KnownUserRecord {
  userId: string;
  username?: string | null;
  firstName?: string | null;
}

export interface HistoryChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
}
