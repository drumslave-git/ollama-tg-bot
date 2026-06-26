import { Route, Routes, useMatch, useNavigate } from "react-router-dom";
import { DebugChatList } from "./debug/DebugChatList";
import { DebugChatProcessings } from "./debug/DebugChatProcessings";
import { DebugProcessingDetail } from "./debug/DebugProcessingDetail";
import { debugChatPath, decodeRouteEntityId } from "./debug/debugPaths";
import { Button } from "../components/ui/Button";
import { Page, PageHeader } from "../components/ui/Layout";

export function DebugPage() {
  const navigate = useNavigate();
  const detailMatch = useMatch({
    path: "/debug/:entityId/:processingId",
    end: true,
  });
  const listMatch = useMatch({ path: "/debug/:entityId", end: true });
  const entityId = decodeRouteEntityId(
    detailMatch?.params.entityId ?? listMatch?.params.entityId,
  );
  function goBack() {
    if (detailMatch && entityId) {
      navigate(debugChatPath(entityId));
      return;
    }
    if (listMatch) {
      navigate("/debug");
    }
  }

  const showBack = Boolean(detailMatch || listMatch);

  return (
    <Page>
      <PageHeader
        title="Debug"
        description="Message processings (last 50 per chat). Updates live."
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
        <Route path=":entityId" element={<DebugChatProcessings />} />
        <Route path=":entityId/:processingId" element={<DebugProcessingDetail />} />
      </Routes>
    </Page>
  );
}
