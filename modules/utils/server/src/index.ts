export type { ModuleDefinition, ModuleRun } from "./contract.js";
export {
  noopModuleLogging,
  type ModuleEventFields,
  type ModuleLogging,
} from "./logging.js";
export { extractLastClosedBlock } from "./structured-output.js";
export {
  asObject,
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
export {
  escapeHtml,
  hasVisibleTelegramReply,
  prepareTelegramHtml,
  visibleTelegramText,
} from "./telegram-html.js";
export {
  ASSISTANT_MESSAGE_FIELDS,
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
  estimateModelWeightGb,
  extractModelMaxCtx,
  minRequiredCtxForPredict,
  modelContextInputFromTags,
  parseParameterSizeFromName,
  parseParameterSizeGb,
  vramTierContextTokens,
  type ContextBudget,
  type ContextBudgetLimiter,
  type ModelCatalogEntry,
  type ModelContextInput,
} from "./context-budget.js";
