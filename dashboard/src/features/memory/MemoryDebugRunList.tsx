import { JobRunList } from "@llm-tg-bot/dashboard/pages/debug/JobRunList";
import { memoryDebugRunPath } from "./debugPaths";

export function MemoryDebugRunList() {
  return <JobRunList featureId="memory" runPath={memoryDebugRunPath} />;
}
