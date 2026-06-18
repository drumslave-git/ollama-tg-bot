import { createModuleJobDebug, type ModuleJobDebugSnapshot } from "@llm-tg-bot/modules-utils";

export const visionJobDebug = createModuleJobDebug({
  moduleId: "vision",
  maxRuns: 30,
});

let pendingBackfillStats: (() => {
  pendingMediaRows: number;
  chatsWithPending: number;
}) | null = null;

export function configureVisionJobDebugStats(
  provider: () => { pendingMediaRows: number; chatsWithPending: number },
): void {
  pendingBackfillStats = provider;
}

export interface VisionJobDebugSnapshot extends ModuleJobDebugSnapshot {
  pendingMediaRows: number;
  chatsWithPending: number;
}

export function getVisionJobDebugSnapshot(): VisionJobDebugSnapshot {
  const pending = pendingBackfillStats?.() ?? {
    pendingMediaRows: 0,
    chatsWithPending: 0,
  };
  return {
    ...visionJobDebug.snapshot(),
    ...pending,
  };
}
