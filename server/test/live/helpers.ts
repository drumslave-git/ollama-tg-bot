import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { ChatMessage } from "../../src/llm/client.js";
import {
  isThinkingRunaway,
  parseAssistantMessage,
  providerChatExtensions,
} from "../../src/llm/openai-compat.js";
import { extractTelegramReply } from "../../src/features/completions/index.js";
import {
  AUXILIARY_NUM_PREDICT,
  AUXILIARY_REASONING_NUM_PREDICT,
  AUXILIARY_TEMPERATURE,
} from "../../src/settings/limits.js";
import {
  toOpenAiResponseFormat,
  type ReasoningEffort,
} from "../../src/shared/index.js";
import type { JsonSchemaResponseFormat } from "../../src/shared/index.js";
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
  const host = rawBase.replace(/\/$/, "");
  const baseURL = host.endsWith("/v1") ? host : `${host}/v1`;
  return {
    baseURL,
    model,
    apiKey: (process.env.LLM_API_KEY ?? "").trim() || "not-needed",
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
  opts: {
    numPredict?: number;
    thinkingEnabled?: boolean;
    reasoningEffort?: ReasoningEffort;
  } = {},
): Promise<TurnResult> {
  const settings = makeSettings({
    numCtx: 8192,
    thinkingEnabled: opts.thinkingEnabled ?? liveReasoningMode(),
    ...(opts.reasoningEffort !== undefined
      ? { reasoningEffort: opts.reasoningEffort }
      : {}),
  });
  const ext = providerChatExtensions(settings, false);
  const numPredict = opts.numPredict ?? 512;
  // Match production: the main reply is plain text with NO response_format —
  // grammar-constrained decoding pushes models into repetition loops. The reply
  // is taken from content via extractTelegramReply. See completionsHost.
  const runRequest = async (
    maxTokens: number,
    extensions: object,
  ): Promise<ChatCompletion> =>
    client.chat.completions.create({
      model,
      messages,
      stream: false,
      max_tokens: maxTokens,
      temperature: settings.temperature,
      top_p: settings.topP,
      ...extensions,
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

  let completion = await runRequest(numPredict, ext);
  let choice = completion.choices[0];
  let parsed = parseAssistantMessage(choice);
  let finishReason = choice?.finish_reason ?? null;

  // Mirror production's thinking-runaway recovery (see chatCompleteDetailed):
  // when reasoning burned the whole budget and left content empty, retry the
  // same request once with thinking turned off.
  if (isThinkingRunaway(parsed, finishReason)) {
    const retryExt = providerChatExtensions(
      { ...settings, thinkingEnabled: false },
      false,
    );
    completion = await runRequest(numPredict, retryExt);
    choice = completion.choices[0];
    parsed = parseAssistantMessage(choice);
    finishReason = choice?.finish_reason ?? null;
  }

  return {
    content: parsed.content,
    reasoning: parsed.reasoning.trim(),
    reply: extractTelegramReply(parsed.content),
    finishReason,
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
 * does: low temperature and low `reasoning_effort` when thinking is enabled via
 * {@link providerChatExtensions}, parsed through {@link parseAssistantMessage}.
 * Returns the raw assistant content (callers apply the feature parser).
 */
export async function runAuxiliary(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  opts: {
    numPredict?: number;
    responseFormat?: JsonSchemaResponseFormat;
    thinkingEnabled?: boolean;
  } = {},
): Promise<AuxResult> {
  const thinkingEnabled = opts.thinkingEnabled ?? liveReasoningMode();
  const settings = makeSettings({ numCtx: 8192, thinkingEnabled });
  const ext = providerChatExtensions(settings, true);
  const floor = thinkingEnabled
    ? AUXILIARY_REASONING_NUM_PREDICT
    : AUXILIARY_NUM_PREDICT;
  const numPredict = Math.max(floor, opts.numPredict ?? 0);
  const responseFormat = opts.responseFormat;
  const completion: ChatCompletion = await client.chat.completions.create({
    model,
    messages: toParams(messages),
    stream: false,
    max_tokens: numPredict,
    temperature: AUXILIARY_TEMPERATURE,
    top_p: settings.topP,
    ...ext,
    ...(responseFormat
      ? { response_format: toOpenAiResponseFormat(responseFormat) }
      : {}),
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
  const choice = completion.choices[0];
  const { content, reasoning } = parseAssistantMessage(choice);
  return {
    content,
    reasoning: reasoning.trim(),
    finishReason: choice?.finish_reason ?? null,
  };
}
