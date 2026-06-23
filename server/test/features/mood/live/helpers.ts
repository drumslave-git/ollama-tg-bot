import {
  evaluateMood,
  DEFAULT_MOOD_VALUES,
  type MoodValues,
} from "../../../../src/features/mood/index.js";

export interface LiveConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function liveConfig(): LiveConfig | null {
  const rawBase = process.env.LLM_BASE_URL?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!rawBase || !model) return null;
  return {
    baseUrl: rawBase.replace(/\/v1\/?$/, ""),
    model,
    apiKey: (process.env.LLM_API_KEY ?? "").trim() || "not-needed",
  };
}

/** True when the live reasoning suite (`test:llm:reasoning`) is active. */
export function liveReasoningMode(): boolean {
  const raw = process.env.LLM_THINKING_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export interface LiveMoodInput {
  currentMood?: MoodValues;
  personality?: string;
  latestMessage: string;
}

export async function runLiveMoodEvaluation(
  cfg: LiveConfig,
  input: LiveMoodInput,
) {
  return evaluateMood(
    {
      currentMood: input.currentMood ?? DEFAULT_MOOD_VALUES,
      personality: input.personality ?? "Wry and impatient",
      latestMessage: input.latestMessage,
    },
    {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      apiKey: cfg.apiKey,
    },
  );
}
