import type { ChatMessage } from "../../shared/index.js";

export const EXPLAIN_EXTENSION_ID = "explain";

export interface ExplainTurnInput {
  convKey: string;
  chatId: number;
  userId: string | null;
  inGroup: boolean;
  /** Telegram id of the bot message being explained (the /explain reply target). */
  repliedMessageId: number;
  /** Formatted debug trace for that message, or null when none was stored. */
  traceText: string | null;
  messageThreadId?: number;
  isForum?: boolean;
}

export interface ExplainPromptInput {
  settings: Record<string, unknown>;
  activePersonalityName: string | null;
  activePersonalityPrompt: string | null;
  /** Formatted debug trace of the message being explained. */
  traceText: string;
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
  getSettings: () => Promise<Record<string, unknown>>;
  resolveActivePersonalityId: (
    activePersonalityId: unknown,
  ) => Promise<number | null>;
  getPersonalityById: (
    id: number,
  ) => Promise<{ name: string; prompt: string } | null>;
  buildExplainSystemPrompt: (input: ExplainPromptInput) => string;
  /** Single plain-text completion — the explain pass uses no tools and no response_format. */
  chatCompleteDetailed: (
    messages: ChatMessage[],
    options: {
      think: boolean;
    },
  ) => Promise<{ raw: string; thinking?: string | null }>;
  extractTelegramReply: (raw: string) => string;
  hasVisibleTelegramReply: (body: string) => boolean;
  prepareTelegramHtml: (body: string) => string;
  /** Start a Telegram "typing" indicator for this chat; returns a stop fn (or null). */
  startTyping: (ctx: unknown) => (() => void) | null;
  recordReply: (hadError: boolean) => void | Promise<void>;
  recordError: (detail: {
    message: string;
    stack?: string;
    chatId?: number;
    userId?: string;
  }) => void | Promise<void>;
  sendChunkedHtmlReply: (
    ctx: unknown,
    options: {
      chatId: number;
      html: string;
      messageThreadId?: number;
      inGroup?: boolean;
      isForum?: boolean;
    },
  ) => Promise<{ chunkCount: number }>;
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
  isOwner: (ctx: unknown) => boolean | Promise<boolean>;
  /**
   * Build the turn from a /explain command. Returns null when the command is not
   * a reply to one of the bot's own messages (the only supported target).
   */
  buildTurnInput: (ctx: unknown) => ExplainTurnInput | null | Promise<ExplainTurnInput | null>;
  deps: ExplainTurnDeps;
}
