import type { MoodValues } from "./values.js";

export const MOOD_EXTENSION_ID = "mood-evaluation";

export interface MoodCommandExtension {
  tickMoodCooldown: () => void;
  getActivePersonalityMoodDefaults: () => MoodValues;
  getEffectiveMood: () => MoodValues;
  getMoodStateView: () => { updatedAt: string | null } | null;
  resolveActivePersonalityId: (activePersonalityId: number) => number | null;
  getPersonalityById: (
    id: number,
  ) => { name: string } | null | undefined;
}
