export interface DerivedHistoryLimits {
  historyMaxReplyChars: number;
  numPredict: number;
}

export interface Settings {
  llmBaseUrl: string;
  llmApiKeyConfigured: boolean;
  embeddingBaseUrl: string;
  embeddingApiKeyConfigured: boolean;
  embeddingHostDistinct: boolean;
  imageBaseUrl: string;
  imageApiKeyConfigured: boolean;
  imageHostDistinct: boolean;
  model: string;
  embeddingModel: string;
  imageModel: string;
  activePersonalityId: number;
  baseSystemPrompt?: string;
  numPredict: number;
  numCtx: number;
  temperature: number;
  topP: number;
  chatTimeoutSec: number;
  visionMaxDimension: number;
  derivedHistoryLimits?: DerivedHistoryLimits;
  ownerUsername: string;
  ownerUserId: string;
  stickerPackName: string;
  stickerReplyChance: number;
  moodCooldownMinutes?: number;
  thinkingEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
  maintenanceModeEnabled: boolean;
  workflowSteps: string[];
  contextBudget?: ContextBudget;
}

export interface ContextBudget {
  effectiveNumCtx: number;
  requestedNumCtx: number;
  modelName: string;
  modelMaxCtx: number | null;
  limitedBy: "manual" | "model_max" | "generation_floor" | "min_floor";
  notes: string[];
}

export const MOOD_KEYS = [
  "irritated",
  "exhausted",
  "amused",
  "curious",
  "contemptuous",
  "gloomy",
  "impatient",
  "pleased",
  "suspicious",
] as const;

export type MoodKey = (typeof MOOD_KEYS)[number];
export type MoodValues = Record<MoodKey, number>;

export const DEFAULT_MOOD_VALUES: MoodValues = {
  irritated: 1,
  exhausted: 0,
  amused: 1,
  curious: 2,
  contemptuous: 1,
  gloomy: 0,
  impatient: 1,
  pleased: 0,
  suspicious: 1,
};

export interface MoodState {
  values: MoodValues;
  updatedAt: string;
  effectiveValues: MoodValues;
}

export interface MoodPayload {
  defaults: MoodValues;
  activePersonalityId: number;
  activePersonalityName: string | null;
  cooldownMinutes: number;
  traitHints: Record<MoodKey, string>;
  current: MoodState | null;
}

export type MemoryScope = "user" | "general";

export interface DashboardDebugEvent {
  entityId: string;
  processingId: number;
}

export interface DashboardDataEvent {
  tableIds?: string[];
}

export type ProcessingStatus =
  | "processing"
  | "processed"
  | "ignored"
  | "error";

export type ProcessingEntryType = "text" | "json";

export interface ProcessingEntry {
  id: number;
  title: string;
  type: ProcessingEntryType;
  content: string;
  createdAt: string;
}

/** Token totals summed across a processing's LLM calls. */
export interface TokenCounts {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface DebugChatSummary {
  entityId: string;
  label: string;
  processingCount: number;
  latestAt: string | null;
}

export interface MessageProcessingListItem {
  id: number;
  chatMessageId: number;
  messageId: number | null;
  messagePreview: string;
  userLabel: string | null;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  entryCount: number;
  createdAt: string;
}

export interface MessageProcessingDetail {
  id: number;
  entityId: string;
  chatMessageId: number;
  messageId: number | null;
  messagePreview: string;
  userLabel: string | null;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  createdAt: string;
  entries: ProcessingEntry[];
}

export interface TaskDebugGroup {
  taskId: number;
  label: string;
  fireCount: number;
  latestAt: string | null;
}

export interface TaskFireListItem {
  id: number;
  taskId: number | null;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  entryCount: number;
  createdAt: string;
}

export interface TaskFireDetail {
  id: number;
  taskId: number | null;
  taskInstruction: string | null;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  createdAt: string;
  entries: ProcessingEntry[];
}

export interface JobRunListItem {
  id: number;
  featureId: string;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  entryCount: number;
  createdAt: string;
}

export interface JobRunDetail {
  id: number;
  featureId: string;
  summary: string;
  status: ProcessingStatus;
  totalTimeSpent: number | null;
  tokens: TokenCounts;
  createdAt: string;
  entries: ProcessingEntry[];
}

export interface BotErrorRecord {
  id: number;
  message: string;
  chatId: string | null;
  userId: string | null;
  createdAt: string;
}

export interface PhaseTimingStat {
  phaseId: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  maxMs: number;
}

export interface LlmUsageBreakdownRow {
  label: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmUsageWindow {
  days: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byLabel: LlmUsageBreakdownRow[];
}

export interface Stats {
  messagesReceived: number;
  messagesReplied: number;
  visionRequests: number;
  errors: number;
  llmCalls: number;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  llmTotalTokens: number;
  lastActivityAt: string | null;
  queueSize: number;
  historyPointer: string | null;
  memoryJobStatus: "idle" | "scheduled" | "running";
  memoryJobRunAt: string | null;
  visionJobStatus: "idle" | "scheduled" | "running";
  visionJobRunAt: string | null;
  botUsername: string | null;
  botRunning: boolean;
  uptimeSeconds: number;
  startedAt: string;
  recentErrors: BotErrorRecord[];
}

export interface MemoryRecord {
  id: number;
  type: MemoryScope;
  entityId: string | null;
  content: string;
  updatedAt: number;
}

export interface MemoryEntry {
  id: number;
  type: MemoryScope;
  entityId: string | null;
  content: string;
  createdAt: number;
}

export interface MemoryConfig {
  enabled: boolean;
  runHour: number;
}

export interface Personality {
  id: number;
  name: string;
  prompt: string;
  moodDefaults: MoodValues;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalitiesPayload {
  personalities: Personality[];
  activePersonalityId: number;
}

export type TaskScheduleKind = "once" | "daily" | "weekly";

export interface Task {
  id: number;
  chatId: number;
  messageThreadId: number | null;
  entityId: string;
  createdByUserId: string;
  instruction: string;
  scheduleKind: TaskScheduleKind;
  timeOfDay: string;
  weekdays: number[] | null;
  runDate: string | null;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInputPayload {
  chatId: number;
  instruction: string;
  scheduleKind: TaskScheduleKind;
  timeOfDay: string;
  weekdays?: number[];
  runDate?: string | null;
  enabled?: boolean;
  messageThreadId?: number | null;
  entityId?: string;
  createdByUserId?: string;
}

export interface TaskUpdatePayload {
  instruction?: string;
  scheduleKind?: TaskScheduleKind;
  timeOfDay?: string;
  weekdays?: number[] | null;
  runDate?: string | null;
  enabled?: boolean;
}

export type TaskEventKind =
  | "created"
  | "updated"
  | "deleted"
  | "fired"
  | "fire_failed";

export interface TaskEvent {
  id: number;
  taskId: number | null;
  kind: TaskEventKind;
  chatId: number | null;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface SummaryRunResult {
  chatId: string;
  topicCount: number;
  messageCount: number;
  error?: string;
}

export interface SummaryChatStat {
  chatId: string;
  messageCount: number;
  lastMessageAt: string;
  topicCount: number;
  summaryDays: number;
  lastSummaryDate: string | null;
}

export interface SummaryTopicRecord {
  id: number;
  content: string;
  messageIds: number[];
}

export interface SummaryDayGroup {
  summaryDate: string;
  topics: SummaryTopicRecord[];
}

export interface SummaryTopicDetail extends SummaryTopicRecord {
  chatId: string;
  summaryDate: string;
}

export interface SummarySourceMessage {
  messageId: number | null;
  role: string;
  content: string;
  createdAt: string;
}

export interface DataTableSummary {
  id: string;
  label: string;
  count: number;
}

export interface DataTablePayload {
  id: string;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
}

export interface StickerCatalogEntry {
  index: number;
  emoji: string;
}

export interface StickerCatalog {
  packName: string;
  stickers: StickerCatalogEntry[];
  loaded: boolean;
  error: string | null;
}

export interface LlmModel {
  name: string;
  size?: number;
  modelMaxCtx?: number;
  details?: {
    parameter_size?: string;
    family?: string;
    quantization_level?: string;
  };
}

export type ApiErrorKind = "network" | "server" | "client" | "parse";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly path: string;
  readonly status?: number;
  readonly hint?: string;

  constructor(opts: {
    kind: ApiErrorKind;
    path: string;
    message: string;
    status?: number;
    hint?: string;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.kind = opts.kind;
    this.path = opts.path;
    this.status = opts.status;
    this.hint = opts.hint;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (err != null &&
      typeof err === "object" &&
      (err as any).name === "ApiError" &&
      typeof (err as any).kind === "string" &&
      typeof (err as any).path === "string")
  );
}

export function describeApiError(err: unknown): {
  title: string;
  message: string;
  hint?: string;
} {
  if (!isApiError(err)) {
    return {
      title: "Unexpected error",
      message: err instanceof Error ? err.message : "Something went wrong",
    };
  }

  const titles: Record<ApiErrorKind, string> = {
    network: "Cannot reach the API",
    server: "Server error",
    client: "Request rejected",
    parse: "Invalid server response",
  };

  return {
    title: titles[err.kind],
    message: err.message,
    hint: err.hint,
  };
}

function hintForPath(path: string, status: number): string | undefined {
  if (path === "/api/health" || path.startsWith("/api/settings") || path === "/api/stats") {
    if (status >= 500) {
      return "Check the server terminal and .env — common causes are missing BOT_TOKEN, LLM_BASE_URL, or DATABASE_URL. In dev: npm run dev -w server (port 3000).";
    }
    if (status === 404) {
      return "API route not found — is the server running on :3000? Vite proxies /api in dev.";
    }
  }
  if (path === "/api/tavily/status") {
    return undefined;
  }
  if (path === "/api/models" || path === "/api/llm/health") {
    if (status === 502) {
      return "Could not reach the LLM. Check LLM_BASE_URL in .env and restart the server.";
    }
  }
  return undefined;
}

async function parseErrorBody(
  res: Response,
): Promise<{ error?: string; message?: string }> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { error?: string; message?: string };
  } catch {
    return { message: text.slice(0, 200) };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError({
      kind: "network",
      path,
      message: "Could not connect to the API",
      hint:
        "The server may not be running, or it exited on startup — check the server terminal for errors (often missing BOT_TOKEN, LLM_BASE_URL, or DATABASE_URL in .env). In dev: npm run dev or npm run dev -w server (listens on :3000; Vite proxies /api).",
    });
  }

  if (!res.ok) {
    const body = await parseErrorBody(res);
    const serverMessage = body.error ?? body.message;
    const kind: ApiErrorKind =
      res.status >= 500 ? "server" : res.status >= 400 ? "client" : "server";

    throw new ApiError({
      kind,
      path,
      status: res.status,
      message:
        serverMessage ??
        (res.status === 500
          ? "Internal server error — see the server terminal for details"
          : `Request failed (${res.status} ${res.statusText})`),
      hint: hintForPath(path, res.status),
    });
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError({
      kind: "parse",
      path,
      status: res.status,
      message: "The API returned a response that is not valid JSON",
      hint: "The server may be misconfigured or returning an HTML error page.",
    });
  }
}

export const api = {
  stickerPreviewUrl: (index: number) => `/api/settings/stickers/${index}/preview`,
  checkHealth: () => request<{ ok: boolean }>("/api/health"),
  getSettings: () => request<Settings>("/api/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getModels: () =>
    request<{ models: LlmModel[] }>("/api/settings/models").then(
      (r) => r.models,
    ),
  getEmbeddingModels: () =>
    request<{ models: LlmModel[] }>("/api/settings/embedding-models").then(
      (r) => r.models,
    ),
  getImageModels: () =>
    request<{ models: LlmModel[] }>("/api/settings/image-models").then(
      (r) => r.models,
    ),
  getBudget: (model: string, numPredict: number, numCtx: number) =>
    request<{
      contextBudget: ContextBudget;
      derivedHistoryLimits: DerivedHistoryLimits;
    }>(
      `/api/settings/budget?model=${encodeURIComponent(model)}&numPredict=${numPredict}&numCtx=${numCtx}`,
    ),
  getStats: () => request<Stats>("/api/stats"),
  clearErrors: () =>
    request<{ ok: boolean }>("/api/stats/errors/clear", {
      method: "POST",
    }),
  getMemoryRecords: () =>
    request<{ records: MemoryRecord[] }>("/api/memories/memory"),
  updateMemoryRecord: (id: number, content: string) =>
    request<{ record: MemoryRecord }>(`/api/memories/memory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  deleteMemoryRecord: (id: number) =>
    request<{ ok: boolean }>(`/api/memories/memory/${id}`, { method: "DELETE" }),
  getMemoryEntries: () =>
    request<{ entries: MemoryEntry[] }>("/api/memories/entries"),
  createMemoryEntry: (
    type: MemoryScope,
    entityId: string | null,
    content: string,
  ) =>
    request<{ entry: MemoryEntry }>("/api/memories/entries", {
      method: "POST",
      body: JSON.stringify({ type, entityId, content }),
    }),
  updateMemoryEntry: (id: number, content: string) =>
    request<{ entry: MemoryEntry }>(`/api/memories/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  deleteMemoryEntry: (id: number) =>
    request<{ ok: boolean }>(`/api/memories/entries/${id}`, { method: "DELETE" }),
  getMemoryConfig: () => request<MemoryConfig>("/api/memories/config"),
  updateMemoryConfig: (patch: Partial<MemoryConfig>) =>
    request<MemoryConfig>("/api/memories/config", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getVisionConfig: () =>
    request<{ backfillDebounceSec: number }>("/api/vision/config"),
  updateVisionConfig: (patch: { backfillDebounceSec: number }) =>
    request<{ backfillDebounceSec: number }>("/api/vision/config", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  llmHealth: async () => {
    await request<{ ok: boolean }>("/api/settings/test-llm", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  embeddingHealth: async () => {
    await request<{ ok: boolean }>("/api/settings/test-embedding", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  imageHealth: async () => {
    await request<{ ok: boolean }>("/api/settings/test-image", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  tavilyStatus: () =>
    request<{ configured: boolean; ok: boolean }>("/api/settings/tavily-status"),
  getPersonalities: () => request<PersonalitiesPayload>("/api/mood/personalities"),
  createPersonality: (
    name: string,
    prompt: string,
    moodDefaults?: MoodValues,
  ) =>
    request<{ personality: Personality }>("/api/mood/personality", {
      method: "POST",
      body: JSON.stringify({ name, prompt, moodDefaults }),
    }),
  updatePersonality: (
    id: number,
    patch: { name?: string; prompt?: string; moodDefaults?: MoodValues },
  ) =>
    request<{ personality: Personality }>(`/api/mood/personality/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deletePersonality: (id: number) =>
    request<{ ok: boolean; activePersonalityId: number }>(
      `/api/mood/personality/${id}`,
      { method: "DELETE" },
    ),
  getStickers: () => request<StickerCatalog>("/api/settings/stickers"),
  refreshStickers: () =>
    request<StickerCatalog>("/api/settings/stickers/refresh", { method: "POST" }),
  getDataTables: () => request<{ tables: DataTableSummary[] }>("/api/data/tables"),
  getDataTable: (tableId: string) =>
    request<DataTablePayload>(`/api/data/table/${tableId}`),
  getMood: () => request<MoodPayload>("/api/mood"),
  updateMood: (patch: {
    cooldownMinutes?: number;
    current?: Partial<MoodValues>;
  }) =>
    request<MoodPayload>("/api/mood/state", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  refreshMood: () => request<MoodPayload>("/api/mood/state/tick", { method: "POST" }),
  resetMood: () =>
    request<MoodPayload>("/api/mood/state/reset", {
      method: "POST",
    }),
  getPhaseTimings: (days = 7) =>
    request<{ days: number; phases: PhaseTimingStat[] }>(
      `/api/debug/phase-timings?days=${days}`,
    ),
  getLlmUsage: (days = 7) =>
    request<LlmUsageWindow>(`/api/debug/llm-usage?days=${days}`),
  getDebugChats: () =>
    request<{ chats: DebugChatSummary[] }>("/api/debug/chats"),
  getDebugProcessings: (entityId: string) =>
    request<{ processings: MessageProcessingListItem[] }>(
      `/api/debug/chat/${encodeURIComponent(entityId)}`,
    ),
  getDebugProcessing: (id: number) =>
    request<{ processing: MessageProcessingDetail }>(
      `/api/debug/processing/${id}`,
    ),
  getDebugTaskGroups: () =>
    request<{ tasks: TaskDebugGroup[] }>("/api/debug/tasks"),
  getDebugTaskFires: (taskId: number) =>
    request<{ fires: TaskFireListItem[] }>(`/api/debug/task/${taskId}`),
  getDebugTaskFire: (id: number) =>
    request<{ fire: TaskFireDetail }>(`/api/debug/task-processing/${id}`),
  getDebugJobRuns: (featureId: string) =>
    request<{ runs: JobRunListItem[] }>(
      `/api/debug/job/${encodeURIComponent(featureId)}`,
    ),
  getDebugJobRun: (id: number) =>
    request<{ run: JobRunDetail }>(`/api/debug/job-processing/${id}`),
  getTasks: () => request<{ tasks: Task[] }>("/api/tasks"),
  createTask: (payload: TaskInputPayload) =>
    request<{ task: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTask: (id: number, patch: TaskUpdatePayload) =>
    request<{ task: Task }>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteTask: (id: number) =>
    request<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  getTaskEvents: () => request<{ events: TaskEvent[] }>("/api/tasks/debug"),
  clearTaskEvents: () =>
    request<{ ok: boolean }>("/api/tasks/debug", { method: "DELETE" }),
  runSummary: (opts: { date?: string; chatId?: string } = {}) =>
    request<{ date: string; results: SummaryRunResult[] }>(
      "/api/summaries/run",
      {
        method: "POST",
        body: JSON.stringify(opts),
      },
    ),
  getSummaryChats: () =>
    request<{ chats: SummaryChatStat[] }>("/api/summaries/chats"),
  getChatSummaries: (chatId: string) =>
    request<{ chatId: string; days: SummaryDayGroup[] }>(
      `/api/summaries/chat/${encodeURIComponent(chatId)}`,
    ),
  getSummaryTopicMessages: (topicId: number) =>
    request<{ topic: SummaryTopicDetail; messages: SummarySourceMessage[] }>(
      `/api/summaries/topic/${topicId}/messages`,
    ),
};
