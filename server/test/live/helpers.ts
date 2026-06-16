import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { ChatMessage } from "../../src/llm/client.js";
import { parseAssistantMessage, providerChatExtensions, shouldUseResponseFormat } from "../../src/llm/openai-compat.js";
import {
  extractTelegramReply,
  MAIN_REPLY_RESPONSE_FORMAT,
} from "../../src/prompts/response-format.js";
import {
  AUXILIARY_NUM_PREDICT,
  AUXILIARY_TEMPERATURE,
} from "../../src/settings/limits.js";
import { toOpenAiResponseFormat } from "@llm-tg-bot/modules-utils";
import type { JsonSchemaResponseFormat } from "@llm-tg-bot/modules-utils";
import { makeSettings } from "../helpers/settings.js";

export interface LiveConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

/** Read live LLM config from env, or null when not configured (suite self-skips). */
export function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  const baseURL = rawBase.endsWith("/v1") ? rawBase : `${rawBase}/v1`;
  return {
    baseURL,
    model,
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim() || "not-needed",
  };
}

/** True when the live reasoning suite (`test:llm:reasoning`) is active. */
export function liveReasoningMode(): boolean {
  const raw = process.env.LLM_THINKING_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function liveClient(cfg: LiveConfig): OpenAI {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, maxRetries: 0 });
}

export interface TurnResult {
  content: string;
  reasoning: string;
  reply: string;
  finishReason: string | null;
}

/**
 * Run one chat turn through the *production* code paths: provider extensions
 * from {@link providerChatExtensions}, response parsing via
 * {@link parseAssistantMessage}, and reply extraction via
 * {@link extractTelegramReply}. Keeps the live test honest about what the bot
 * actually does, while only depending on a generic OpenAI-compatible API.
 */
export async function runTurn(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  opts: { numPredict?: number; thinkingEnabled?: boolean } = {},
): Promise<TurnResult> {
  const settings = makeSettings({
    numCtx: 8192,
    thinkingEnabled: opts.thinkingEnabled ?? liveReasoningMode(),
  });
  const ext = providerChatExtensions(settings, false);
  const completion: ChatCompletion = await client.chat.completions.create({
    model,
    messages,
    stream: false,
    max_completion_tokens: opts.numPredict ?? 512,
    temperature: settings.temperature,
    top_p: settings.topP,
    ...ext,
    ...(shouldUseResponseFormat(settings, false, MAIN_REPLY_RESPONSE_FORMAT)
      ? { response_format: toOpenAiResponseFormat(MAIN_REPLY_RESPONSE_FORMAT) }
      : {}),
  });

  const choice = completion.choices[0];
  const { content, reasoning } = parseAssistantMessage(choice);
  return {
    content,
    reasoning,
    reply: extractTelegramReply(content),
    finishReason: choice?.finish_reason ?? null,
  };
}

/** Convert the bot's internal {@link ChatMessage} shape into OpenAI params. */
export function toParams(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map(
    (m) =>
      ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
      }) as ChatCompletionMessageParam,
  );
}

export interface AuxResult {
  content: string;
  reasoning: string;
  finishReason: string | null;
}

/**
 * Run one *auxiliary* side-pass (address/search/memory/mood) the way the bot
 * does: low temperature and `reasoning_effort: none` via
 * {@link providerChatExtensions}, parsed through {@link parseAssistantMessage}.
 * Returns the raw assistant content (callers apply the feature parser).
 */
export async function runAuxiliary(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  opts: { numPredict?: number; responseFormat?: JsonSchemaResponseFormat } = {},
): Promise<AuxResult> {
  const settings = makeSettings({ numCtx: 8192, thinkingEnabled: false });
  const ext = providerChatExtensions(settings, true);
  // Mirror production: side passes never run below the auxiliary floor, which
  // must cover hidden reasoning + the structured answer on reasoning backends.
  const numPredict = Math.max(AUXILIARY_NUM_PREDICT, opts.numPredict ?? 0);
  const completion: ChatCompletion = await client.chat.completions.create({
    model,
    messages: toParams(messages),
    stream: false,
    max_completion_tokens: numPredict,
    temperature: AUXILIARY_TEMPERATURE,
    top_p: settings.topP,
    ...ext,
    ...(opts.responseFormat
      ? { response_format: toOpenAiResponseFormat(opts.responseFormat) }
      : {}),
  });
  const choice = completion.choices[0];
  const { content, reasoning } = parseAssistantMessage(choice);
  // Some backends route side-pass blocks to reasoning when content is empty.
  const effective = content || reasoning;
  return {
    content: effective,
    reasoning,
    finishReason: choice?.finish_reason ?? null,
  };
}
