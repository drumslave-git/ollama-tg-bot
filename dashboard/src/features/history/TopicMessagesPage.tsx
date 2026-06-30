import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "@llm-tg-bot/dashboard/components/ErrorBanner";
import {
  api,
  type SummarySourceMessage,
  type SummaryTopicDetail,
} from "@llm-tg-bot/dashboard/api";
import { chatSummariesPath } from "./historyPaths";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function formatTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function TopicMessagesPage() {
  const { chatId = "", topicId = "" } = useParams();
  const id = Number(topicId);

  const [topic, setTopic] = useState<SummaryTopicDetail | null>(null);
  const [messages, setMessages] = useState<SummarySourceMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(id)) {
      setError(new Error("Invalid topic id"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSummaryTopicMessages(id);
      setTopic(res.topic);
      setMessages(res.messages);
    } catch (err) {
      setError(err);
      setTopic(null);
      setMessages(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={chatSummariesPath(chatId)} className={secondaryBtn}>
          ← Summaries
        </Link>
        <code className="font-mono text-[0.95em]">{chatId}</code>
      </div>

      <section className="rounded-lg border border-border bg-surface p-6">
        {error ? (
          <div className="mb-3.5">
            <ErrorBanner error={error} onRetry={() => void load()} />
          </div>
        ) : null}

        {loading && !topic ? (
          <p className="text-muted">Loading…</p>
        ) : !topic ? (
          <p className="text-muted">Topic not found.</p>
        ) : (
          <>
            <header className="mb-4">
              <span className="font-mono text-xs text-accent">
                {topic.summaryDate}
              </span>
              <p className="m-0 mt-1.5 whitespace-pre-wrap break-words text-[0.95rem] leading-snug">
                {topic.content}
              </p>
            </header>

            <h3 className="mb-2 text-sm font-semibold text-muted">
              Source messages
            </h3>

            {!messages || messages.length === 0 ? (
              <p className="text-muted">
                No source messages found. The referenced messages may have been
                cleared, or this topic cited none.
              </p>
            ) : (
              <ol className="m-0 list-none overflow-hidden rounded-lg border border-border p-0">
                {messages.map((message, index) => (
                  <li
                    key={message.messageId ?? `idx-${index}`}
                    className="border-b border-border px-3.5 py-3 last:border-b-0"
                  >
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-xs text-accent">
                        {message.role}
                      </span>
                      <time
                        className="text-xs text-muted"
                        dateTime={message.createdAt}
                      >
                        {formatTime(message.createdAt)}
                      </time>
                    </div>
                    <pre className="m-0 whitespace-pre-wrap break-words font-[inherit] text-sm leading-snug">
                      {message.content}
                    </pre>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
}
