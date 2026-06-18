import { useEffect, useState } from "react";
import { api, type DashboardModuleSummary } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { getModuleUi } from "../moduleUiRegistry";
import { ButtonLink } from "../components/ui/Button";
import { Card, Hint, LoadingState, Page, PageHeader } from "../components/ui/Layout";

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
      <Page>
        <LoadingState>Loading modules…</LoadingState>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Modules"
        description={
          <>
            Feature packages discovered from the project{" "}
            <code className="font-mono text-[0.85em]">modules/</code> folder.
            Each module can expose server logic, database tables, and dashboard
            UI via its manifest.
          </>
        }
      />

      {error != null ? (
        <ErrorBanner error={error} compact onRetry={() => window.location.reload()} />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {modules.map((module) => (
          <Card key={module.id} className="flex flex-col gap-3">
            <h3 className="m-0 text-base font-semibold text-text">
              {module.dashboard?.label ?? module.name}
            </h3>
            <Hint className="mt-0">{module.description}</Hint>
            <dl className="m-0 grid gap-2">
              <div className="grid grid-cols-[5rem_1fr] items-baseline gap-2">
                <dt className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
                  ID
                </dt>
                <dd className="m-0 text-sm">
                  <code className="font-mono text-[0.88em]">{module.id}</code>
                </dd>
              </div>
              {module.apiBasePath ? (
                <div className="grid grid-cols-[5rem_1fr] items-baseline gap-2">
                  <dt className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
                    API
                  </dt>
                  <dd className="m-0 text-sm">
                    <code className="font-mono text-[0.88em]">
                      {module.apiBasePath}
                    </code>
                  </dd>
                </div>
              ) : null}
              {module.dataTables.length > 0 ? (
                <div className="grid grid-cols-[5rem_1fr] items-baseline gap-2">
                  <dt className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
                    Tables
                  </dt>
                  <dd className="m-0 text-sm">{module.dataTables.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
            {module.hasUi ? (
              <div className="flex flex-wrap gap-2">
                <ButtonLink to={`/modules/${module.id}`}>Open module</ButtonLink>
                {getModuleUi(module.id)?.DebugPage ? (
                  <ButtonLink variant="secondary" to={`/modules/${module.id}/debug`}>
                    Job debug
                  </ButtonLink>
                ) : null}
              </div>
            ) : (
              <Hint className="m-0">No dashboard UI for this module.</Hint>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
