import {
  auxiliaryChatComplete,
  type ChatMessage,
  type ModuleDefinition,
} from "../../shared/index.js";
import {
  buildAddressAnalyzerMessages,
  formatBotIdentity,
  getAddressResponseFormat,
  parseAddressDecision,
} from "./prompt.js";

const DEFAULT_NUM_PREDICT = 192;

export interface AddressingDetectionInput {
  message: string;
  /** Display name of the sender; defaults to "Someone". */
  sender?: string;
  /** Telegram chat type; defaults to "group". */
  chatType?: string;
  /** When false, a regex scan found no display name in the message text. */
  nameScanFound?: boolean;
  thinkingEnabled?: boolean;
}

export interface AddressingDetectionConfig {
  baseUrl: string;
  model: string;
  botUsername: string;
  botDisplayName: string;
  apiKey?: string;
  numPredict?: number;
  /**
   * Optional host-provided completion (e.g. debug tracing).
   * When set, `baseUrl` / `model` / `apiKey` are ignored for the LLM call.
   */
  chatComplete?: (messages: ChatMessage[]) => Promise<string>;
}

export interface AddressingDetectionOutput {
  result: boolean;
  reason: string;
}

export async function detectAddressing(
  input: AddressingDetectionInput,
  config: AddressingDetectionConfig,
): Promise<AddressingDetectionOutput> {
  const text = input.message.trim();
  if (!text) {
    return { result: false, reason: "Empty message" };
  }

  const messages = buildAddressAnalyzerMessages({
    botIdentity: formatBotIdentity(config.botUsername, config.botDisplayName),
    chatType: input.chatType ?? "group",
    sender: input.sender ?? "Someone",
    text,
    nameScanFound: input.nameScanFound,
    thinkingEnabled: input.thinkingEnabled,
  });

  const responseFormat = getAddressResponseFormat(
    Boolean(input.thinkingEnabled),
  );

  try {
    const raw = config.chatComplete
      ? await config.chatComplete(messages)
      : await auxiliaryChatComplete(
          {
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
          },
          messages,
          {
            numPredict: config.numPredict ?? DEFAULT_NUM_PREDICT,
            responseFormat,
          },
        );
    return parseAddressDecision(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: false, reason: `LLM request failed: ${message}` };
  }
}

export const addressingDetectionModule: ModuleDefinition<
  AddressingDetectionInput,
  AddressingDetectionConfig,
  AddressingDetectionOutput
> = {
  id: "addressing-detection",
  run: detectAddressing,
};
