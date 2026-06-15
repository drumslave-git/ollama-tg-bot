import { auxiliaryChatComplete, } from "@llm-tg-bot/modules-utils";
import { ADDRESS_RESPONSE_FORMAT, buildAddressAnalyzerMessages, formatBotLabels, parseAddressDecision, } from "./prompt.js";
const DEFAULT_NUM_PREDICT = 192;
export async function detectAddressing(input, config) {
    const text = input.message.trim();
    if (!text) {
        return { result: false, reason: "Empty message" };
    }
    const messages = buildAddressAnalyzerMessages({
        botLabels: formatBotLabels(config.botAliases),
        chatType: input.chatType ?? "group",
        sender: input.sender ?? "Someone",
        text,
    });
    try {
        const raw = config.chatComplete
            ? await config.chatComplete(messages)
            : await auxiliaryChatComplete({
                baseUrl: config.baseUrl,
                model: config.model,
                apiKey: config.apiKey,
            }, messages, {
                numPredict: config.numPredict ?? DEFAULT_NUM_PREDICT,
                responseFormat: ADDRESS_RESPONSE_FORMAT,
            });
        return parseAddressDecision(raw);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { result: false, reason: `LLM request failed: ${message}` };
    }
}
export const addressingDetectionModule = {
    id: "addressing-detection",
    run: detectAddressing,
};
