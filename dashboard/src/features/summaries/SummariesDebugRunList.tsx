import { JobRunList } from "@llm-tg-bot/dashboard/pages/debug/JobRunList";
import { summariesDebugRunPath } from "./debugPaths";

export function SummariesDebugRunList() {
  return <JobRunList featureId="summaries" runPath={summariesDebugRunPath} />;
}
