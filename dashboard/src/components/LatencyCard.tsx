import { useEffect, useState } from "react";
import { api, type PhaseTimingStat } from "../api";
import { ErrorBanner } from "./ErrorBanner";
import { Card, Hint } from "./ui/Layout";

const DAY_OPTIONS = [1, 7, 30] as const;

/** Order phases roughly along the message path; unknown ids go to the end. */
const PHASE_ORDER = [
  "intake",
  "history-intake",
  "address",
  "queue-wait",
  "vision",
  "system",
  "personality",
  "completions",
  "sticker",
  "history-record",
  "mood",
  "turn-total",
];

function phaseRank(phaseId: string): number {
  const idx = PHASE_ORDER.indexOf(phaseId);
  return idx < 0 ? PHASE_ORDER.length : idx;
}

function phaseLabel(phaseId: string): string {
  const words = phaseId.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function LatencyCard() {
  const [days, setDays] = useState<number>(7);
  const [phases, setPhases] = useState<PhaseTimingStat[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getPhaseTimings(days)
      .then((res) => {
        if (!cancelled) setPhases(res.phases);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const sorted = phases
    ? [...phases].sort((a, b) => phaseRank(a.phaseId) - phaseRank(b.phaseId))
    : null;

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold text-text">
          Reply latency by phase
        </h3>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={
                option === days
                  ? "rounded-md border border-border bg-border/40 px-2 py-1 text-xs font-medium text-text"
                  : "rounded-md border border-transparent px-2 py-1 text-xs text-muted hover:border-border"
              }
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {error != null ? <ErrorBanner error={error} compact /> : null}

      {sorted && sorted.length > 0 ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium">Phase</th>
              <th className="pb-2 text-right font-medium">Runs</th>
              <th className="pb-2 text-right font-medium">p50</th>
              <th className="pb-2 text-right font-medium">p95</th>
              <th className="pb-2 text-right font-medium">Max</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((phase) => (
              <tr
                key={phase.phaseId}
                className="border-t border-border font-mono"
              >
                <td className="py-1.5 pr-2 font-sans text-text">
                  {phaseLabel(phase.phaseId)}
                </td>
                <td className="py-1.5 text-right text-muted">{phase.count}</td>
                <td className="py-1.5 text-right text-text">
                  {formatMs(phase.p50Ms)}
                </td>
                <td className="py-1.5 text-right text-text">
                  {formatMs(phase.p95Ms)}
                </td>
                <td className="py-1.5 text-right text-muted">
                  {formatMs(phase.maxMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : sorted ? (
        <Hint>
          No timings recorded in the last {days} day(s) — they accumulate as
          the bot processes messages.
        </Hint>
      ) : error == null ? (
        <Hint>Loading…</Hint>
      ) : null}
    </Card>
  );
}
