import { auxiliaryChatComplete, } from "@llm-tg-bot/modules-utils";
import { SEARCH_RESPONSE_FORMAT, buildSearchAnalyzerMessages, parseSearchDecision, } from "./prompt.js";
const DEFAULT_NUM_PREDICT = 192;
export async function decideSearch(input, config) {
    const text = input.message.trim();
    if (!text && !input.replyContext?.trim()) {
        return { needsSearch: false, query: null, reason: "Empty message" };
    }
    const messages = buildSearchAnalyzerMessages({
        message: text,
        replyContext: input.replyContext,
    });
    try {
        const raw = config.chatComplete
            ? await config.chatComplete(messages)
            : await auxiliaryChatComplete({
                baseUrl: config.baseUrl,
                model: config.model,
                apiKey: config.apiKey,
            }, messages, { numPredict: config.numPredict ?? DEFAULT_NUM_PREDICT,
                responseFormat: SEARCH_RESPONSE_FORMAT,
            });
        return parseSearchDecision(raw);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            needsSearch: false,
            query: null,
            reason: `LLM request failed: ${message}`,
        };
    }
}
export const searchDecisionModule = {
    id: "search-decision",
    run: decideSearch,
};
