import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isApiError } from "./api";
import { DashboardProvider, useDashboard } from "./context/DashboardContext";
import { AppLayout } from "./layout/AppLayout";
import { LoadingState } from "./components/ui/Layout";
import { OfflinePage } from "./pages/OfflinePage";
import { OverviewPage } from "./pages/OverviewPage";
import { CharacterPage } from "./pages/CharacterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DataPage } from "./pages/DataPage";
import { DebugPage } from "./pages/DebugPage";
import { WorkflowPage } from "./pages/WorkflowPage";
import { HistoryPage } from "./features/history/HistoryPage";
import { MemoriesPage } from "./features/memory/MemoriesPage";
import { MemoryDebugPage } from "./features/memory/MemoryDebugPage";
import { MoodPage } from "./features/mood-evaluation/MoodPage";
import { TasksPage } from "./features/tasks/TasksPage";
import { TasksDebugPage } from "./features/tasks/TasksDebugPage";
import { VisionPage } from "./features/vision/VisionPage";

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
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <LoadingState>Loading dashboard…</LoadingState>
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
        <Route path="history" element={<HistoryPage />} />
        <Route path="memory" element={<MemoriesPage />} />
        <Route path="memory/debug/*" element={<MemoryDebugPage />} />
        <Route path="mood" element={<MoodPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/debug" element={<TasksDebugPage />} />
        <Route path="vision/*" element={<VisionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="debug/*" element={<DebugPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="workflow" element={<WorkflowPage />} />
        {/* Back-compat redirects from the former Modules navigation. */}
        <Route path="memories" element={<Navigate to="/memory" replace />} />
        <Route path="modules" element={<Navigate to="/" replace />} />
        <Route path="modules/memory" element={<Navigate to="/memory" replace />} />
        <Route
          path="modules/memory/debug/*"
          element={<Navigate to="/memory/debug" replace />}
        />
        <Route
          path="modules/mood-evaluation"
          element={<Navigate to="/mood" replace />}
        />
        <Route path="modules/history" element={<Navigate to="/history" replace />} />
        <Route path="modules/tasks" element={<Navigate to="/tasks" replace />} />
        <Route path="modules/vision" element={<Navigate to="/vision" replace />} />
        <Route
          path="modules/vision/debug/*"
          element={<Navigate to="/vision" replace />}
        />
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
