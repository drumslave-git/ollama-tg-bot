export type { ModuleDefinition, ModuleRun } from "./contract.js";
export {
  noopModuleLogging,
  type ModuleEventFields,
  type ModuleLogging,
} from "./logging.js";
export { extractLastClosedBlock } from "./structured-output.js";
export {
  asObject,
  mergeAssistantReasoning,
  parseJsonContent,
  readBoolean,
  readInt,
  readNullableString,
  readReasoningFromContent,
  readString,
  readStringArray,
  reasoningJsonUserTail,
  reasoningSchemaSystemSuffix,
  REASONING_JSON_FIELD,
  responseFormatForThinking,
  strictObjectSchema,
  toOpenAiResponseFormat,
  withReasoningInSchema,
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
export {
  createModuleJobDebug,
  type ModuleJobDebugSnapshot,
  type ModuleJobDebugStore,
  type ModuleJobRun,
  type ModuleJobRunStatus,
  type ModuleJobStatus,
  type ModuleJobStep,
} from "./job-debug.js";
