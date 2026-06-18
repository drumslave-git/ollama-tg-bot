import { createModuleJobDebug } from "@llm-tg-bot/modules-utils";

export const memoryJobDebug = createModuleJobDebug({
  moduleId: "memory",
  maxRuns: 30,
});

export function getMemoryJobDebugSnapshot() {
  return memoryJobDebug.snapshot();
}
