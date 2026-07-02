import OpenAI from "openai";
import { config } from "../config/index.js";
import { getSettings } from "../db/index.js";
import {
  checkHealthFor,
  listModelsFrom,
  type LlmModel,
} from "./client.js";

/** Image dimensions as [width, height] in pixels. */
export type ImageSize = [number, number];

/** Default image size used when the caller does not specify one. */
export const DEFAULT_IMAGE_SIZE: ImageSize = [1024, 1024];

function resolveOpenAiBaseUrl(): string {
  const host = config.imageBaseUrl.trim().replace(/\/$/, "");
  if (!host) {
    throw new Error(
      "Image generation base URL is not configured (set IMAGE_GENERATION_BASE_URL or LLM_BASE_URL in .env)",
    );
  }
  return host.endsWith("/v1") ? host : `${host}/v1`;
}

function imagesClient(): OpenAI {
  return new OpenAI({
    apiKey: config.imageApiKey || "not-needed",
    baseURL: resolveOpenAiBaseUrl(),
    maxRetries: 0,
  });
}

/** List models available on the image host (may differ from the chat LLM host). */
export async function listImageModels(): Promise<LlmModel[]> {
  return listModelsFrom(config.imageBaseUrl, config.imageApiKey);
}

/** Health-check the image host. */
export async function checkImageHealth(): Promise<void> {
  return checkHealthFor(config.imageBaseUrl, config.imageApiKey);
}

/**
 * Generate one or more images from a prompt via the dashboard-configured image
 * model on the OpenAI-compatible `/v1/images/generations` endpoint. Returns the
 * base64-encoded PNG payloads. Throws when no image model is configured or the
 * host returns no image data.
 */
export async function generateImages(
  prompt: string,
  size: ImageSize = DEFAULT_IMAGE_SIZE,
): Promise<string[]> {
  const model = (await getSettings()).imageModel.trim();
  if (!model) {
    throw new Error(
      "No image generation model configured (set one in the dashboard Settings → Image model)",
    );
  }
  const response = await imagesClient().images.generate({
    model,
    prompt,
    size: `${size[0]}x${size[1]}`,
    // Ollama's experimental endpoint (and the GPT image models) only return
    // base64; URLs are not available here.
    response_format: "b64_json",
  });
  const images = (response.data ?? [])
    .map((item) => item.b64_json)
    .filter((b64): b64 is string => Boolean(b64));
  if (images.length === 0) {
    throw new Error("Image generation returned no image data");
  }
  return images;
}
