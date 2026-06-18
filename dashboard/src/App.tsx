import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isApiError } from "./api";
import { DashboardProvider, useDashboard } from "./context/DashboardContext";
import { AppLayout } from "./layout/AppLayout";
import { OfflinePage } from "./pages/OfflinePage";
import { OverviewPage } from "./pages/OverviewPage";
import { CharacterPage } from "./pages/CharacterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DataPage } from "./pages/DataPage";
import { DebugPage } from "./pages/DebugPage";
import { WorkflowPage } from "./pages/WorkflowPage";
import { ModulesPage } from "./pages/ModulesPage";
import { ModuleDetailPage } from "./pages/ModuleDetailPage";
import { ModuleDebugPage } from "./pages/ModuleDebugPage";
import "./App.css";

function DashboardRoutes() {
  const {
    loading,
    apiUnreachable,
    settings,
    stats,
    primaryLoadError,
    load,
  } = useDashboard();

  if (loading) {
    return (
      <div className="layout">
        <p className="loading">Loading dashboard…</p>
      </div>
    );
  }

  const showOfflinePage =
    !settings &&
    !stats &&
    (apiUnreachable ||
      (primaryLoadError != null &&
        isApiError(primaryLoadError) &&
        primaryLoadError.kind === "server"));

  if (showOfflinePage) {
    return (
      <OfflinePage
        primaryLoadError={primaryLoadError}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="character" element={<CharacterPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="modules" element={<ModulesPage />} />
        <Route path="modules/:moduleId/debug" element={<ModuleDebugPage />} />
        <Route path="modules/:moduleId" element={<ModuleDetailPage />} />
        <Route path="memories" element={<Navigate to="/modules/memory" replace />} />
        <Route path="mood" element={<Navigate to="/modules/mood-evaluation" replace />} />
        <Route path="debug/*" element={<DebugPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="workflow" element={<WorkflowPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <DashboardRoutes />
      </DashboardProvider>
    </BrowserRouter>
  );
}
