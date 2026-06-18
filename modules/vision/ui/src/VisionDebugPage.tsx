import { Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import {
  formatCountdown,
  useLiveClock,
} from "@llm-tg-bot/dashboard/pages/debug/debugUtils";
import { VisionDebugRunDetail } from "./VisionDebugRunDetail";
import { VisionDebugRunList } from "./VisionDebugRunList";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

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
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
            Vision job debug
          </h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
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
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => navigate("/modules/vision/debug")}
            >
              ← Back
            </button>
          </div>
        ) : null}
      </header>

      <Routes>
        <Route index element={<VisionDebugRunList />} />
        <Route path=":runId" element={<VisionDebugRunDetail />} />
      </Routes>
    </div>
  );
}
