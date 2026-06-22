export const ASSISTANT_ROLE = "assistant";
export const COMPRESSED_ROLE = "compressed";

export const HISTORY_APPROX_CHARS_PER_TOKEN = 4;

export interface StoredMessage {
  role: string;
  content: string;
  /** Telegram message_id for passive user rows (queue history pointer). */
  messageId?: number;
  compressedAt?: number;
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
