import { errorMessage } from "../logging/index.js";
import type { JsonSchemaResponseFormat } from "../shared/index.js";
import { toOpenAiResponseFormat } from "../shared/index.js";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Model } from "openai/resources/models";
import { config } from "../config/index.js";
import { getSettings } from "../db/index.js";
import type { Settings } from "../db/index.js";
import {
  AUXILIARY_TEMPERATURE,
  getAuxiliaryNumPredict,
  getChatTimeoutMs,
  getEffectiveNumPredict,
} from "../settings/limits.js";
import { getResolvedSettings } from "../settings/runtime.js";
import { normalizeImageForChat } from "../features/vision/index.js";
import {
  isThinkingRunaway,
  parseAssistantMessage,
  providerChatExtensions,
  shouldUseResponseFormat,
} from "./openai-compat.js";
import { getRecorder } from "../debug/processing-recorder.js";
import { sanitizeLlmPayloadForDebug } from "./debug-payload.js";

const LIST_MODELS_TIMEOUT_MS = 60_000;

export interface LlmModel {
  name: string;
  modified_at?: string;
  size?: number;
  modelMaxCtx?: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
  images?: string[];
}

interface OpenAiModel {
  id?: string;
  name?: string;
}

interface ChatResponseToolCall {
  name: string;
  arguments: string;
}

/** Token counts for one chat completion, when the provider reports usage. */
export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ChatResponse {
  message?: {
    role?: string;
    content?: string;
    reasoning?: string;
  };
  toolCalls?: ChatResponseToolCall[];
  finishReason?: string;
  completionTokens?: number;
  usage?: LlmTokenUsage;
}

function toChatResponse(
  choice: ChatCompletion["choices"][number] | undefined,
  usage: ChatCompletion["usage"],
): ChatResponse {
  const { content, reasoning } = parseAssistantMessage(choice);
  const toolCalls = (choice?.message?.tool_calls ?? [])
    .map((call) =>
      call.type === "function"
        ? { name: call.function.name, arguments: call.function.arguments }
        : null,
    )
    .filter((call): call is ChatResponseToolCall => call != null);
  const tokenUsage = toTokenUsage(usage);
  return {
    message: {
      role: choice?.message?.role,
      content,
      reasoning: reasoning.trim(),
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    finishReason: choice?.finish_reason ?? undefined,
    completionTokens: usage?.completion_tokens ?? usage?.total_tokens,
    ...(tokenUsage ? { usage: tokenUsage } : {}),
  };
}

/** Normalize provider usage into our token-count shape; undefined when absent. */
function toTokenUsage(
  usage: ChatCompletion["usage"],
): LlmTokenUsage | undefined {
  if (!usage) return undefined;
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}

function resolveBaseUrl(): string {
  const host = config.llmBaseUrl.trim();
  if (!host) {
    throw new Error("LLM base URL is not configured (set LLM_BASE_URL in .env)");
  }
  return host.replace(/\/$/, "");
}

/** Normalize any base URL to its OpenAI-compatible `/v1` form. */
function toOpenAiBaseUrl(base: string): string {
  const host = base.trim().replace(/\/$/, "");
  return host.endsWith("/v1") ? host : `${host}/v1`;
}

function resolveOpenAiBaseUrl(): string {
  return toOpenAiBaseUrl(resolveBaseUrl());
}

/** Build an OpenAI client pointed at an arbitrary host (used for the embedding host). */
function openAiClientFor(baseUrl: string, apiKey: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || "not-needed",
    baseURL: toOpenAiBaseUrl(baseUrl),
    maxRetries: 0,
  });
}

function openAiClient(): OpenAI {
  return new OpenAI({
    apiKey: config.llmApiKey || "not-needed",
    baseURL: resolveOpenAiBaseUrl(),
    maxRetries: 0,
  });
}

function pickAssistantContent(data: ChatResponse): string {
  return data.message?.content?.trim() ?? "";
}

function pickReasoning(data: ChatResponse): string {
  return data.message?.reasoning?.trim() ?? "";
}

function emptyResponseError(
  model: string,
  data: ChatResponse,
  numPredict: number,
): Error {
  const reason = data.finishReason ?? "unknown";
  const evalCount = data.completionTokens ?? 0;
  const hadReasoning = Boolean(pickReasoning(data));

  let hint =
    "The owner can send /reset to shorten context, or raise generation tokens in Settings.";
  if (reason === "length" && hadReasoning) {
    // Even after the one-shot runaway retry (same request, thinking off),
    // all tokens were consumed inside reasoning before any content was emitted:
    // a persistent thinking runaway, not a budget shortfall. Point at the real
    // lever (thinking) rather than a still-larger cap.
    hint =
      `All ${numPredict} tokens were spent on reasoning before any reply text, even after a retry with thinking turned off. ` +
      "This usually means the backend ignored the thinking-off request or the context is too large. " +
      "Check provider reasoning configuration, or the owner can send /reset.";
  } else if (reason === "length") {
    hint = `Generation used all ${numPredict} tokens before a usable reply. Raise generation tokens in Settings (above ${numPredict}), or the owner can send /reset.`;
  } else if (hadReasoning) {
    hint =
      "The API returned reasoning but left content empty. " +
      "The JSON reply must be in content, not only in reasoning. " +
      "Disable thinking, check the selected model/provider reasoning configuration, or the owner can send /reset.";
  }

  const fields = Object.keys(data).sort().join(", ") || "none";
  return new Error(
    `LLM returned an empty response (model: ${model}, finish_reason: ${reason}, tokens: ${evalCount}, fields: ${fields}). ${hint}`,
  );
}

export async function listModels(): Promise<LlmModel[]> {
  try {
    const page = await openAiClient().models.list({
      timeout: LIST_MODELS_TIMEOUT_MS,
    });
    return normalizeModels(page.data ?? []);
  } catch (err) {
    throw wrapModelListError(err);
  }
}

/** List models from an arbitrary OpenAI-compatible host (e.g. the embedding host). */
export async function listModelsFrom(
  baseUrl: string,
  apiKey: string,
): Promise<LlmModel[]> {
  const host = baseUrl.trim();
  if (!host) {
    throw new Error("Base URL is not configured");
  }
  try {
    const page = await openAiClientFor(host, apiKey).models.list({
      timeout: LIST_MODELS_TIMEOUT_MS,
    });
    return normalizeModels(page.data ?? []);
  } catch (err) {
    throw wrapModelListError(err, host.replace(/\/$/, ""));
  }
}

function normalizeModels(models: (OpenAiModel | Model)[]): LlmModel[] {
  const seen = new Set<string>();
  return models
    .map((entry) => {
      const fallbackName = "name" in entry ? entry.name : "";
      const name = (entry.id ?? fallbackName ?? "").trim();
      if (!name || seen.has(name)) return null;
      seen.add(name);
      return { name };
    })
    .filter((m): m is LlmModel => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function messagesHaveImages(
  messages: ChatMessage[] | ChatCompletionMessageParam[],
): boolean {
  return messages.some((msg) => "images" in msg && Boolean(msg.images?.length));
}

async function prepareMessages(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const visionMaxDimension = (await getSettings()).visionMaxDimension;
  return Promise.all(
    messages.map(async (msg) => {
      if (!msg.images?.length) return msg;
      const images = await Promise.all(
        msg.images.map((b64) =>
          normalizeImageForChat(b64, visionMaxDimension),
        ),
      );
      return { ...msg, images };
    }),
  );
}

export interface VerbosePromptLayout {
  system: string;
  latest: string;
}

export interface ChatCompleteOptions {
  model?: string;
  numPredict?: number;
  /** Use low temperature for structured side passes (mood, memory, search, etc.). */
  auxiliary?: boolean;
  /** `false` forces thinking off for this call regardless of settings (e.g. the address gate). */
  think?: boolean;
  /** Record LLM I/O on the active debug trace for this turn. */
  traceTurnId?: number;
  /** Debug trace section label, e.g. "web search decision". */
  traceLabel?: string;
  /** Split main-reply prompt into system / history / latest sections for debug trace. */
  traceLayout?: VerbosePromptLayout;
  /** Force JSON output via OpenAI-compatible response_format. */
  responseFormat?: JsonSchemaResponseFormat;
  /** OpenAI-compatible tools for MCP tool rounds. */
  tools?: ChatCompletionTool[];
  /** When true, return tool_calls instead of failing on empty content. */
  allowToolCalls?: boolean;
  /** Stop sequences that end generation when produced (max 4 on most backends). */
  stop?: string[];
}

async function requestChat(
  model: string,
  prepared: ChatMessage[] | ChatCompletionMessageParam[],
  numPredict: number,
  auxiliary: boolean,
  traceTurnId: number | undefined,
  traceLayout: VerbosePromptLayout | undefined,
  traceLabel: string | undefined,
  responseFormat: JsonSchemaResponseFormat | undefined,
  tools: ChatCompletionTool[] | undefined,
  think: boolean | undefined,
  stop: string[] | undefined,
  settings: Settings,
  forceThinkingOff = false,
): Promise<{ data: ChatResponse; choice: ChatCompletion["choices"][number] | undefined }> {
  const providerSettings =
    think === false || forceThinkingOff
      ? { ...settings, thinkingEnabled: false }
      : settings;
  const requestBody = chatCompletionBody(
    model,
    prepared,
    numPredict,
    auxiliary,
    settings,
    responseFormat,
    tools,
    think,
    stop,
    forceThinkingOff,
  );
  const traceLabelText = traceLabel ?? "llm";
  const traceSampling = formatTraceSamplingLine(
    providerSettings,
    auxiliary,
    responseFormat,
    tools,
    stop,
  );
  const llmStarted = performance.now();
  if (traceTurnId != null) {
    getRecorder(traceTurnId)?.beginLlmWait(
      traceLabelText,
      model,
      settings.chatTimeoutSec,
      sanitizeLlmPayloadForDebug(requestBody),
      traceSampling,
    );
  }

  let response: ChatCompletion;
  try {
    response = await openAiClient().chat.completions.create(requestBody, {
      timeout: getChatTimeoutMs(settings),
    });
  } catch (err) {
    if (traceTurnId != null) {
      const report = getRecorder(traceTurnId);
      if (report) {
        const message = errorMessage(err);
        report.failLlmWait(
          traceLabelText,
          message,
          performance.now() - llmStarted,
        );
      }
    }
    if (
      err instanceof APIConnectionTimeoutError ||
      err instanceof APIConnectionError
    ) {
      throw err;
    }
    if (err instanceof APIError) {
      const body = apiErrorDetails(err);
      if (err.status === 400 && /image|audio file/i.test(body)) {
        throw new Error(
          `LLM rejected the image (is "${model}" a vision model?). ${body}`,
        );
      }
      throw new Error(
        `LLM chat failed (${err.status ?? "unknown"}): ${body}`,
      );
    }
    throw err;
  }

  const llmDurationMs = performance.now() - llmStarted;
  const choice = response.choices?.[0];
  const data = toChatResponse(choice, response.usage);
  if (traceTurnId != null) {
    const report = getRecorder(traceTurnId);
    if (report) {
      report.recordLlmCall(
        traceLabelText,
        model,
        numPredict,
        prepared as ChatMessage[],
        data,
        traceLayout,
        traceSampling,
        sanitizeLlmPayloadForDebug(requestBody),
        sanitizeLlmPayloadForDebug(response),
        llmDurationMs,
      );
    }
  }
  return { data, choice };
}

function formatTraceSamplingLine(
  settings: Settings,
  auxiliary: boolean,
  responseFormat?: JsonSchemaResponseFormat,
  tools?: ChatCompletionTool[],
  stop?: string[],
): string {
  const temp = auxiliary ? AUXILIARY_TEMPERATURE : settings.temperature;
  const extensions = providerChatExtensions(settings, auxiliary);
  const reasoningEffort = extensions.reasoning_effort ?? "off";
  const responseFormatLine = responseFormat
    ? "response_format: json_schema"
    : null;
  const toolsLine =
    tools && tools.length > 0 ? `tools: ${tools.length}` : null;
  const stopLine =
    stop && stop.length > 0 ? `stop: ${stop.length}` : null;
  return [
    `temperature: ${temp}`,
    `top_p: ${settings.topP}`,
    `num_ctx: ${settings.numCtx}`,
    `enable_thinking: ${settings.thinkingEnabled}`,
    `reasoning_effort: ${reasoningEffort}`,
    responseFormatLine,
    toolsLine,
    stopLine,
  ]
    .filter(Boolean)
    .join(", ");
}

function hasToolFormatMessage(
  messages: (ChatMessage | ChatCompletionMessageParam)[],
): boolean {
  return messages.some(
    (message) =>
      message.role === "tool" ||
      (message.role === "assistant" &&
        "tool_calls" in message &&
        Boolean(message.tool_calls?.length)),
  );
}

function normalizeOpenAiMessages(
  messages: ChatMessage[] | ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  if (messages.length === 0) return [];
  const first = messages[0];
  if (!first) return [];
  if ("images" in first) {
    return (messages as ChatMessage[]).map(toOpenAiMessage);
  }
  // Tool-round conversations start with a plain system message but carry
  // assistant tool_calls / tool results later in the array. Mapping those
  // through toOpenAiMessage would strip tool_calls and tool_call_id, orphaning
  // the tool result so the model re-requests the same tool every round. Detect
  // tool formatting anywhere in the array, not just on the first message.
  if (hasToolFormatMessage(messages)) {
    return messages as ChatCompletionMessageParam[];
  }
  return (messages as ChatMessage[]).map(toOpenAiMessage);
}

function chatCompletionBody(
  model: string,
  messages: ChatMessage[] | ChatCompletionMessageParam[],
  numPredict: number,
  auxiliary: boolean,
  settings: Settings,
  responseFormat?: JsonSchemaResponseFormat,
  tools?: ChatCompletionTool[],
  think?: boolean,
  stop?: string[],
  forceThinkingOff?: boolean,
): ChatCompletionCreateParamsNonStreaming {
  const providerSettings =
    think === false || forceThinkingOff
      ? { ...settings, thinkingEnabled: false }
      : settings;
  return {
    model,
    messages: normalizeOpenAiMessages(messages),
    stream: false,
    max_tokens: numPredict,
    temperature: auxiliary ? AUXILIARY_TEMPERATURE : settings.temperature,
    top_p: settings.topP,
    ...(forceThinkingOff
      ? { chat_template_kwargs: { enable_thinking: false } }
      : providerChatExtensions(providerSettings, auxiliary)),
    ...(shouldUseResponseFormat(settings, auxiliary, responseFormat)
      ? { response_format: toOpenAiResponseFormat(responseFormat) }
      : {}),
    ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
    ...(stop && stop.length > 0 ? { stop } : {}),
  } as ChatCompletionCreateParamsNonStreaming;
}

export function toOpenAiMessage(msg: ChatMessage): ChatCompletionMessageParam {
  if (!msg.images?.length) {
    return {
      role: msg.role,
      content: msg.content,
      ...(msg.name ? { name: msg.name } : {}),
    } as ChatCompletionMessageParam;
  }
  if (msg.role !== "user") {
    return {
      role: msg.role,
      content: msg.content,
      ...(msg.name ? { name: msg.name } : {}),
    } as ChatCompletionMessageParam;
  }
  return {
    role: "user",
    name: msg.name,
    content: [
      { type: "text", text: msg.content },
      ...msg.images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${image}` },
      })),
    ],
  } as ChatCompletionMessageParam;
}

export interface ChatCompleteResult {
  /** Assistant final answer content. */
  raw: string;
  /** Optional model reasoning when the API returns it separately. */
  thinking: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  conversationMessages?: ChatCompletionMessageParam[];
  /**
   * Set by {@link chatCompleteWithTools} when the tool loop was stopped because
   * the model kept repeating the same action(s) without progress (a loop),
   * rather than answering on its own. Callers can fail the task on this.
   */
  loopDetected?: boolean;
}

/** Full model output (JSON reply object in content when responseFormat is set). */
export async function chatCompleteDetailed(
  messages: ChatMessage[] | ChatCompletionMessageParam[],
  options?: ChatCompleteOptions,
): Promise<ChatCompleteResult> {
  const settings = getResolvedSettings(await getSettings());
  const model = options?.model ?? settings.model;
  const prepared = messagesHaveImages(messages)
    ? await prepareMessages(messages as ChatMessage[])
    : messages;
  const traceTurnId = options?.traceTurnId;
  const traceLayout = options?.traceLayout;
  const traceLabel = options?.traceLabel;
  const auxiliary = options?.auxiliary ?? false;

  try {
    // A think:false call needs no reasoning-token headroom, so derive the
    // budget from thinking-off settings (drops the auxiliary floor to the
    // non-reasoning value).
    const budgetSettings =
      options?.think === false
        ? { ...settings, thinkingEnabled: false }
        : settings;
    const numPredict = auxiliary
      ? getAuxiliaryNumPredict(budgetSettings, options?.numPredict)
      : getEffectiveNumPredict(budgetSettings, {
          baseNumPredict: options?.numPredict,
        });

    let { data, choice } = await requestChat(
      model,
      prepared,
      numPredict,
      auxiliary,
      traceTurnId,
      traceLayout,
      traceLabel,
      options?.responseFormat,
      options?.tools,
      options?.think,
      options?.stop,
      settings,
    );
    let effectiveNumPredict = numPredict;

    // Thinking-runaway recovery: the model can spend its whole budget inside the
    // reasoning channel and emit no reply (finish_reason=length, reasoning
    // present, content empty). Retry once with the same request, except thinking
    // is forced off explicitly so the backend emits content instead of reasoning.
    // Only tool rounds are excluded — a tool_call is a valid empty-content result.
    const noToolCalls = (choice?.message?.tool_calls?.length ?? 0) === 0;
    if (
      noToolCalls &&
      isThinkingRunaway(
        { content: pickAssistantContent(data), reasoning: pickReasoning(data) },
        data.finishReason,
      )
    ) {
      ({ data, choice } = await requestChat(
        model,
        prepared,
        effectiveNumPredict,
        auxiliary,
        traceTurnId,
        traceLayout,
        traceLabel ? `${traceLabel} (thinking runaway retry)` : traceLabel,
        options?.responseFormat,
        options?.tools,
        false,
        options?.stop,
        settings,
        true,
      ));
    }

    const content = pickAssistantContent(data);
    const thinking = pickReasoning(data);
    const toolCalls = choice?.message?.tool_calls ?? [];
    if (toolCalls.length > 0 && options?.allowToolCalls) {
      const assistantMessage = choice?.message;
      return {
        raw: content,
        thinking,
        toolCalls,
        conversationMessages: assistantMessage
          ? [...normalizeOpenAiMessages(prepared), assistantMessage]
          : undefined,
      };
    }
    if (content) {
      return { raw: content, thinking };
    }
    // A misconfigured backend can place a *structured* side-pass block only in
    // the reasoning channel — recover it, but ONLY when a response_format was
    // requested. A plain-text auxiliary pass (task fire, vision describe) has no
    // JSON to salvage there, so its reasoning is raw chain-of-thought (e.g. a
    // "Wait… Wait…" runaway) that must never surface as the reply. Falling
    // through raises emptyResponseError so the caller fails the fire cleanly
    // instead of posting the model's thoughts to chat.
    if (auxiliary && thinking && options?.responseFormat) {
      return { raw: thinking, thinking: "" };
    }
    throw emptyResponseError(model, data, effectiveNumPredict);
  } catch (err) {
    throw wrapChatError(err, settings.chatTimeoutSec, auxiliary);
  }
}

export async function chatComplete(
  messages: ChatMessage[],
  options?: ChatCompleteOptions,
): Promise<string> {
  const { raw } = await chatCompleteDetailed(messages, options);
  return raw;
}

function wrapChatError(
  err: unknown,
  timeoutSec: number,
  auxiliary = false,
): Error {
  const apiUrl = resolveBaseUrl();

  if (
    err instanceof APIConnectionTimeoutError ||
    (err instanceof Error && err.name === "TimeoutError")
  ) {
    if (auxiliary) {
      return new Error(
        `LLM auxiliary request timed out after ${timeoutSec}s (${apiUrl}). The bot will skip that side pass and continue where possible.`,
      );
    }
    return new Error(
      `LLM request timed out after ${timeoutSec}s (${apiUrl}). Confirm the server is running and verify the model name matches GET /v1/models.`,
    );
  }
  if (err instanceof APIConnectionError) {
    return new Error(
      `LLM connection failed (${apiUrl}): ${err.message}. Check LLM_BASE_URL in .env.`,
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

function apiErrorDetails(err: APIError): string {
  if (typeof err.error === "string") return err.error;
  if (err.error && Object.keys(err.error).length > 0) {
    return JSON.stringify(err.error);
  }
  return err.message;
}

function wrapModelListError(err: unknown, apiUrl: string = resolveBaseUrl()): Error {
  if (err instanceof APIConnectionTimeoutError) {
    return new Error(
      `Model listing timed out (${apiUrl}): ${err.message}`,
    );
  }
  if (err instanceof APIConnectionError) {
    return new Error(
      `Model listing connection failed (${apiUrl}): ${err.message}`,
    );
  }
  if (err instanceof APIError) {
    return new Error(
      `Model listing failed (${err.status ?? "unknown"}, ${apiUrl}): ${apiErrorDetails(err)}`,
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export async function checkHealth(): Promise<void> {
  try {
    await openAiClient().models.list({ timeout: 5000 });
  } catch (err) {
    throw wrapModelListError(err);
  }
}

/** Health-check an arbitrary OpenAI-compatible host (e.g. the embedding host). */
export async function checkHealthFor(
  baseUrl: string,
  apiKey: string,
): Promise<void> {
  const host = baseUrl.trim();
  if (!host) {
    throw new Error("Base URL is not configured");
  }
  try {
    await openAiClientFor(host, apiKey).models.list({ timeout: 5000 });
  } catch (err) {
    throw wrapModelListError(err, host.replace(/\/$/, ""));
  }
}
