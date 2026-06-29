export interface FeatureLiveHooks {
  emitMemoryUpdated?: (scope: "user" | "general") => void;
  emitDataUpdated?: (tableIds: string[]) => void;
  emitMoodUpdated?: () => void;
  emitPersonalitiesUpdated?: () => void;
}

let liveHooks: FeatureLiveHooks = {};

export function configureFeatureLiveHooks(hooks: FeatureLiveHooks): void {
  liveHooks = hooks;
}

export function getFeatureLiveHooks(): FeatureLiveHooks {
  return liveHooks;
}
