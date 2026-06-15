import OpenAI from "openai";
import { toOpenAiResponseFormat, } from "./json-schema.js";
/** Floor for auxiliary side-pass generation budget (reasoning backends need headroom). */
export const AUXILIARY_NUM_PREDICT = 768;
export const AUXILIARY_TEMPERATURE = 0.2;
function normalizeBaseUrl(baseUrl) {
    const trimmed = baseUrl.trim();
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}
function toParams(messages) {
    return messages.map((m) => ({
        role: m.role,
        content: m.content,
    }));
}
function pickAssistantContent(choice) {
    const content = choice.message?.content;
    return typeof content === "string" ? content.trim() : "";
}
/**
 * Stateless auxiliary chat completion for side-pass modules.
 * Uses low temperature and `reasoning_effort: none` when supported.
 */
export async function auxiliaryChatComplete(llm, messages, options = {}) {
    const client = new OpenAI({
        apiKey: llm.apiKey?.trim() || "not-needed",
        baseURL: normalizeBaseUrl(llm.baseUrl),
        maxRetries: 0,
        timeout: options.timeoutMs ?? 120_000,
    });
    const numPredict = Math.max(AUXILIARY_NUM_PREDICT, options.numPredict ?? 0);
    const completion = await client.chat.completions.create({
        model: llm.model,
        messages: toParams(messages),
        stream: false,
        max_completion_tokens: numPredict,
        temperature: AUXILIARY_TEMPERATURE,
        reasoning_effort: "none",
        options: {
            skip_special_tokens: false,
        },
        ...(options.responseFormat
            ? { response_format: toOpenAiResponseFormat(options.responseFormat) }
            : {}),
    });
    const text = pickAssistantContent(completion.choices[0] ?? { message: { content: "" } });
    if (!text) {
        throw new Error("LLM returned empty auxiliary response");
    }
    return text;
}
