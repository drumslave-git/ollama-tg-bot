import { Navigate, useParams } from "react-router-dom";
import { JobRunEntries } from "@llm-tg-bot/dashboard/pages/debug/JobRunEntries";
import { parseVisionDebugRunId } from "./debugPaths";

export function VisionDebugRunDetail() {
  const { runId } = useParams();
  const id = parseVisionDebugRunId(runId);
  if (id == null) return <Navigate to="/vision" replace />;
  return <JobRunEntries runId={id} />;
}
