import type { MoodValues } from "./values.js";

export const MOOD_EXTENSION_ID = "mood-evaluation";

export interface MoodCommandExtension {
  tickMoodCooldown: () => Promise<boolean>;
  getActivePersonalityMoodDefaults: () => Promise<MoodValues>;
  getEffectiveMood: () => Promise<MoodValues>;
  getMoodStateView: () => Promise<{ updatedAt: string | null } | null>;
  resolveActivePersonalityId: (
    activePersonalityId: number,
  ) => Promise<number | null>;
  getPersonalityById: (
    id: number,
  ) => Promise<{ name: string } | null | undefined>;
}
