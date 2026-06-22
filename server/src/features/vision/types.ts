export type ImagePayload = { base64: string; mimeHint: string };

export interface VisionChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

export interface LoadedVisionMedia {
  images: ImagePayload[];
  /** Present when vision input came from a sticker message. */
  sourceSticker?: import("@grammyjs/types").Sticker;
  visionHint?: string;
  /** Set when a sticker could not be loaded for vision. */
  unavailableText?: string;
}
