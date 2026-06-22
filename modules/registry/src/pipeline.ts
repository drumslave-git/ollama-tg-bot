/**
 * Pipeline contracts for core bot processing stages.
 *
 * The server imports active hosts explicitly and runs them in named intake / queue lists.
 */

export type PipelineStepStatus = "ok" | "skipped" | "failed";

export type ReplyTrigger = "addressed" | "random" | "image" | null;

export interface PipelineStepResult {
  status: PipelineStepStatus;
  /** Report phase id (e.g. "mood", "search"). */
  phaseId: string;
  phaseTitle: string;
  summary: string;
  durationMs?: number;
  detail?: unknown;
  /** Replace an existing phase with the same id instead of appending. */
  replace?: boolean;
}

/** Result of {@link PipelineModuleHost.shouldRun}. */
export type PipelineShouldRunResult =
  | boolean
  | {
      run: false;
      summary?: string;
      /** Omit this step from the debug trace (expected no-op). */
      omitFromReport?: boolean;
    };

/** Minimal Telegram context passed into the pipeline by the server. */
export interface PipelineTelegramContext {
  message: unknown;
  chat?: { id: number; type: string; is_forum?: boolean };
  from?: unknown;
  me?: { id: number; username?: string };
  botToken: string;
}

/** Reply payload produced by the pipeline for the server to deliver. */
export interface PipelineDeliveryResult {
  replyHtml?: string;
  thinking?: string;
  stickerFileId?: string | null;
  stickerEmoji?: string | null;
  webSearchSources?: unknown[];
  error?: string;
}

/** Mutable per-turn state passed through the pipeline. */
export interface PipelineTurnState {
  turnId: number;
  telegram: PipelineTelegramContext;

  /** Raw message text/caption before bot-address stripping. */
  rawText?: string;
  latestBody: string;
  replyContext?: string | null;
  mentionedUsersContext?: string | null;

  convKey?: string | null;
  chatId?: number;
  userId?: string | null;
  groupChatId?: string | null;
  inGroup?: boolean;
  userRole?: string | null;
  currentSpeaker?: unknown;
  currentSpeakerIsOwner?: boolean;
  messageThreadId?: number;
  isForum?: boolean;

  /** When true, gate modules such as address check are skipped. */
  skipAddressCheck?: boolean;

  /** Whether the bot should produce a reply for this message. */
  shouldReply?: boolean;
  replyTrigger?: ReplyTrigger;

  /** Populated by the address gate module. */
  addressed?: boolean;
  addressSource?: string;

  /**
   * Queue anchor `{convKey}:{telegramMessageId}` for addressed turns.
   */
  historyPointer?: string;
  /** Telegram message_id for the current turn. */
  telegramMessageId?: number;

  userHistoryContent?: string | null;
  skipUserHistory?: boolean;

  /** Accumulated prompt context for the completion step. */
  systemPromptContent?: string;
  personalityPrompt?: string;
  chatMessages?: unknown[];
  systemContent?: string;
  historyMessages?: unknown[];
  latestContent?: string;
  storedHistoryCount?: number;

  /** Mood evaluation output. */
  mood?: unknown;

  /** Web search outputs collected from main-reply MCP tool calls. */
  webSearchSources?: unknown[];

  /** Main reply body before sticker/post-processing. */
  replyBody?: string;
  thinking?: string;

  /** Sticker selection outputs. */
  stickerEmoji?: string | null;
  stickerFileId?: string | null;

  assistantReply?: string;

  /** Pipeline control — early exit without delivery. */
  haltReason?: string;
  earlyReply?: string;

  delivery?: PipelineDeliveryResult;
}

export interface PipelinePhaseWriteOptions {
  /** Replace an existing phase with the same id instead of appending. */
  replace?: boolean;
}

export interface PipelineReportWriter {
  okPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
    detail?: unknown,
    options?: PipelinePhaseWriteOptions,
  ): void;
  skipPhase(
    id: string,
    title: string,
    summary: string,
    options?: PipelinePhaseWriteOptions,
  ): void;
  failPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
    options?: PipelinePhaseWriteOptions,
  ): void;
  completeMemory?(input: {
    updated: boolean;
    scopes: string[];
    error?: string;
  }): void;
}

export interface PipelineLlmServices {
  baseUrl: string;
  model: string;
  apiKey?: string;
  createAuxiliaryChatComplete(options: {
    numPredict: number;
    responseFormat: unknown;
    traceTurnId?: number;
    traceLabel: string;
    think?: boolean;
  }): (messages: unknown[]) => Promise<string>;
  createMainChatComplete?(options: {
    think?: boolean;
    responseFormat: unknown;
    traceTurnId?: number;
    traceLabel: string;
    traceLayout?: {
      system: string;
      history: unknown[];
      latest: string;
    };
  }): (messages: unknown[]) => Promise<{
    raw: string;
    thinking?: string;
    webSearchSources?: unknown[];
  }>;
}

export interface PipelineHostCallbacks {
  resolveConversationKey?: (telegram: PipelineTelegramContext) => string | null;
  resolveUserId?: (telegram: PipelineTelegramContext) => string | null;
  resolveGroupChatId?: (telegram: PipelineTelegramContext) => string | null;
  isGroupChat?: (telegram: PipelineTelegramContext) => boolean;
  isOwner?: (telegram: PipelineTelegramContext) => boolean;
  getEffectiveMood?: () => unknown;
  saveMoodState?: (mood: unknown) => void;
  getStickerCatalog?: () => unknown;
  getSettings?: () => Record<string, unknown>;
  getActivePersonalityPrompt?: () => string;
  buildSystemPromptForTurn?: (state: PipelineTurnState) => string;
  buildChatContextForTurn?: (state: PipelineTurnState) => {
    messages: unknown[];
    systemContent: string;
    historyMessages: unknown[];
    latestContent: string;
    storedHistoryCount: number;
  };
  prepareDelivery?: (state: PipelineTurnState) => PipelineDeliveryResult;
  ensureHistoryFits?: (convKey: string) => Promise<void>;
  recordExchange?: (
    convKey: string,
    userRole: string | null,
    userContent: string | null,
    assistantText: string,
    options?: { skipUser?: boolean; anchorMessageId?: number },
  ) => void;
  appendMessage?: (
    convKey: string,
    role: string,
    content: string,
    options?: { messageId?: number },
  ) => void;
  mapHistoryBase64Media?: (
    convKey: string,
    isBase64Media: (content: string) => boolean,
    replace: (content: string) => string | null,
  ) => number;
  enrichTextWithUserMentions?: (
    text: string,
    message: unknown,
    options: {
      botId?: number;
      botUsername?: string;
      senderId?: number;
      senderUsername?: string;
    },
  ) => string;
  formatReplyContext?: (
    telegram: PipelineTelegramContext,
    currentSpeaker?: unknown,
  ) => string | null;
  resolveMentionedUsersContext?: (
    text: string,
    telegram: PipelineTelegramContext,
  ) => string | null;
  currentSpeakerFromUser?: (from: unknown) => unknown;
  userRoleTag?: (from: unknown) => string | null;
  loadVisionFromMessage?: (
    botToken: string,
    message: unknown,
  ) => Promise<{
    images: unknown[];
    unavailableText?: string;
    visionHint?: string;
    sourceSticker?: unknown;
  }>;
  findReplyMediaMessage?: (message: unknown) => unknown;
  messageHasVisionMedia?: (message: unknown) => boolean;
  messageHasUserImage?: (message: unknown) => boolean;
  describeVisionImages?: (
    images: unknown[],
    logContext: Record<string, unknown>,
    visionHint?: string,
    traceTurnId?: number,
  ) => Promise<string>;
  stickerPackEmoji?: (sticker: unknown) => string | null;
  getUserFacts?: (userId: string) => string[];
  getGroupFacts?: (groupId: string) => string[];
  getGeneralFacts?: () => string[];
  memoryCallbacks?: {
    replaceUserFacts: (userId: string, facts: string[]) => void;
    replaceGroupFacts: (groupId: string, facts: string[]) => void;
    replaceGeneralFacts: (facts: string[]) => void;
    getUserFacts?: (userId: string) => string[];
  };
  getChatParticipants?: (
    convKey: string,
    currentUserId: string | null,
  ) => { userId: string; label: string }[];
}

export interface PipelineHostServices {
  logging: {
    logEvent: (event: string, fields?: Record<string, unknown>) => void;
    logEventError: (
      event: string,
      err: unknown,
      fields?: Record<string, unknown>,
    ) => void;
  };
  llm: PipelineLlmServices;
  getWorkflowSteps: () => string[];
  getReport: (turnId: number) => PipelineReportWriter | null;
  callbacks: PipelineHostCallbacks;
}

export interface PipelineModuleHost {
  readonly id: string;
  readonly stepId: string;
  readonly alwaysOn?: boolean;
  /** Human-readable title in debug traces. Defaults to stepId. */
  debugTitle?: string;
  shouldRun?(
    state: PipelineTurnState,
    services: PipelineHostServices,
  ): PipelineShouldRunResult;
  run(
    state: PipelineTurnState,
    services: PipelineHostServices,
  ): Promise<PipelineStepResult>;
}
