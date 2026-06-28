import {
  MOOD_EXTENSION_ID,
  type MoodCommandExtension,
} from "../features/mood/index.js";
import {
  getEffectiveMood,
  getMoodStateView,
  tickMoodCooldown,
  getActivePersonalityMoodDefaults,
  getPersonalityById,
  resolveActivePersonalityId,
} from "../features/mood/db/index.js";

export function createMoodExtension(): MoodCommandExtension {
  return {
    tickMoodCooldown,
    getActivePersonalityMoodDefaults,
    getEffectiveMood,
    getMoodStateView,
    resolveActivePersonalityId: async (activePersonalityId) => {
      const id = await resolveActivePersonalityId(activePersonalityId);
      return id > 0 ? id : null;
    },
    getPersonalityById: async (id) => {
      const personality = await getPersonalityById(id);
      return personality ? { name: personality.name } : null;
    },
  };
}

export function createMoodExtensions(): Record<string, unknown> {
  return {
    [MOOD_EXTENSION_ID]: createMoodExtension(),
  };
}
