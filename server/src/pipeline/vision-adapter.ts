import {
  describeVisionImages as runVisionDescribe,
  type ImagePayload,
} from "@llm-tg-bot/modules-vision";
import { chatComplete } from "../llm/client.js";
import { logEvent, logEventError, type EventFields } from "../logging/event-log.js";

const visionDescribeConfig = {
  chatComplete: (
    messages: Parameters<typeof chatComplete>[0],
    options: {
      numPredict: number;
      auxiliary: boolean;
      traceTurnId?: number;
      traceLabel?: string;
    },
  ) =>
    chatComplete(messages, {
      numPredict: options.numPredict,
      auxiliary: options.auxiliary,
      traceTurnId: options.traceTurnId,
      traceLabel: options.traceLabel,
    }),
  log: {
    logEvent: (event: string, fields?: Record<string, unknown>) =>
      logEvent(event, fields as EventFields),
    logEventError: (
      event: string,
      err: unknown,
      fields?: Record<string, unknown>,
    ) => logEventError(event, err, fields as EventFields),
  },
};

/** Pipeline host adapter for vision describe (tracing + provider settings). */
export async function describeVisionImages(
  images: ImagePayload[],
  logContext: EventFields = {},
  visionHint?: string,
  traceTurnId?: number,
): Promise<string> {
  return runVisionDescribe(
    { images, visionHint, traceTurnId, logContext },
    visionDescribeConfig,
  );
}
