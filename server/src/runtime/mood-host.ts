import {
  MOOD_EXTENSION_ID,
  type MoodCommandExtension,
} from "@llm-tg-bot/modules-mood-evaluation";
import {
  getEffectiveMood,
  getMoodStateView,
  tickMoodCooldown,
  getActivePersonalityMoodDefaults,
  getPersonalityById,
  resolveActivePersonalityId,
} from "../db/mood/index.js";

export function createMoodExtension(): MoodCommandExtension {
  return {
    tickMoodCooldown,
    getActivePersonalityMoodDefaults,
    getEffectiveMood,
    getMoodStateView,
    resolveActivePersonalityId: (activePersonalityId) => {
      const id = resolveActivePersonalityId(activePersonalityId);
      return id > 0 ? id : null;
    },
    getPersonalityById: (id) => {
      const personality = getPersonalityById(id);
      return personality ? { name: personality.name } : null;
    },
  };
}

export function createMoodExtensions(): Record<string, unknown> {
  return {
    [MOOD_EXTENSION_ID]: createMoodExtension(),
  };
}
