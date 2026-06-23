/**
 * Pipeline contracts for core bot processing stages.
 *
 * The server imports active hosts explicitly and runs them in named intake / queue lists.
 */

export type PipelineStepStatus = "ok" | "skipped" | "failed";

/**
 * Sink for streaming the main reply to the user as tokens arrive. The server
 * binds a concrete implementation to the Telegram context for the turn; the
 * completions host feeds it the partial reply text extracted from the stream.
 */
export interface ReplyStreamSink {
  /** True once a message has been opened for live editing. */
  readonly started: boolean;
  /** Update the live preview with the cumulative reply text so far. */
  push(replyText: string): void;
}

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

  /**
   * Base64 image payloads for the current turn, attached directly to the main
   * reply so a vision-capable model reads text and images in one pass (no
   * separate describe request).
   */
  images?: string[];

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
  personalityPrompt?: string;

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

  /** Live-reply sink for streaming the main completion to Telegram (transient). */
  replyStream?: ReplyStreamSink;

  /**
   * Show a Telegram chat action (e.g. "choose_sticker") for the turn's chat
   * during slow visible work; returns a stop fn. Server-bound, transient.
   */
  startChatAction?: (action: PipelineChatAction) => (() => void) | null;

  delivery?: PipelineDeliveryResult;
}

/** Telegram chat actions a pipeline host may request while it works. */
export type PipelineChatAction = "typing" | "choose_sticker";

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
      latest: string;
    };
    /**
     * When set (and no MCP tools are active), stream the completion and report
     * the cumulative raw model content as it arrives.
     */
    onContentDelta?: (accumulated: string) => void;
  }): (messages: unknown[]) => Promise<{
    raw: string;
    thinking?: string;
    webSearchSources?: unknown[];
  }>;
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
