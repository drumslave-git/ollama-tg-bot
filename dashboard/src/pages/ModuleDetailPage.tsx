import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type DashboardModuleSummary } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { getModuleUi } from "../moduleUiRegistry";

export function ModuleDetailPage() {
  const { moduleId = "" } = useParams();
  const [module, setModule] = useState<DashboardModuleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getModules();
        const found = data.modules.find((entry) => entry.id === moduleId) ?? null;
        if (!cancelled) setModule(found);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const ui = getModuleUi(moduleId);
  const Page = ui?.Page;

  if (loading) {
    return (
      <div className="page">
        <p className="loading">Loading module…</p>
      </div>
    );
  }

  if (error != null) {
    return (
      <div className="page">
        <ErrorBanner error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="page">
        <p className="hint">Module not found.</p>
        <Link to="/modules">Back to modules</Link>
      </div>
    );
  }

  return (
    <div className="module-detail">
      <header className="page-header module-detail-header">
        <div>
          <p className="breadcrumb">
            <Link to="/modules">Modules</Link>
            <span aria-hidden="true"> / </span>
            <span>{module.dashboard?.label ?? module.name}</span>
          </p>
          <h2>{module.dashboard?.label ?? module.name}</h2>
          {module.dashboard?.description ? (
            <p className="page-desc">{module.dashboard.description}</p>
          ) : (
            <p className="page-desc">{module.description}</p>
          )}
        </div>
      </header>

      {Page ? (
        <Page />
      ) : (
        <section className="card">
          <p className="hint">
            This module has no dashboard UI registered. Data tables:{" "}
            {module.dataTables.length > 0
              ? module.dataTables.join(", ")
              : "none"}
          </p>
        </section>
      )}
    </div>
  );
}
