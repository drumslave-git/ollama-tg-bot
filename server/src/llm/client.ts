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
  ChatCompletionCreateParamsStreaming,
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
  parseAssistantMessage,
  providerChatExtensions,
  shouldUseResponseFormat,
} from "./openai-compat.js";
import { getRecorder } from "../debug/processing-recorder.js";
import { sanitizeLlmPayloadForDebug } from "./debug-payload.js";
import { extractModelMaxCtx } from "../settings/context-budget.js";

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

/** Entry from optional provider model catalog (`GET /api/tags` on some backends). */
export interface ModelCatalogEntry {
  name: string;
  size?: number;
  details?: {
    parameter_size?: string;
    family?: string;
    quantization_level?: string;
  };
}

export interface ModelShowResult {
  modelMaxCtx: number | null;
  sizeBytes?: number;
  parameterSize?: string;
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

interface ChatResponse {
  message?: {
    role?: string;
    content?: string;
    reasoning?: string;
  };
  toolCalls?: ChatResponseToolCall[];
  done_reason?: string;
  eval_count?: number;
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
  return {
    message: {
      role: choice?.message?.role,
      content,
      reasoning: reasoning.trim(),
    },
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    done_reason: choice?.finish_reason ?? undefined,
    eval_count: usage?.completion_tokens ?? usage?.total_tokens,
  };
}

function resolveBaseUrl(): string {
  const host = config.llmBaseUrl.trim();
  if (!host) {
    throw new Error("LLM base URL is not configured (set LLM_BASE_URL in .env)");
  }
  return host.replace(/\/$/, "");
}

function resolveOpenAiBaseUrl(): string {
  const base = resolveBaseUrl();
  return base.endsWith("/v1") ? base : `${base}/v1`;
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
  const reason = data.done_reason ?? "unknown";
  const evalCount = data.eval_count ?? 0;
  const hadReasoning = Boolean(pickReasoning(data));

  let hint =
    "The owner can send /reset to shorten context, or raise generation tokens in Settings.";
  if (reason === "length") {
    hint = `Generation used all ${numPredict} tokens before a usable JSON reply. Raise generation tokens in Settings (try 512+), or the owner can send /reset.`;
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

export function findModelCatalogEntry(
  models: ModelCatalogEntry[],
  modelName: string,
): ModelCatalogEntry | undefined {
  const exact = models.find((entry) => entry.name === modelName);
  if (exact) return exact;

  const base = modelName.split(":")[0];
  return models.find(
    (entry) =>
      entry.name.startsWith(`${base}:`) || entry.name.split(":")[0] === base,
  );
}

/** Optional catalog endpoint some OpenAI-compatible servers expose for model size metadata. */
export async function fetchOptionalModelCatalogEntry(
  name: string,
): Promise<ModelCatalogEntry | null> {
  try {
    const base = resolveBaseUrl();
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: ModelCatalogEntry[] };
    if (!data.models?.length) return null;
    return findModelCatalogEntry(data.models, name) ?? null;
  } catch {
    return null;
  }
}

export async function showModel(
  name: string,
): Promise<ModelShowResult> {
  const empty: ModelShowResult = { modelMaxCtx: null };
  try {
    const base = resolveBaseUrl();
    const url = `${base}/api/show`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as Record<string, unknown>;
    const details = data.details as { parameter_size?: string } | undefined;
    const modelInfo = data.model_info as Record<string, unknown> | undefined;
    const parameterSize = details?.parameter_size?.trim() || undefined;
    const modelMaxCtx = modelInfo ? extractModelMaxCtx(modelInfo) : null;
    const rawSize = data.size;
    const sizeBytes =
      typeof rawSize === "number" && rawSize > 0 ? rawSize : undefined;
    return { modelMaxCtx, parameterSize, sizeBytes };
  } catch {
    return empty;
  }
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
  /** Reserved for main reply calls. */
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
  /**
   * When set, stream the completion and invoke this with the cumulative raw
   * content after each chunk. Ignored for auxiliary side passes.
   */
  onContentDelta?: (accumulated: string) => void;
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
  settings: Settings,
): Promise<{ data: ChatResponse; choice: ChatCompletion["choices"][number] | undefined }> {
  const providerSettings =
    think === false ? { ...settings, thinkingEnabled: false } : settings;
  const requestBody = chatCompletionBody(
    model,
    prepared,
    numPredict,
    auxiliary,
    settings,
    responseFormat,
    tools,
    think,
  );
  const traceLabelText = traceLabel ?? "llm";
  const traceSampling = formatTraceSamplingLine(
    providerSettings,
    auxiliary,
    responseFormat,
    tools,
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
        const message = err instanceof Error ? err.message : String(err);
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

/**
 * Streaming variant of {@link requestChat} for the main reply (no tools). Emits
 * cumulative content via `onContentDelta`, then records the same debug trace and
 * returns the assembled {@link ChatResponse}.
 */
async function requestChatStreaming(
  model: string,
  prepared: ChatMessage[] | ChatCompletionMessageParam[],
  numPredict: number,
  traceTurnId: number | undefined,
  traceLayout: VerbosePromptLayout | undefined,
  traceLabel: string | undefined,
  responseFormat: JsonSchemaResponseFormat | undefined,
  think: boolean | undefined,
  settings: Settings,
  onContentDelta: (accumulated: string) => void,
): Promise<ChatResponse> {
  const providerSettings =
    think === false ? { ...settings, thinkingEnabled: false } : settings;
  const baseBody = chatCompletionBody(
    model,
    prepared,
    numPredict,
    false,
    settings,
    responseFormat,
    undefined,
    think,
  );
  // Token usage (eval_count) is best-effort: some backends include it on the
  // final chunk, others only with stream_options. It feeds the debug trace
  // only, so we don't request stream_options — that keeps streaming compatible
  // with OpenAI-compatible servers that reject the field.
  const requestBody = {
    ...baseBody,
    stream: true,
  } as ChatCompletionCreateParamsStreaming;

  const traceLabelText = traceLabel ?? "llm";
  const traceSampling = formatTraceSamplingLine(
    providerSettings,
    false,
    responseFormat,
    undefined,
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

  let content = "";
  let reasoning = "";
  let role: string | undefined;
  let finishReason: string | undefined;
  let evalCount: number | undefined;

  try {
    const stream = await openAiClient().chat.completions.create(requestBody, {
      timeout: getChatTimeoutMs(settings),
    });
    for await (const chunk of stream) {
      if (chunk.usage) {
        evalCount =
          chunk.usage.completion_tokens ?? chunk.usage.total_tokens ?? evalCount;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta as
        | (Record<string, unknown> & { content?: string | null; role?: string })
        | undefined;
      if (delta) {
        if (typeof delta.role === "string") role = delta.role;
        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          onContentDelta(content);
        }
        const reasoningDelta =
          typeof delta.reasoning_content === "string"
            ? delta.reasoning_content
            : typeof delta.reasoning === "string"
              ? delta.reasoning
              : "";
        if (reasoningDelta) reasoning += reasoningDelta;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  } catch (err) {
    if (traceTurnId != null) {
      const report = getRecorder(traceTurnId);
      if (report) {
        const message = err instanceof Error ? err.message : String(err);
        report.failLlmWait(
          traceLabelText,
          message,
          performance.now() - llmStarted,
        );
      }
    }
    throw err;
  }

  const data: ChatResponse = {
    message: {
      role: role ?? "assistant",
      content: content.trim(),
      reasoning: reasoning.trim(),
    },
    done_reason: finishReason,
    eval_count: evalCount,
  };

  const llmDurationMs = performance.now() - llmStarted;
  if (traceTurnId != null) {
    getRecorder(traceTurnId)?.recordLlmCall(
      traceLabelText,
      model,
      numPredict,
      prepared as ChatMessage[],
      data,
      traceLayout,
      traceSampling,
      sanitizeLlmPayloadForDebug(requestBody),
      sanitizeLlmPayloadForDebug({
        streamed: true,
        content,
        reasoning,
        finish_reason: finishReason ?? null,
        eval_count: evalCount ?? null,
      }),
      llmDurationMs,
    );
  }

  return data;
}

function formatTraceSamplingLine(
  settings: Settings,
  auxiliary: boolean,
  responseFormat?: JsonSchemaResponseFormat,
  tools?: ChatCompletionTool[],
): string {
  const temp = auxiliary ? AUXILIARY_TEMPERATURE : settings.temperature;
  const extensions = providerChatExtensions(settings, auxiliary);
  const reasoningEffort = extensions.reasoning_effort ?? "none";
  const enableThinking =
    extensions.chat_template_kwargs?.enable_thinking === true;
  const responseFormatLine = responseFormat
    ? "response_format: json_schema"
    : null;
  const toolsLine =
    tools && tools.length > 0 ? `tools: ${tools.length}` : null;
  return [
    `temperature: ${temp}`,
    `top_p: ${settings.topP}`,
    `top_k: ${settings.topK}`,
    `repeat_penalty: ${settings.repeatPenalty}`,
    `num_ctx: ${settings.numCtx}`,
    `enable_thinking: ${enableThinking}`,
    `reasoning_effort: ${reasoningEffort}`,
    responseFormatLine,
    toolsLine,
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
): ChatCompletionCreateParamsNonStreaming {
  const providerSettings =
    think === false ? { ...settings, thinkingEnabled: false } : settings;
  return {
    model,
    messages: normalizeOpenAiMessages(messages),
    stream: false,
    max_completion_tokens: numPredict,
    temperature: auxiliary ? AUXILIARY_TEMPERATURE : settings.temperature,
    top_p: settings.topP,
    ...providerChatExtensions(providerSettings, auxiliary),
    ...(shouldUseResponseFormat(settings, auxiliary, responseFormat)
      ? { response_format: toOpenAiResponseFormat(responseFormat) }
      : {}),
    ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
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
    const numPredict = auxiliary
      ? getAuxiliaryNumPredict(settings, options?.numPredict)
      : getEffectiveNumPredict(settings, {
          baseNumPredict: options?.numPredict,
        });

    if (options?.onContentDelta && !auxiliary) {
      const data = await requestChatStreaming(
        model,
        prepared,
        numPredict,
        traceTurnId,
        traceLayout,
        traceLabel,
        options.responseFormat,
        options.think,
        settings,
        options.onContentDelta,
      );
      const streamedContent = pickAssistantContent(data);
      const streamedThinking = pickReasoning(data);
      if (streamedContent) {
        return { raw: streamedContent, thinking: streamedThinking };
      }
      throw emptyResponseError(model, data, numPredict);
    }

    const { data, choice } = await requestChat(
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
      settings,
    );
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
    // Some backends still put side-pass blocks only in reasoning when misconfigured.
    if (auxiliary && thinking) {
      return { raw: thinking, thinking: "" };
    }
    throw emptyResponseError(model, data, numPredict);
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

function wrapModelListError(err: unknown): Error {
  const apiUrl = resolveBaseUrl();
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
