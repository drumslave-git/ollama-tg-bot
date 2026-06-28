import { JobRunList } from "@llm-tg-bot/dashboard/pages/debug/JobRunList";
import { visionDebugRunPath } from "./debugPaths";

export function VisionDebugRunList() {
  return <JobRunList moduleId="vision" runPath={visionDebugRunPath} />;
}
