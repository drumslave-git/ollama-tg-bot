import { auxiliaryChatComplete, } from "@llm-tg-bot/modules-utils";
import { buildMoodEvaluateMessages, MOOD_RESPONSE_FORMAT, parseMoodBlock, } from "./prompt.js";
import { normalizeMoodValues } from "./values.js";
export const MOOD_EVAL_NUM_PREDICT = 192;
export async function evaluateMood(input, config) {
    const fallback = normalizeMoodValues(input.currentMood);
    const messages = buildMoodEvaluateMessages(input);
    try {
        const raw = config.chatComplete
            ? await config.chatComplete(messages)
            : await auxiliaryChatComplete({
                baseUrl: config.baseUrl,
                model: config.model,
                apiKey: config.apiKey,
            }, messages, { numPredict: config.numPredict ?? MOOD_EVAL_NUM_PREDICT,
                responseFormat: MOOD_RESPONSE_FORMAT,
            });
        return parseMoodBlock(raw, fallback);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            mood: fallback,
            reason: `LLM request failed: ${message}`,
        };
    }
}
export const moodEvaluationModule = {
    id: "mood-evaluation",
    run: evaluateMood,
};
