import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type DashboardModuleSummary } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { getModuleUi } from "../moduleUiRegistry";

export function ModuleDebugPage() {
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
  const DebugPage = ui?.DebugPage;

  if (loading) {
    return (
      <div className="page">
        <p className="loading">Loading module debug…</p>
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

  const label = module.dashboard?.label ?? module.name;

  return (
    <div className="module-detail">
      <header className="page-header module-detail-header">
        <div>
          <p className="breadcrumb">
            <Link to="/modules">Modules</Link>
            <span aria-hidden="true"> / </span>
            <Link to={`/modules/${moduleId}`}>{label}</Link>
            <span aria-hidden="true"> / </span>
            <span>Debug</span>
          </p>
          {!DebugPage ? (
            <>
              <h2>{label} debug</h2>
              <p className="page-desc">
                Background job runs and step detail for this module.
              </p>
            </>
          ) : null}
        </div>
        <div className="module-detail-tabs">
          <Link className="btn secondary" to={`/modules/${moduleId}`}>
            Module data
          </Link>
        </div>
      </header>

      {DebugPage ? (
        <DebugPage />
      ) : (
        <section className="card">
          <p className="hint">This module has no debug UI registered.</p>
        </section>
      )}
    </div>
  );
}
