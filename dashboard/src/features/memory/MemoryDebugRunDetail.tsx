import { Navigate, useParams } from "react-router-dom";
import { JobRunEntries } from "@llm-tg-bot/dashboard/pages/debug/JobRunEntries";
import { parseMemoryDebugRunId } from "./debugPaths";

export function MemoryDebugRunDetail() {
  const { runId } = useParams();
  const id = parseMemoryDebugRunId(runId);
  if (id == null) return <Navigate to="/memory/debug" replace />;
  return <JobRunEntries runId={id} />;
}
