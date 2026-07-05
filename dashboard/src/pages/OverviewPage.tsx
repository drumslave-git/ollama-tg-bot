import { useState } from "react";
import { api } from "../api";
import { useDashboard } from "../context/DashboardContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { LatencyCard } from "../components/LatencyCard";
import { TokenUsageCard } from "../components/TokenUsageCard";
import { Button } from "../components/ui/Button";
import { Card, Hint, Page, PageHeader } from "../components/ui/Layout";
import { cn } from "../lib/cn";
import { formatTokenCount } from "../pages/debug/debugUtils";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function OverviewPage() {
  const { stats, sectionErrors, load, setSectionError } = useDashboard();
  const [clearingErrors, setClearingErrors] = useState(false);

  async function handleClearErrors() {
    if (
      !confirm(
        "Clear all stored error logs and reset the error counter? This cannot be undone.",
      )
    ) {
      return;
    }

    setClearingErrors(true);
    setSectionError("stats", null);
    try {
      await api.clearErrors();
      await load();
    } catch (err) {
      setSectionError("stats", err);
    } finally {
      setClearingErrors(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Live bot activity and usage tips."
      />

      <Card>
        <h3 className="m-0 mb-5 text-base font-semibold text-text">Bot stats</h3>

        {sectionErrors.stats != null ? (
          <ErrorBanner
            error={sectionErrors.stats}
            compact
            onRetry={() => void load()}
          />
        ) : null}

        {stats ? (
          <dl className="m-0 grid gap-3.5">
            {[
              ["Username", stats.botUsername ? `@${stats.botUsername}` : "—"],
              ["Uptime", formatUptime(stats.uptimeSeconds)],
              ["Messages received", String(stats.messagesReceived)],
              ["Replies sent", String(stats.messagesReplied)],
              ["Vision requests", String(stats.visionRequests)],
              ["LLM calls", formatTokenCount(stats.llmCalls)],
              [
                "LLM tokens (in / out)",
                `${formatTokenCount(stats.llmPromptTokens)} / ${formatTokenCount(
                  stats.llmCompletionTokens,
                )}`,
              ],
              ["LLM tokens total", formatTokenCount(stats.llmTotalTokens)],
              [
                "Errors",
                String(stats.errors),
                stats.errors > 0 ? "text-danger" : undefined,
              ],
              [
                "Last activity",
                stats.lastActivityAt
                  ? new Date(stats.lastActivityAt).toLocaleString()
                  : "—",
              ],
            ].map(([label, value, valueClass]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-b border-border pb-2.5 last:border-b-0 last:pb-0"
              >
                <dt className="m-0 text-sm text-muted">{label}</dt>
                <dd
                  className={cn(
                    "m-0 font-mono text-sm font-medium",
                    valueClass,
                  )}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Hint>Stats unavailable — API may be offline.</Hint>
        )}

        {stats && stats.errors > 0 ? (
          <div className="mt-5 border-t border-border pt-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="m-0 text-sm font-semibold text-muted">
                Recent errors
              </h3>
              <Button
                variant="secondary"
                onClick={() => void handleClearErrors()}
                disabled={clearingErrors}
              >
                {clearingErrors ? "Clearing…" : "Clear logs"}
              </Button>
            </div>
            {stats.recentErrors.length === 0 ? (
              <Hint>
                No error details stored yet (counter includes failures before
                logging was added). Check the server console for{" "}
                <code className="font-mono text-[0.85em]">Handler error:</code>{" "}
                lines.
              </Hint>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {stats.recentErrors.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-danger/35 bg-danger/6 px-3.5 py-3"
                  >
                    <p className="m-0 mb-1.5 break-words font-mono text-sm leading-snug text-text">
                      {entry.message}
                    </p>
                    <div className="flex flex-wrap gap-2.5 text-xs text-muted">
                      <time dateTime={entry.createdAt}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </time>
                      {entry.chatId ? (
                        <span>
                          chat{" "}
                          <code className="font-mono text-sm text-text">
                            {entry.chatId}
                          </code>
                        </span>
                      ) : null}
                      {entry.userId ? (
                        <span>
                          user{" "}
                          <code className="font-mono text-sm text-text">
                            {entry.userId}
                          </code>
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="mt-5 border-t border-border pt-5">
          <h3 className="m-0 mb-3 text-sm font-semibold text-muted">
            How to talk to the bot
          </h3>
          <ul className="m-0 list-disc pl-5 text-sm text-muted">
            <li className="mb-1.5">
              <strong className="text-text">Private chat:</strong> send any
              message
            </li>
            <li className="mb-1.5">
              <strong className="text-text">Groups:</strong> @mention the bot,
              reply to its messages, or use{" "}
              <code className="font-mono text-[0.85em]">/start@your_bot</code> —
              plain <code className="font-mono text-[0.85em]">/start</code> does
              not reach the bot in groups
            </li>
            <li className="mb-1.5">
              <strong className="text-text">Group setup:</strong> if the bot
              never answers, open @BotFather →{" "}
              <code className="font-mono text-[0.85em]">/setprivacy</code> →{" "}
              <b>Disable</b>, then remove and re-add the bot. “Has no access to
              messages” in group permissions is normal until then.
            </li>
            <li className="mb-1.5">
              <strong className="text-text">Vision:</strong> send a photo, image
              file, or sticker (animated/video use a preview frame; optional
              caption)
            </li>
            <li className="mb-1.5">
              <strong className="text-text">Commands:</strong>{" "}
              <code className="font-mono text-[0.85em]">/forget</code> clears your
              stored memories. Owner only:{" "}
              <code className="font-mono text-[0.85em]">/reset</code> clears chat
              history
            </li>
          </ul>
        </div>
      </Card>

      {stats ? (
        <Card>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2.5 w-2.5 rounded-full",
                stats.browserAgentStatus === "running"
                  ? "bg-accent"
                  : "bg-muted/40",
              )}
              aria-hidden="true"
            />
            <h3 className="m-0 text-base font-semibold text-text">
              Web browsing agent
            </h3>
            <span className="text-sm text-muted">
              {stats.browserAgentStatus === "running"
                ? "running"
                : stats.browserAgentQueued
                  ? `${stats.browserAgentQueued} queued`
                  : "idle"}
            </span>
          </div>
          {stats.browserAgentStatus === "running" ? (
            <dl className="m-0 mt-3 grid gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="m-0 text-muted">Goal</dt>
                <dd className="m-0 max-w-[70%] truncate text-right font-medium">
                  {stats.browserAgentGoal ?? "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="m-0 text-muted">Step</dt>
                <dd className="m-0 font-mono">{stats.browserAgentStep}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="m-0 text-muted">Action</dt>
                <dd className="m-0 max-w-[70%] truncate text-right">
                  {stats.browserAgentAction ?? "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <Hint>
              The bot can browse the web in the background when the owner asks it
              to research something. Enable it on Settings.
            </Hint>
          )}
        </Card>
      ) : null}

      <TokenUsageCard />

      <LatencyCard />
    </Page>
  );
}
