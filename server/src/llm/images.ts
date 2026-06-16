import { getSettings } from "../db/index.js";
import { normalizeImageForChat as normalizeImage } from "@llm-tg-bot/modules-vision";

/** Normalize Telegram image bytes for OpenAI-compatible vision chat requests. */
export async function normalizeImageForChat(base64: string): Promise<string> {
  return normalizeImage(base64, getSettings().visionMaxDimension);
}
