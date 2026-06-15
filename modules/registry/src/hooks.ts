export interface ModuleLiveHooks {
  emitMemoryUpdated?: (scope: "user" | "group" | "general") => void;
  emitDataUpdated?: (tableIds: string[]) => void;
  emitMoodUpdated?: () => void;
  emitPersonalitiesUpdated?: () => void;
}

let liveHooks: ModuleLiveHooks = {};

export function configureModuleLiveHooks(hooks: ModuleLiveHooks): void {
  liveHooks = hooks;
}

export function getModuleLiveHooks(): ModuleLiveHooks {
  return liveHooks;
}
