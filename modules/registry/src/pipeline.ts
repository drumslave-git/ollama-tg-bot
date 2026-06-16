/**
 * Generic pipeline contract for dynamically loaded bot feature modules.
 *
 * Each module package may export `pipelineHost` implementing this interface.
 * The server discovers modules via manifest.json and runs them by phase.
 */

export type PipelinePhase = "gate" | "pre-reply" | "post-reply" | "background";

export type PipelineStepStatus = "ok" | "skipped" | "failed" | "halt";

export interface ModulePipelineMeta {
  /** ID referenced in dashboard workflowSteps (e.g. "mood", "links"). */
  stepId: string;
  phase: PipelinePhase;
  /** Lower order runs first within the same phase. */
  order: number;
  /** When true, the step runs even when absent from workflowSteps. */
  alwaysOn?: boolean;
}

export interface PipelineStepResult {
  status: PipelineStepStatus;
  /** Report phase id (e.g. "mood", "search"). */
  phaseId: string;
  phaseTitle: string;
  summary: string;
  durationMs?: number;
  detail?: unknown;
}

/** Mutable per-turn state passed through the pipeline. */
export interface PipelineTurnState {
  turnId: number;
  latestBody: string;
  replyContext?: string | null;

  /** When true, gate modules such as address check are skipped. */
  skipAddressCheck?: boolean;

  /** Populated by the address gate module. */
  addressed?: boolean;
  addressSource?: string;

  /** When true, remaining pipeline steps should not run. */
  halt?: boolean;
  haltReason?: string;

  /** Mood evaluation inputs/outputs. */
  moodContextText?: string;
  moodLatestTurnPreview?: string;
  mood?: unknown;

  /** Link fetch outputs. */
  linkFetchContext?: string | null;
  linkFetchResolved?: boolean;
  linkFetchUrlCount?: number;

  /** Web search outputs. */
  webSearchContext?: string | null;
  webSearchSources?: unknown[];

  /** Main reply body before sticker/post-processing. */
  replyBody?: string;

  /** Sticker selection outputs. */
  stickerEmoji?: string | null;
  stickerFileId?: string | null;

  /** Memory persistence context. */
  memoryInput?: unknown;
  userId?: string | null;
  groupChatId?: string | null;
  assistantReply?: string;

  /** Module-specific inputs set by the host before a phase runs. */
  moduleInput?: Record<string, unknown>;
}

export interface PipelineReportWriter {
  okPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
    detail?: unknown,
  ): void;
  skipPhase(id: string, title: string, summary: string): void;
  failPhase(
    id: string,
    title: string,
    summary: string,
    durationMs?: number,
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
}

export interface PipelineHostCallbacks {
  getBotIdentity?: () => unknown;
  getEffectiveMood?: () => unknown;
  saveMoodState?: (mood: unknown) => void;
  getStickerCatalog?: () => unknown;
  getSettings?: () => Record<string, unknown>;
  memoryCallbacks?: {
    replaceUserFacts: (userId: string, facts: string[]) => void;
    replaceGroupFacts: (groupId: string, facts: string[]) => void;
    replaceGeneralFacts: (facts: string[]) => void;
  };
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
  getSecret: (name: "tavily" | "openai") => string;
  callbacks: PipelineHostCallbacks;
}

export interface PipelineModuleHost {
  readonly id: string;
  readonly stepId: string;
  readonly phase: PipelinePhase;
  readonly order: number;
  readonly alwaysOn?: boolean;
  shouldRun?(
    state: PipelineTurnState,
    services: PipelineHostServices,
  ): boolean;
  run(
    state: PipelineTurnState,
    services: PipelineHostServices,
  ): Promise<PipelineStepResult>;
}
