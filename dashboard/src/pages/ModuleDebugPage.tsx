import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, type DashboardModuleSummary } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { getModuleUi } from "../moduleUiRegistry";
import { ButtonLink } from "../components/ui/Button";
import { Card, Hint, LoadingState, Page } from "../components/ui/Layout";

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
  const DebugPageComponent = ui?.DebugPage;

  if (loading) {
    return (
      <Page>
        <LoadingState>Loading module debug…</LoadingState>
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

  const label = module.dashboard?.label ?? module.name;

  return (
    <Page>
      <header className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 mb-1 text-sm text-muted">
            <Link to="/modules" className="text-accent no-underline hover:underline">
              Modules
            </Link>
            <span aria-hidden="true"> / </span>
            <Link
              to={`/modules/${moduleId}`}
              className="text-accent no-underline hover:underline"
            >
              {label}
            </Link>
            <span aria-hidden="true"> / </span>
            <span>Debug</span>
          </p>
          {!DebugPageComponent ? (
            <>
              <h2 className="m-0 text-2xl font-bold tracking-tight">
                {label} debug
              </h2>
              <p className="m-0 mt-1.5 max-w-xl text-sm text-muted">
                Background job runs and step detail for this module.
              </p>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <ButtonLink variant="secondary" to={`/modules/${moduleId}`}>
            Module data
          </ButtonLink>
        </div>
      </header>

      {DebugPageComponent ? (
        <DebugPageComponent />
      ) : (
        <Card>
          <Hint>This module has no debug UI registered.</Hint>
        </Card>
      )}
    </Page>
  );
}
