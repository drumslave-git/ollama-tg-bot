import type {
  ModuleDefinition,
  ModuleEventFields,
  ModuleLogging,
} from "../../shared/index.js";
import {
  VISION_DESCRIBE_NUM_PREDICT,
  VISION_DESCRIBE_SYSTEM,
  VISION_DESCRIBE_USER,
} from "./describe-prompt.js";
import type { ImagePayload, VisionChatMessage } from "./types.js";

export interface VisionDescribeInput {
  images: ImagePayload[];
  visionHint?: string;
  traceTurnId?: number;
  logContext?: ModuleEventFields;
}

export interface VisionDescribeConfig {
  /**
   * Host-provided vision chat completion (tracing, image normalization, settings).
   */
  chatComplete: (
    messages: VisionChatMessage[],
    options: {
      numPredict: number;
      auxiliary: boolean;
      traceTurnId?: number;
      traceLabel?: string;
    },
  ) => Promise<string>;
  log?: ModuleLogging;
}

export interface VisionDescribeOutput {
  description: string;
}

/** Context-free vision pass — used only to build history text, not the main reply. */
export async function describeVisionImages(
  input: VisionDescribeInput,
  config: VisionDescribeConfig,
): Promise<string> {
  if (input.images.length === 0) return "";

  const logContext = input.logContext ?? {};
  config.log?.logEvent?.("vision_started", {
    ...logContext,
    imageCount: input.images.length,
  });

  try {
    const messages: VisionChatMessage[] = [
      { role: "system", content: VISION_DESCRIBE_SYSTEM },
      {
        role: "user",
        content: [VISION_DESCRIBE_USER, input.visionHint]
          .filter(Boolean)
          .join("\n\n"),
        images: input.images.map((i) => i.base64),
      },
    ];

    const raw = await config.chatComplete(messages, {
      numPredict: VISION_DESCRIBE_NUM_PREDICT,
      auxiliary: true,
      traceTurnId: input.traceTurnId,
      traceLabel: "vision describe",
    });
    const description = raw.trim();
    config.log?.logEvent?.("vision_done", {
      ...logContext,
      chars: description.length,
    });
    return description;
  } catch (err) {
    config.log?.logEventError?.("vision_failed", err, logContext);
    throw err;
  }
}

export const visionDescribeModule: ModuleDefinition<
  VisionDescribeInput,
  VisionDescribeConfig,
  VisionDescribeOutput
> = {
  id: "vision",
  run: async (input, config) => ({
    description: await describeVisionImages(input, config),
  }),
};
