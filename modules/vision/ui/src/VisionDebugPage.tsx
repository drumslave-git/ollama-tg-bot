import { Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import {
  formatCountdown,
  useLiveClock,
} from "@llm-tg-bot/dashboard/pages/debug/debugUtils";
import { VisionDebugRunDetail } from "./VisionDebugRunDetail";
import { VisionDebugRunList } from "./VisionDebugRunList";

export function VisionDebugPage() {
  const navigate = useNavigate();
  const detailMatch = useMatch({
    path: "/modules/vision/debug/:runId",
    end: true,
  });
  const { stats } = useDashboard();
  const scheduled = stats?.visionJobStatus === "scheduled";
  const now = useLiveClock(scheduled);
  const countdown = scheduled
    ? formatCountdown(stats?.visionJobRunAt, now)
    : null;

  return (
    <div className="debug-page">
      <header className="page-header">
        <div className="debug-header-row">
          <div>
            <h2>Vision job debug</h2>
            <p className="page-desc">
              Debounced backfill runs with per-media phases and LLM I/O.
              {scheduled && countdown ? (
                <>
                  {" "}
                  Next run in <strong>{countdown}</strong>.
                </>
              ) : null}
            </p>
          </div>
          {detailMatch ? (
            <div className="debug-header-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => navigate("/modules/vision/debug")}
              >
                ← Back
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <Routes>
        <Route index element={<VisionDebugRunList />} />
        <Route path=":runId" element={<VisionDebugRunDetail />} />
      </Routes>
    </div>
  );
}
