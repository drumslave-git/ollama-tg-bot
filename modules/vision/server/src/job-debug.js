import { createModuleJobDebug } from "@llm-tg-bot/modules-utils";
export const visionJobDebug = createModuleJobDebug({
    moduleId: "vision",
    maxRuns: 30,
});
let pendingBackfillStats = null;
export function configureVisionJobDebugStats(provider) {
    pendingBackfillStats = provider;
}
export function getVisionJobDebugSnapshot() {
    const pending = pendingBackfillStats?.() ?? {
        pendingMediaRows: 0,
        chatsWithPending: 0,
    };
    return {
        ...visionJobDebug.snapshot(),
        ...pending,
    };
}
