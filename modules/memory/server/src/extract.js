import { auxiliaryChatComplete, } from "@llm-tg-bot/modules-utils";
import { buildMemoryExtractMessages, MEMORY_EXTRACT_RESPONSE_FORMAT, parseMemoryExtract, } from "./extract-prompt.js";
import { buildMemoryMergeMessages, MEMORY_MERGE_RESPONSE_FORMAT, parseMemoryBlock, } from "./merge-prompt.js";
export const MEMORY_EXTRACT_NUM_PREDICT = 384;
export const MEMORY_MERGE_NUM_PREDICT = 1024;
export async function extractMemories(input, config) {
    const messages = buildMemoryExtractMessages(input);
    try {
        const raw = config.chatComplete
            ? await config.chatComplete(messages)
            : await auxiliaryChatComplete({
                baseUrl: config.baseUrl,
                model: config.model,
                apiKey: config.apiKey,
            }, messages, { numPredict: config.numPredict ?? MEMORY_EXTRACT_NUM_PREDICT,
                responseFormat: MEMORY_EXTRACT_RESPONSE_FORMAT,
            });
        const parsed = parseMemoryExtract(raw);
        return {
            userFacts: parsed.userFacts,
            groupFacts: input.isGroupChat ? parsed.groupFacts : [],
            generalFacts: parsed.generalFacts,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Memory extract LLM request failed: ${message}`);
    }
}
export async function mergeMemoryDocument(input, config) {
    const messages = buildMemoryMergeMessages(input);
    const raw = config.chatComplete
        ? await config.chatComplete(messages)
        : await auxiliaryChatComplete({
            baseUrl: config.baseUrl,
            model: config.model,
            apiKey: config.apiKey,
        }, messages, {
            numPredict: config.numPredict ?? MEMORY_MERGE_NUM_PREDICT,
            responseFormat: MEMORY_MERGE_RESPONSE_FORMAT,
        });
    return parseMemoryBlock(raw);
}
export const memoryExtractModule = {
    id: "memory-extract",
    run: extractMemories,
};
