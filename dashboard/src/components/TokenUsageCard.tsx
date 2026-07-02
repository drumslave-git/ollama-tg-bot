import { useEffect, useState } from "react";
import { api, type LlmUsageWindow } from "../api";
import { formatTokenCount } from "../pages/debug/debugUtils";
import { ErrorBanner } from "./ErrorBanner";
import { Card, Hint } from "./ui/Layout";

const DAY_OPTIONS = [1, 7, 30] as const;

/** Friendly label for a raw call label (matches the debug entry vocabulary). */
function callLabel(label: string): string {
  const words = label.replace(/[_·-]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function TokenUsageCard() {
  const [days, setDays] = useState<number>(7);
  const [usage, setUsage] = useState<LlmUsageWindow | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getLlmUsage(days)
      .then((res) => {
        if (!cancelled) setUsage(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const rows = usage
    ? [...usage.byLabel].sort((a, b) => b.totalTokens - a.totalTokens)
    : null;

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold text-text">
          LLM token usage by call type
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

      {rows && rows.length > 0 && usage ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium">Call type</th>
              <th className="pb-2 text-right font-medium">Calls</th>
              <th className="pb-2 text-right font-medium">In</th>
              <th className="pb-2 text-right font-medium">Out</th>
              <th className="pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-border font-mono">
                <td className="py-1.5 pr-2 font-sans text-text">
                  {callLabel(row.label)}
                </td>
                <td className="py-1.5 text-right text-muted">
                  {formatTokenCount(row.calls)}
                </td>
                <td className="py-1.5 text-right text-muted">
                  {formatTokenCount(row.promptTokens)}
                </td>
                <td className="py-1.5 text-right text-muted">
                  {formatTokenCount(row.completionTokens)}
                </td>
                <td className="py-1.5 text-right text-text">
                  {formatTokenCount(row.totalTokens)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-mono font-semibold">
              <td className="py-1.5 pr-2 font-sans text-text">Total</td>
              <td className="py-1.5 text-right text-muted">
                {formatTokenCount(usage.calls)}
              </td>
              <td className="py-1.5 text-right text-muted">
                {formatTokenCount(usage.promptTokens)}
              </td>
              <td className="py-1.5 text-right text-muted">
                {formatTokenCount(usage.completionTokens)}
              </td>
              <td className="py-1.5 text-right text-text">
                {formatTokenCount(usage.totalTokens)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : rows ? (
        <Hint>
          No LLM token usage recorded in the last {days} day(s) — it accumulates
          as the bot makes model calls. (Providers that omit usage in their
          responses won't be counted.)
        </Hint>
      ) : error == null ? (
        <Hint>Loading…</Hint>
      ) : null}
    </Card>
  );
}
