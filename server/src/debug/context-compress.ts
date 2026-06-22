import {
  scheduleHistoryCompression,
  type HistoryCompressResult,
} from "../features/history/index.js";
import { getHistory, replaceHistory } from "../db/history/index.js";
import { logEvent, logEventError } from "../logging/event-log.js";
import { chatComplete } from "../llm/client.js";
import { getResolvedHistoryLimits } from "../settings/runtime.js";

export type { HistoryCompressResult };

export function ensureHistoryFits(chatKey: string): Promise<void> {
  return scheduleHistoryCompression(chatKey, buildCompressDeps()).then(() => {});
}

export function compressHistoryForChat(
  chatKey: string,
  options?: { force?: boolean },
): Promise<HistoryCompressResult> {
  return scheduleHistoryCompression(chatKey, buildCompressDeps(), options);
}

function buildCompressDeps() {
  return {
    getHistory,
    replaceHistory,
    chatComplete: (
      messages: Parameters<typeof chatComplete>[0],
      options?: { numPredict?: number },
    ) =>
      chatComplete(messages, {
        numPredict: options?.numPredict,
        auxiliary: true,
      }),
    getHistoryLimits: () => getResolvedHistoryLimits(),
    onCompressed: (info: {
      chatKey: string;
      messageCount: number;
      resultChars: number;
    }) =>
      logEvent("history_compressed", {
        convKey: info.chatKey,
        messageCount: info.messageCount,
        resultChars: info.resultChars,
      }),
    onError: (err: unknown, chatKey: string) =>
      logEventError("history_compression_failed", err, { convKey: chatKey }),
  };
}
