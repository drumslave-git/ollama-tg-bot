import { errorMessage } from "../../logging/index.js";
import type { FeatureLogging } from "../../shared/index.js";
import {
  DEFAULT_IMAGE_SIZE,
  generateImages,
  type ImageSize,
} from "../../llm/images.js";

export interface ImageGenInput {
  prompt: string;
  size?: ImageSize;
}

/** Produces base64-encoded images for a prompt. Overridable in tests. */
export type ImageGenerator = (
  prompt: string,
  size: ImageSize,
) => Promise<string[]>;

export interface ImageGenConfig {
  /** Defaults to {@link generateImages}; injected in tests. */
  generate?: ImageGenerator;
  log?: FeatureLogging;
}

export interface ImageGenOutput {
  ok: boolean;
  /** Base64-encoded images, delivered to the chat by the pipeline. */
  images: string[];
  size: ImageSize;
  /** Text injected into the main LLM turn (success or failure message). */
  context: string;
  reason: string;
}

function formatSuccess(prompt: string, count: number): string {
  const plural = count === 1 ? "image" : "images";
  return (
    `Generated ${count} ${plural} for "${prompt}" and delivered ${count === 1 ? "it" : "them"} to the chat. ` +
    "Do not attempt to describe the image contents — just briefly acknowledge it in your reply."
  );
}

function formatFailure(prompt: string, err: unknown): string {
  // Lead with the error, not the prompt: the debug trace truncates this text,
  // so the actionable reason must come first (the prompt can be long).
  const shortPrompt =
    prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt;
  return (
    `Image generation failed: ${errorMessage(err)}. ` +
    (shortPrompt ? `(prompt: "${shortPrompt}") ` : "") +
    "Tell the user you could not generate the image."
  );
}

export async function runImageGeneration(
  input: ImageGenInput,
  config: ImageGenConfig,
): Promise<ImageGenOutput> {
  const prompt = input.prompt.trim();
  const size = input.size ?? DEFAULT_IMAGE_SIZE;
  if (!prompt) {
    return {
      ok: false,
      images: [],
      size,
      context: formatFailure("", new Error("Empty image prompt")),
      reason: "Empty prompt",
    };
  }

  const generate = config.generate ?? generateImages;
  try {
    const images = await generate(prompt, size);
    config.log?.logEvent?.("image_generate_done", {
      promptLen: prompt.length,
      count: images.length,
      width: size[0],
      height: size[1],
    });
    return {
      ok: true,
      images,
      size,
      context: formatSuccess(prompt, images.length),
      reason: "Image generated",
    };
  } catch (err) {
    config.log?.logEventError?.("image_generate_failed", err, {
      promptLen: prompt.length,
    });
    return {
      ok: false,
      images: [],
      size,
      context: formatFailure(prompt, err),
      reason: errorMessage(err),
    };
  }
}
