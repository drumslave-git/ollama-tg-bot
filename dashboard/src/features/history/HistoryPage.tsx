import { Link, Route, Routes } from "react-router-dom";
import { HistoryChatList } from "./HistoryChatList";
import { ChatSummariesPage } from "./ChatSummariesPage";
import { TopicMessagesPage } from "./TopicMessagesPage";

const secondaryBtn =
  "inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface-hover px-4 py-2.5 text-sm font-semibold text-text transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

export function HistoryPage() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-2xl font-bold tracking-tight">
            Chat history
          </h1>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            Browse stored chats. Open one to read its daily summary topics, and
            open a topic to see the verbatim messages it was distilled from.
          </p>
        </div>
        <Link to="/history/debug" className={secondaryBtn}>
          Summary job runs
        </Link>
      </header>

      <Routes>
        <Route index element={<HistoryChatList />} />
        <Route path="chat/:chatId" element={<ChatSummariesPage />} />
        <Route
          path="chat/:chatId/topic/:topicId"
          element={<TopicMessagesPage />}
        />
      </Routes>
    </div>
  );
}
