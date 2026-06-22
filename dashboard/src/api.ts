export interface DerivedHistoryLimits {
  historyMaxTokens: number;
  historyMaxReplyChars: number;
  numPredict: number;
}

export interface Settings {
  llmBaseUrl: string;
  llmApiKeyConfigured: boolean;
  model: string;
  activePersonalityId: number;
  baseSystemPrompt?: string;
  randomReplyEnabled: boolean;
  randomReplyChance: number;
  reactToEveryImage: boolean;
  numPredict: number;
  numCtx: number;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  chatTimeoutSec: number;
  visionMaxDimension: number;
  derivedHistoryLimits?: DerivedHistoryLimits;
  ownerUsername: string;
  ownerUserId: string;
  stickersEnabled: boolean;
  stickerPackName: string;
  stickerReplyChance: number;
  moodCooldownMinutes?: number;
  thinkingEnabled: boolean;
  sendThinkingEnabled: boolean;
  reasoningEffort: "none" | "low" | "medium" | "high";
  maintenanceModeEnabled: boolean;
  workflowSteps: string[];
  workflowNodes: { id: string; x: number; y: number }[];
  workflowEdges: { id: string; source: string; target: string }[];
  contextBudget?: ContextBudget;
  vramAvailableGb: number;
}

export type WorkflowNodeKind =
  | "input"
  | "decision"
  | "optional"
  | "process"
  | "llm"
  | "side"
  | "output";

export type WorkflowStage = "intake" | "queue" | "background";

export type WorkflowEdgeStyle = "primary" | "branch" | "side";

export interface WorkflowNodeSpec {
  stepId: string;
  moduleId?: string;
  label: string;
  sublabel?: string;
  kind: WorkflowNodeKind;
  stage: WorkflowStage;
  alwaysOn: boolean;
  enabled: boolean;
}

export interface WorkflowEdgeSpec {
  id: string;
  source: string;
  target: string;
  style: WorkflowEdgeStyle;
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeSpec[];
  edges: WorkflowEdgeSpec[];
}

export interface ContextBudget {
  effectiveNumCtx: number;
  vramGb: number;
  modelName: string;
  modelWeightGb: number | null;
  modelMaxCtx: number | null;
  vramTierCtx: number;
  limitedBy:
    | "vram_tier"
    | "kv_headroom"
    | "model_max"
    | "generation_floor"
    | "min_floor";
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

export type MemoryScope = "user" | "group" | "general";

export interface DashboardModuleSummary {
  id: string;
  name: string;
  description: string;
  apiBasePath: string | null;
  settingsKeys: string[];
  dataTables: string[];
  dashboard: { label: string; description?: string } | null;
  hasDb: boolean;
  hasUi: boolean;
}

export interface DashboardDebugEvent {
  chatId: string;
  traceId: number;
  listItem: MessageReportListItem | null;
  trace: MessageReportDetail | null;
}

export interface DashboardDataEvent {
  tableIds?: string[];
}

export type PhaseStatus = "skipped" | "ok" | "failed" | "waiting";

export interface ReportDetailFields {
  type: "fields";
  fields: Array<{ label: string; value: string }>;
}

export interface ReportDetailText {
  type: "text";
  title: string;
  body: string;
}

export interface ReportDetailLlm {
  type: "llm";
  model: string;
  sampling?: string;
  requestBody?: unknown;
  responseBody?: unknown;
  sections: Array<{ title: string; body: string }>;
  output: {
    content: string;
    reasoning?: string;
    meta?: string;
  };
}

export interface ReportDetailMood {
  type: "mood";
  traits: Record<string, number>;
}

export type ReportDetail =
  | ReportDetailFields
  | ReportDetailText
  | ReportDetailLlm
  | ReportDetailMood;

export interface ReportPhase {
  id: string;
  title: string;
  status: PhaseStatus;
  durationMs?: number;
  summary: string;
  detail?: ReportDetail;
}

export interface MessageReportRecord {
  status: "ignored" | "processing" | "processed" | "error";
  headline: string;
  durationMs: number;
  intake: {
    messagePreview: string;
    hasMedia: boolean;
    mediaKind?: string;
  };
  routing:
    | {
        decision: "pending";
        pendingLabel: string;
      }
    | {
        decision: "ignored";
        ignoreReason: string;
        ignoreLabel: string;
        addressSource?: string;
      }
    | {
        decision: "accepted";
        trigger: "addressed" | "random" | "image";
        triggerLabel: string;
        addressSource?: string;
      }
    | {
        decision: "queued";
        position: number;
        queueLabel: string;
      };
  phases: ReportPhase[];
  result: {
    replyChars?: number;
    chunks?: number;
    sticker?: string;
    thinkingSent?: boolean;
    error?: string;
  };
}

export interface DebugChatSummary {
  chatId: string;
  chatType: string;
  label: string;
  traceCount: number;
  latestAt: string | null;
}

export interface MessageReportListItem {
  id: number;
  chatId: string;
  userId: string | null;
  userLabel: string | null;
  messagePreview: string;
  status: "ignored" | "processing" | "processed" | "error";
  headline: string;
  badges: string[];
  durationMs: number | null;
  createdAt: string;
}

export interface MessageReportDetail {
  id: number;
  chatId: string;
  convKey: string;
  userId: string | null;
  chatType: string;
  messageId: number | null;
  messagePreview: string;
  status: "ignored" | "processing" | "processed" | "error";
  durationMs: number | null;
  createdAt: string;
  report: MessageReportRecord;
}

export interface BotErrorRecord {
  id: number;
  message: string;
  chatId: string | null;
  userId: string | null;
  createdAt: string;
}

export interface Stats {
  messagesReceived: number;
  messagesReplied: number;
  visionRequests: number;
  errors: number;
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

export type ModuleJobStatus = "idle" | "scheduled" | "running";

export type ModuleJobRunStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModuleJobStep {
  at: string;
  label: string;
  detail?: Record<string, unknown>;
}

export interface ModuleJobRun {
  id: number;
  status: ModuleJobRunStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  steps: ModuleJobStep[];
}

export interface ModuleJobDebugSnapshot {
  moduleId: string;
  status: ModuleJobStatus;
  scheduledRunAt?: string | null;
  currentRun: ModuleJobRun | null;
  recentRuns: ModuleJobRun[];
  lastUpdatedAt: string;
}

export interface MemoryJobRunListItem {
  id: number;
  status: ModuleJobRunStatus;
  headline: string;
  createdAt: string;
  runAt: string | null;
  durationMs: number | null;
  chatsProcessed: number;
  chatsSkipped: number;
}

export interface MemoryJobReportRecord {
  status: ModuleJobRunStatus;
  headline: string;
  durationMs: number;
  chatsScanned: number;
  chatsProcessed: number;
  chatsSkipped: number;
  interrupted: boolean;
  phases: ReportPhase[];
  error?: string;
}

export interface MemoryJobRunDetail {
  id: number;
  status: ModuleJobRunStatus;
  createdAt: string;
  scheduledAt: string | null;
  runAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  report: MemoryJobReportRecord;
}

export interface MemoryJobDebugSnapshot {
  moduleId: string;
  status: ModuleJobStatus;
  scheduledRunAt: string | null;
  currentRun: MemoryJobRunDetail | null;
  recentRuns: MemoryJobRunListItem[];
  lastUpdatedAt: string;
}

export interface VisionJobRunListItem {
  id: number;
  status: ModuleJobRunStatus;
  headline: string;
  createdAt: string;
  runAt: string | null;
  durationMs: number | null;
  mediaBackfilled: number;
  mediaFailed: number;
}

export interface VisionJobReportRecord {
  status: ModuleJobRunStatus;
  headline: string;
  durationMs: number;
  chatsScanned: number;
  mediaBackfilled: number;
  mediaFailed: number;
  interrupted: boolean;
  phases: ReportPhase[];
  error?: string;
}

export interface VisionJobRunDetail {
  id: number;
  status: ModuleJobRunStatus;
  createdAt: string;
  scheduledAt: string | null;
  runAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  report: VisionJobReportRecord;
}

export interface VisionJobDebugSnapshot {
  moduleId: string;
  status: ModuleJobStatus;
  scheduledRunAt: string | null;
  currentRun: VisionJobRunDetail | null;
  recentRuns: VisionJobRunListItem[];
  lastUpdatedAt: string;
  pendingMediaRows: number;
  chatsWithPending: number;
}

export interface UserMemoryFact {
  id: number;
  userId: string;
  fact: string;
  createdAt: string;
}

export interface GroupMemoryFact {
  id: number;
  groupId: string;
  fact: string;
  createdAt: string;
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

export interface GeneralMemoryFact {
  id: number;
  fact: string;
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

export interface HistoryCompressResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  messageCount?: number;
  resultChars?: number;
}

export interface StickerCatalogEntry {
  index: number;
  emoji: string;
}

export interface StickerCatalog {
  enabled: boolean;
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
      return "Check the server terminal and .env — common causes are missing BOT_TOKEN, LLM_BASE_URL, or VRAM_AVAILABLE. In dev: npm run dev -w server (port 3000).";
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
        "The server may not be running, or it exited on startup — check the server terminal for errors (often missing BOT_TOKEN, LLM_BASE_URL, or VRAM_AVAILABLE in .env). In dev: npm run dev or npm run dev -w server (listens on :3000; Vite proxies /api).",
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
  getBudget: (model: string, numPredict: number) =>
    request<{
      contextBudget: ContextBudget;
      derivedHistoryLimits: DerivedHistoryLimits;
    }>(
      `/api/settings/budget?model=${encodeURIComponent(model)}&numPredict=${numPredict}`,
    ),
  getStats: () => request<Stats>("/api/stats"),
  getModules: () =>
    request<{ modules: DashboardModuleSummary[] }>("/api/modules"),
  getWorkflow: () => request<WorkflowDefinition>("/api/workflow"),
  clearErrors: () =>
    request<{ ok: boolean }>("/api/stats/errors/clear", {
      method: "POST",
    }),
  getMemories: () =>
    request<{ facts: UserMemoryFact[]; total: number }>("/api/memories/user"),
  createMemory: (userId: string, fact: string) =>
    request<{ fact: UserMemoryFact }>("/api/memories/user", {
      method: "POST",
      body: JSON.stringify({ userId, fact }),
    }),
  updateMemory: (id: number, fact: string) =>
    request<{ fact: UserMemoryFact }>(`/api/memories/user/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fact }),
    }),
  deleteMemory: (id: number) =>
    request<{ ok: boolean }>(`/api/memories/user/${id}`, { method: "DELETE" }),
  clearUserMemories: (userId: string) =>
    request<{ ok: boolean }>(
      `/api/memories/user/all/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    ),
  getGroupMemories: () =>
    request<{ facts: GroupMemoryFact[]; total: number }>("/api/memories/group"),
  createGroupMemory: (groupId: string, fact: string) =>
    request<{ fact: GroupMemoryFact }>("/api/memories/group", {
      method: "POST",
      body: JSON.stringify({ groupId, fact }),
    }),
  updateGroupMemory: (id: number, fact: string) =>
    request<{ fact: GroupMemoryFact }>(`/api/memories/group/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ fact }),
    }),
  deleteGroupMemory: (id: number) =>
    request<{ ok: boolean }>(`/api/memories/group/${id}`, { method: "DELETE" }),
  clearGroupMemories: (groupId: string) =>
    request<{ ok: boolean }>(
      `/api/memories/group/all/${encodeURIComponent(groupId)}`,
      { method: "DELETE" },
    ),
  getGeneralMemories: () =>
    request<{ facts: GeneralMemoryFact[]; total: number }>(
      "/api/memories/general",
    ),
  createGeneralMemory: (fact: string) =>
    request<{ fact: GeneralMemoryFact }>("/api/memories/general", {
      method: "POST",
      body: JSON.stringify({ text: fact }),
    }),
  updateGeneralMemory: (id: number, fact: string) =>
    request<{ fact: GeneralMemoryFact }>(`/api/memories/general/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ text: fact }),
    }),
  deleteGeneralMemory: (id: number) =>
    request<{ ok: boolean }>(`/api/memories/general/${id}`, {
      method: "DELETE",
    }),
  clearGeneralMemories: () =>
    request<{ ok: boolean }>("/api/memories/general", {
      method: "DELETE",
    }),
  getMemoryModuleConfig: () =>
    request<{ extractionDebounceSec: number }>("/api/memories/config"),
  updateMemoryModuleConfig: (patch: { extractionDebounceSec: number }) =>
    request<{ extractionDebounceSec: number }>("/api/memories/config", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getVisionModuleConfig: () =>
    request<{ backfillDebounceSec: number }>("/api/vision/config"),
  updateVisionModuleConfig: (patch: { backfillDebounceSec: number }) =>
    request<{ backfillDebounceSec: number }>("/api/vision/config", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  getMemoryJobDebug: () =>
    request<MemoryJobDebugSnapshot>("/api/memories/debug"),
  getMemoryJobRun: (id: number) =>
    request<{ run: MemoryJobRunDetail }>(`/api/memories/debug/runs/${id}`),
  getVisionJobDebug: () =>
    request<VisionJobDebugSnapshot>("/api/vision/debug"),
  getVisionJobRun: (id: number) =>
    request<{ run: VisionJobRunDetail }>(`/api/vision/debug/runs/${id}`),
  llmHealth: async () => {
    await request<{ ok: boolean }>("/api/settings/test-llm", {
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
  compressHistory: (chatKey: string, force = true) =>
    request<HistoryCompressResult>("/api/history/compress", {
      method: "POST",
      body: JSON.stringify({ chatKey, force }),
    }),
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
  getDebugChats: () =>
    request<{ chats: DebugChatSummary[] }>("/api/debug/chats"),
  getDebugTraces: (chatId: string) =>
    request<{ traces: MessageReportListItem[] }>(
      `/api/debug/chat/${encodeURIComponent(chatId)}`,
    ),
  getDebugTrace: (id: number) =>
    request<{ trace: MessageReportDetail }>(`/api/debug/trace/${id}`),
};
