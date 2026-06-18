import { Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import {
  formatCountdown,
  useLiveClock,
} from "@llm-tg-bot/dashboard/pages/debug/debugUtils";
import { MemoryDebugRunDetail } from "./MemoryDebugRunDetail";
import { MemoryDebugRunList } from "./MemoryDebugRunList";

export function MemoryDebugPage() {
  const navigate = useNavigate();
  const detailMatch = useMatch({
    path: "/modules/memory/debug/:runId",
    end: true,
  });
  const { stats } = useDashboard();
  const scheduled = stats?.memoryJobStatus === "scheduled";
  const now = useLiveClock(scheduled);
  const countdown = scheduled
    ? formatCountdown(stats?.memoryJobRunAt, now)
    : null;

  return (
    <div className="debug-page">
      <header className="page-header">
        <div className="debug-header-row">
          <div>
            <h2>Memory job debug</h2>
            <p className="page-desc">
              Debounced extraction runs with per-chat phases and LLM I/O.
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
                onClick={() => navigate("/modules/memory/debug")}
              >
                ← Back
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <Routes>
        <Route index element={<MemoryDebugRunList />} />
        <Route path=":runId" element={<MemoryDebugRunDetail />} />
      </Routes>
    </div>
  );
}
