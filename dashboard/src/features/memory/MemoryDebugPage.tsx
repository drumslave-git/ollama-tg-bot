import { Link, Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import {
  formatCountdown,
  useLiveClock,
} from "@llm-tg-bot/dashboard/pages/debug/debugUtils";
import { MemoryDebugRunDetail } from "./MemoryDebugRunDetail";
import { MemoryDebugRunList } from "./MemoryDebugRunList";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function MemoryDebugPage() {
  const navigate = useNavigate();
  const detailMatch = useMatch({
    path: "/memory/debug/:runId",
    end: true,
  });
  const { stats } = useDashboard();
  const scheduled = stats?.memoryJobStatus === "scheduled";
  const now = useLiveClock(scheduled);
  const countdown = scheduled
    ? formatCountdown(stats?.memoryJobRunAt, now)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 mb-1 text-sm text-muted">
            <Link
              to="/memory"
              className="text-accent no-underline hover:underline"
            >
              Memory
            </Link>
            <span aria-hidden="true"> / </span>
            <span>Job debug</span>
          </p>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
            Memory job debug
          </h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Debounced maintenance runs with per-record phases and LLM I/O.
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
              onClick={() => navigate("/memory/debug")}
            >
              ← Back
            </button>
          </div>
        ) : null}
      </header>

      <Routes>
        <Route index element={<MemoryDebugRunList />} />
        <Route path=":runId" element={<MemoryDebugRunDetail />} />
      </Routes>
    </div>
  );
}
