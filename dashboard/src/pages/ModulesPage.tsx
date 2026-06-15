import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type DashboardModuleSummary } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";

export function ModulesPage() {
  const [modules, setModules] = useState<DashboardModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getModules();
        if (!cancelled) setModules(data.modules);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <p className="loading">Loading modules…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Modules</h2>
        <p className="page-desc">
          Feature packages discovered from the project <code>modules/</code>{" "}
          folder. Each module can expose server logic, database tables, and
          dashboard UI via its manifest.
        </p>
      </header>

      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => window.location.reload()} />
      ) : null}

      <div className="module-grid">
        {modules.map((module) => (
          <article key={module.id} className="card module-card">
            <h3>{module.dashboard?.label ?? module.name}</h3>
            <p className="hint">{module.description}</p>
            <dl className="module-meta">
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{module.id}</code>
                </dd>
              </div>
              {module.apiBasePath ? (
                <div>
                  <dt>API</dt>
                  <dd>
                    <code>{module.apiBasePath}</code>
                  </dd>
                </div>
              ) : null}
              {module.dataTables.length > 0 ? (
                <div>
                  <dt>Tables</dt>
                  <dd>{module.dataTables.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
            {module.hasUi ? (
              <Link className="button-link primary" to={`/modules/${module.id}`}>
                Open module
              </Link>
            ) : (
              <p className="hint module-no-ui">No dashboard UI for this module.</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
