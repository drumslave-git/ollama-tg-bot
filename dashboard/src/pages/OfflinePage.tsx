import {
  ApiError,
  describeApiError,
  isApiError,
} from "../api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Layout";

interface OfflinePageProps {
  primaryLoadError: unknown;
  onRetry: () => void;
}

function fallbackError(): ApiError {
  return new ApiError({
    kind: "network",
    path: "/api/health",
    message: "Could not connect to the API",
  });
}

export function OfflinePage({ primaryLoadError, onRetry }: OfflinePageProps) {
  const error = primaryLoadError ?? fallbackError();
  const { title, message, hint } = describeApiError(error);
  const status = isApiError(error) ? error.status : undefined;
  const path = isApiError(error) ? error.path : undefined;
  const isNetwork = isApiError(error) && error.kind === "network";

  const badgeLabel = isNetwork ? "API offline" : "Startup error";

  return (
    <div className="mx-auto max-w-[560px] px-6 py-8 pb-12">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-[1.75rem] font-bold tracking-tight">
            OpenAI-compatible Telegram Bot
          </h1>
          <p className="m-0 text-sm text-muted">Dashboard</p>
        </div>
        <Badge variant="danger">{badgeLabel}</Badge>
      </header>
      <Card>
        <h2 className="m-0 mb-3 text-lg font-semibold">{title}</h2>
        <p className="m-0 mb-1.5">{message}</p>
        {(status || path) && (
          <p className="m-0 mb-3 font-mono text-xs text-muted">
            {path}
            {status ? ` · HTTP ${status}` : ""}
          </p>
        )}
        {hint ? (
          <p className="m-0 mb-4 text-sm leading-snug text-muted">{hint}</p>
        ) : null}
        {isNetwork ? (
          <>
            <h3 className="mb-3 mt-5 text-[0.95rem] font-semibold text-text">
              If the server is not running
            </h3>
            <ol className="mb-5 list-decimal pl-5 text-sm text-muted">
              <li className="mb-2">
                Copy <code className="font-mono text-sm text-text">.env.example</code> to{" "}
                <code className="font-mono text-sm text-text">.env</code>
              </li>
              <li className="mb-2">
                Set <code className="font-mono text-sm text-text">BOT_TOKEN</code>,{" "}
                <code className="font-mono text-sm text-text">LLM_BASE_URL</code>, and{" "}
                <code className="font-mono text-sm text-text">DATABASE_URL</code>
              </li>
              <li className="mb-2">
                Run <code className="font-mono text-sm text-text">npm run dev</code> (or{" "}
                <code className="font-mono text-sm text-text">npm run dev -w server</code>{" "}
                in another terminal)
              </li>
            </ol>
            <p className="m-0 mb-4 text-sm leading-snug text-muted">
              In dev the API listens on port 3000 (Vite proxies{" "}
              <code className="font-mono text-sm text-text">/api</code>).{" "}
              <code className="font-mono text-sm text-text">PORT</code> in{" "}
              <code className="font-mono text-sm text-text">.env</code> applies to production
              only.
            </p>
          </>
        ) : (
          <p className="m-0 mb-4 text-sm leading-snug text-muted">
            Fix the issue in the server terminal or{" "}
            <code className="font-mono text-sm text-text">.env</code>, then retry.
          </p>
        )}
        <Button onClick={onRetry}>Retry connection</Button>
      </Card>
    </div>
  );
}
