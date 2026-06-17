import type {
  ChatMessage,
  JsonSchemaResponseFormat,
} from "@llm-tg-bot/modules-utils";

export const EXPLAIN_EXTENSION_ID = "explain";

export interface ExplainTurnInput {
  convKey: string;
  chatId: number;
  userId: string | null;
  groupChatId: string | null;
  inGroup: boolean;
  question: string;
  userRole: string | null;
  userMemoryFacts: string[];
  groupMemoryFacts: string[];
  generalMemoryFacts: string[];
  messageThreadId?: number;
  isForum?: boolean;
}

export interface ExplainPromptInput {
  settings: Record<string, unknown>;
  activePersonalityName: string | null;
  activePersonalityPrompt: string | null;
  generalMemoryFacts: string[];
  groupMemoryFacts: string[];
  userMemoryFacts: string[];
  isGroupChat: boolean;
}

export interface ExplainTurnDeps {
  logging: {
    logEvent: (event: string, fields?: Record<string, unknown>) => void;
    logEventError: (
      event: string,
      err: unknown,
      fields?: Record<string, unknown>,
    ) => void;
  };
  getSettings: () => Record<string, unknown>;
  resolveActivePersonalityId: (activePersonalityId: unknown) => number | null;
  getPersonalityById: (
    id: number,
  ) => { name: string; prompt: string } | null;
  buildExplainSystemPrompt: (input: ExplainPromptInput) => string;
  ensureHistoryFits: (convKey: string) => Promise<void>;
  loadHistoryMessages: (convKey: string) => ChatMessage[];
  getMainReplyResponseFormat: (
    thinkingEnabled: boolean,
  ) => JsonSchemaResponseFormat;
  chatCompleteDetailed: (
    messages: ChatMessage[],
    options: {
      think: boolean;
      responseFormat: JsonSchemaResponseFormat;
    },
  ) => Promise<{ raw: string; thinking?: string | null }>;
  extractTelegramReply: (raw: string) => string;
  hasVisibleTelegramReply: (body: string) => boolean;
  prepareTelegramHtml: (body: string) => string;
  recordExchange: (
    convKey: string,
    userRole: string | null,
    userContent: string,
    assistantContent: string,
  ) => void;
  recordReply: (hadError: boolean) => void;
  recordError: (detail: {
    message: string;
    stack?: string;
    chatId?: number;
    userId?: string;
  }) => void;
  sendChunkedHtmlReply: (
    ctx: unknown,
    options: {
      chatId: number;
      html: string;
      thinking?: string | null;
      sendThinking?: boolean;
      messageThreadId?: number;
      inGroup?: boolean;
      isForum?: boolean;
    },
  ) => Promise<{ chunkCount: number; thinkingSent: boolean }>;
  deliverHtmlErrorReply: (
    ctx: unknown,
    options: {
      messageThreadId?: number;
      prefix: string;
      detail: string;
      plainFallback?: string;
    },
  ) => Promise<void>;
}

export interface ExplainExtension {
  isOwner: (ctx: unknown) => boolean;
  resolveCommandText: (ctx: unknown, inline: string) => string | null;
  buildTurnInput: (
    ctx: unknown,
    question: string,
  ) => ExplainTurnInput | null;
  deps: ExplainTurnDeps;
}
