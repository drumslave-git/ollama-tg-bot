import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_IMAGE_SIZE } from "../../llm/images.js";
import {
  runImageGeneration,
  type ImageGenConfig,
} from "./generate.js";

export const IMAGE_GENERATE_TOOL_NAME = "image_generate";
export const IMAGE_GEN_TOOL_NAMES = [IMAGE_GENERATE_TOOL_NAME];

// `images` carries base64 payloads read by the delivery pipeline; it is never
// fed back to the model (only the tool's text content is), so it stays out of
// the model's context.
const imageGenerateOutputSchema = z.object({
  ok: z.boolean(),
  count: z.number(),
  size: z.tuple([z.number(), z.number()]),
  images: z.array(z.string()),
});

export interface ImageGenMcpConfig extends ImageGenConfig {}

export function registerImageGenMcpTools(
  server: McpServer,
  config: ImageGenMcpConfig = {},
): void {
  server.registerTool(
    IMAGE_GENERATE_TOOL_NAME,
    {
      title: "Generate image",
      description:
        "Generate an image from a text prompt and send it to the chat. " +
        "ONLY call when the user explicitly asks you to generate, create, draw, paint, or make an image, " +
        "picture, drawing, or illustration. " +
        "Do NOT call for casual chat or when the user did not ask for an image. " +
        "The generated image is delivered to the chat automatically; in your reply just briefly acknowledge it.",
      inputSchema: z.object({
        prompt: z
          .string()
          .min(1)
          .describe(
            "Detailed description of the image to generate (English works best)",
          ),
        size: z
          .tuple([
            z.number().int().positive(),
            z.number().int().positive(),
          ])
          .default(DEFAULT_IMAGE_SIZE)
          .describe(
            "Image size as [width, height] in pixels; defaults to [1024, 1024]",
          ),
      }),
      outputSchema: imageGenerateOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ prompt, size }) => {
      const result = await runImageGeneration(
        { prompt, size: size ?? DEFAULT_IMAGE_SIZE },
        { generate: config.generate, log: config.log },
      );
      return {
        content: [{ type: "text", text: result.context }],
        structuredContent: {
          ok: result.ok,
          count: result.images.length,
          size: result.size,
          images: result.images,
        },
        ...(result.ok ? {} : { isError: true }),
      };
    },
  );
}

/** Extract the base64 images a successful `image_generate` call produced. */
export function readGeneratedImages(structuredContent: unknown): string[] {
  const parsed = imageGenerateOutputSchema.safeParse(structuredContent);
  if (!parsed.success || !parsed.data.ok) return [];
  return parsed.data.images;
}
