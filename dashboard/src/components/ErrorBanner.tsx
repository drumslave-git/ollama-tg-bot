import { describeApiError, isApiError } from "../api";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

interface ErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

export function ErrorBanner({
  error,
  onRetry,
  onDismiss,
  compact = false,
}: ErrorBannerProps) {
  const { title, message, hint } = describeApiError(error);
  const status = isApiError(error) ? error.status : undefined;
  const path = isApiError(error) ? error.path : undefined;

  return (
    <div
      className={cn(
        "mb-5 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-danger/35 bg-danger/10",
        compact ? "mb-3 px-3.5 py-3 text-sm" : "px-4 py-4",
      )}
      role="alert"
    >
      <div className="min-w-[200px] flex-1">
        <strong
          className={cn(
            "mb-1.5 block text-danger",
            compact ? "text-sm" : "text-[0.95rem]",
          )}
        >
          {title}
        </strong>
        <p className="m-0 mb-1.5 leading-snug text-text">{message}</p>
        {(status || path) && (
          <p className="m-0 mb-1.5 font-mono text-xs text-muted">
            {path}
            {status ? ` · HTTP ${status}` : ""}
          </p>
        )}
        {hint ? (
          <p className="m-0 mt-2 text-sm text-muted">{hint}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-2">
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        {onDismiss ? (
          <Button variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}
