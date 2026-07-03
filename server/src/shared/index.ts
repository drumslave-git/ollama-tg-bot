export type { FeatureDefinition, FeatureRun } from "./contract.js";
export {
  noopFeatureLogging,
  type FeatureEventFields,
  type FeatureLogging,
} from "./logging.js";
export { extractLastClosedBlock } from "./structured-output.js";
export {
  asObject,
  jsonReplyTail,
  parseJsonContent,
  readBoolean,
  readInt,
  readNullableString,
  readString,
  readStringArray,
  strictObjectSchema,
  toOpenAiResponseFormat,
  type JsonSchemaResponseFormat,
} from "./json-schema.js";
export {
  AUXILIARY_NUM_PREDICT,
  AUXILIARY_REASONING_NUM_PREDICT,
  AUXILIARY_TEMPERATURE,
  auxiliaryChatComplete,
  type AuxiliaryChatOptions,
  type ChatMessage,
  type LlmConfig,
} from "./llm.js";
export { sanitizeModelOutput } from "./sanitize.js";
export { normalizeQueries, queryField } from "./tool-query.js";
export {
  escapeHtml,
  hasVisibleTelegramReply,
  prepareTelegramHtml,
  visibleTelegramText,
} from "./telegram-html.js";
export {
  ASSISTANT_MESSAGE_FIELDS,
  boundedRetryEffort,
  isThinkingRunaway,
  parseAssistantMessage,
  providerChatExtensions,
  providerRequestExtensions,
  shouldUseResponseFormat,
  AUXILIARY_REASONING_EFFORT,
  type ParsedAssistantMessage,
  type ProviderChatExtensions,
  type ProviderChatOptions,
  type ProviderChatSettings,
  type ReasoningEffort,
} from "./openai-compat.js";
export {
  calculateContextBudget,
  extractModelMaxCtx,
  minRequiredCtxForPredict,
  modelContextInputFromTags,
  type ContextBudget,
  type ContextBudgetLimiter,
  type ModelCatalogEntry,
  type ModelContextInput,
} from "./context-budget.js";
export {
  BotMcpRegistry,
  type McpToolRegistrar,
  type McpToolHostContext,
} from "./mcp/bot-mcp-registry.js";
export type { McpToolCallResult } from "./mcp/tool-result.js";
export {
  callToolResultToText,
  mcpToolToOpenAi,
  type McpListedTool,
} from "./mcp/openai-tools.js";
export { InProcessTransport } from "./mcp/in-process-transport.js";
