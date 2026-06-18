import { Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { DebugChatList } from "./debug/DebugChatList";
import { DebugChatMessages } from "./debug/DebugChatMessages";
import { DebugMessageDetail } from "./debug/DebugMessageDetail";
import { debugChatPath, decodeRouteChatId } from "./debug/debugPaths";
import { Button } from "../components/ui/Button";
import { Page, PageHeader } from "../components/ui/Layout";

export function DebugPage() {
  const navigate = useNavigate();
  const detailMatch = useMatch({
    path: "/debug/:chatId/:messageId",
    end: true,
  });
  const messagesMatch = useMatch({ path: "/debug/:chatId", end: true });
  const chatId = decodeRouteChatId(
    detailMatch?.params.chatId ?? messagesMatch?.params.chatId,
  );
  function goBack() {
    if (detailMatch && chatId) {
      navigate(debugChatPath(chatId));
      return;
    }
    if (messagesMatch) {
      navigate("/debug");
    }
  }

  const showBack = Boolean(detailMatch || messagesMatch);

  return (
    <Page>
      <PageHeader
        title="Debug"
        description="Message processing reports (last 50 per chat). Updates live."
        actions={
          showBack ? (
            <Button variant="secondary" onClick={goBack}>
              ← Back
            </Button>
          ) : undefined
        }
      />

      <Routes>
        <Route index element={<DebugChatList />} />
        <Route path=":chatId" element={<DebugChatMessages />} />
        <Route path=":chatId/:messageId" element={<DebugMessageDetail />} />
      </Routes>
    </Page>
  );
}
