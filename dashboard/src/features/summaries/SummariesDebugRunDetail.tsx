import { Navigate, useParams } from "react-router-dom";
import { JobRunEntries } from "@llm-tg-bot/dashboard/pages/debug/JobRunEntries";
import { parseSummariesDebugRunId } from "./debugPaths";

export function SummariesDebugRunDetail() {
  const { runId } = useParams();
  const id = parseSummariesDebugRunId(runId);
  if (id == null) return <Navigate to="/history/debug" replace />;
  return <JobRunEntries runId={id} />;
}
