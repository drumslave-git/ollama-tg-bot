import { Link, Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { SummariesDebugRunDetail } from "./SummariesDebugRunDetail";
import { SummariesDebugRunList } from "./SummariesDebugRunList";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function SummariesDebugPage() {
  const navigate = useNavigate();
  const detailMatch = useMatch({ path: "/history/debug/:runId", end: true });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">
            Summary job runs
          </h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Each daily / manual history-summary run, with per-chat outcomes and
            the LLM request &amp; response. Open a run to see why a chat produced
            the topics it did.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {detailMatch ? (
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => navigate("/history/debug")}
            >
              ← Back
            </button>
          ) : null}
          <Link to="/history" className={secondaryBtn}>
            History
          </Link>
        </div>
      </header>

      <Routes>
        <Route index element={<SummariesDebugRunList />} />
        <Route path=":runId" element={<SummariesDebugRunDetail />} />
      </Routes>
    </div>
  );
}
