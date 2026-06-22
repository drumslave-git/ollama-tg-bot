export { systemPromptHost } from "./system-prompt.js";
export { completionsHost } from "./completions.js";
export { botHost } from "./bot-host.js";
export {
  EXPLAIN_EXTENSION_ID,
  type ExplainExtension,
  type ExplainPromptInput,
  type ExplainTurnDeps,
  type ExplainTurnInput,
} from "./explain-types.js";
export { runExplainTurn } from "./explain-turn.js";
export { handleExplainCommand } from "./explain-command.js";
export {
  MAIN_REPLY_RESPONSE_FORMAT,
  buildExplainFormatSpec,
  buildReplyFormatSpec,
  extractTelegramReply,
  extractThinkingFromContent,
  getMainReplyResponseFormat,
  stripStructuredMarkup,
} from "./response-format.js";
