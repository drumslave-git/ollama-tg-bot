import { useCallback, useEffect, useState } from "react";
import { api, type ModuleJobDebugSnapshot } from "@llm-tg-bot/dashboard/api";
import { ModuleJobDebugPanel } from "@llm-tg-bot/dashboard/components/ModuleJobDebugPanel";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { useLiveStats } from "@llm-tg-bot/dashboard/liveSocket";

export function MemoryDebugPage() {
  const { apiOnline } = useDashboard();
  const [snapshot, setSnapshot] = useState<ModuleJobDebugSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (apiOnline !== true) return;
    setError(null);
    try {
      const data = await api.getMemoryJobDebug();
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load debug data");
    } finally {
      setLoading(false);
    }
  }, [apiOnline]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  useLiveStats(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ModuleJobDebugPanel
      title="Memory extraction job"
      snapshot={snapshot}
      loading={loading && !snapshot}
      error={error}
    />
  );
}
