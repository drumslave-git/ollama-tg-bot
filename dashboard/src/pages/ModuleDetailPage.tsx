import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type DashboardModuleSummary } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { getModuleUi } from "../moduleUiRegistry";
import { ButtonLink } from "../components/ui/Button";
import { Card, Hint, LoadingState, Page } from "../components/ui/Layout";

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
  const PageComponent = ui?.Page;

  if (loading) {
    return (
      <Page>
        <LoadingState>Loading module…</LoadingState>
      </Page>
    );
  }

  if (error != null) {
    return (
      <Page>
        <ErrorBanner error={error} onRetry={() => window.location.reload()} />
      </Page>
    );
  }

  if (!module) {
    return (
      <Page>
        <Hint>Module not found.</Hint>
        <Link to="/modules" className="text-accent no-underline hover:underline">
          Back to modules
        </Link>
      </Page>
    );
  }

  return (
    <Page>
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 mb-1 text-sm text-muted">
            <Link to="/modules" className="text-accent no-underline hover:underline">
              Modules
            </Link>
            <span aria-hidden="true"> / </span>
            <span>{module.dashboard?.label ?? module.name}</span>
          </p>
          <h2 className="m-0 text-2xl font-bold tracking-tight">
            {module.dashboard?.label ?? module.name}
          </h2>
          {module.dashboard?.description ? (
            <p className="m-0 mt-1.5 max-w-xl text-sm text-muted">
              {module.dashboard.description}
            </p>
          ) : (
            <p className="m-0 mt-1.5 max-w-xl text-sm text-muted">
              {module.description}
            </p>
          )}
        </div>
      </header>

      {PageComponent ? (
        <>
          <div className="mb-4 flex gap-2">
            {ui?.DebugPage ? (
              <ButtonLink variant="secondary" to={`/modules/${moduleId}/debug`}>
                Job debug
              </ButtonLink>
            ) : null}
          </div>
          <PageComponent />
        </>
      ) : (
        <Card>
          <Hint>
            This module has no dashboard UI registered. Data tables:{" "}
            {module.dataTables.length > 0
              ? module.dataTables.join(", ")
              : "none"}
          </Hint>
        </Card>
      )}
    </Page>
  );
}
