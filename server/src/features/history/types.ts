export const ASSISTANT_ROLE = "assistant";

export interface StoredMessage {
  role: string;
  content: string;
  /** Telegram message_id for passive user rows (queue history pointer). */
  messageId?: number;
  /** Telegram message_id this row is a reply to, when it replied to something. */
  replyToMessageId?: number;
  /** Unix epoch seconds when the row was stored. */
  createdAt?: number;
}

export interface KnownUserRecord {
  userId: string;
  username?: string | null;
  firstName?: string | null;
}
