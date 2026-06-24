import { NavLink, Outlet } from "react-router-dom";
import { useDashboard } from "../context/DashboardContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { Badge, badgeVariant } from "../components/ui/Badge";
import { cn } from "../lib/cn";
import {
  formatCountdown,
  useLiveClock,
} from "../pages/debug/debugUtils";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/character", label: "Character", end: false },
  { to: "/history", label: "History", end: false },
  { to: "/memory", label: "Memory", end: false },
  { to: "/mood", label: "Mood", end: false },
  { to: "/tasks", label: "Tasks", end: false },
  { to: "/vision", label: "Vision", end: false },
  { to: "/settings", label: "Settings", end: false },
  { to: "/debug", label: "Debug", end: false },
  { to: "/data", label: "Data", end: false },
  { to: "/workflow", label: "Workflow", end: false },
] as const;

export function AppLayout() {
  const {
    apiOnline,
    stats,
    llmOk,
    tavilyConfigured,
    apiUnreachable,
    sectionErrors,
    saveOk,
    load,
  } = useDashboard();

  const memoryScheduled = stats?.memoryJobStatus === "scheduled";
  const visionScheduled = stats?.visionJobStatus === "scheduled";
  const now = useLiveClock(memoryScheduled || visionScheduled);
  const memoryCountdown = memoryScheduled
    ? formatCountdown(stats?.memoryJobRunAt, now)
    : null;
  const visionCountdown = visionScheduled
    ? formatCountdown(stats?.visionJobRunAt, now)
    : null;

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "z-40 flex shrink-0 flex-col gap-6 border-border bg-surface",
          "sticky top-0 w-full border-b p-4",
          "md:fixed md:inset-y-0 md:left-0 md:w-60 md:overflow-y-auto md:border-b-0 md:border-r md:p-6",
        )}
      >
        <div>
          <h1 className="m-0 mb-0.5 text-lg font-bold tracking-tight">
            LLM Bot
          </h1>
          <p className="m-0 text-sm text-muted">Dashboard</p>
        </div>

        <nav
          className="flex flex-row flex-wrap gap-1 md:flex-col"
          aria-label="Main"
        >
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-sm font-medium text-muted no-underline transition-colors",
                  "hover:bg-surface-hover hover:text-text",
                  isActive && "bg-accent/10 text-accent",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="md:mt-auto md:border-t md:border-border md:pt-4">
          <span className="mb-2.5 block text-[0.72rem] font-semibold uppercase tracking-wider text-muted">
            Status
          </span>
          <div className="flex flex-row flex-wrap gap-2 md:flex-col md:items-start">
            <Badge
              variant={
                apiOnline === true
                  ? "ok"
                  : apiOnline === false
                    ? "danger"
                    : "warn"
              }
            >
              API{" "}
              {apiOnline === true
                ? "online"
                : apiOnline === false
                  ? "offline"
                  : "unknown"}
            </Badge>
            <Badge variant={stats?.botRunning ? "ok" : "warn"}>
              Bot {stats?.botRunning ? "online" : stats ? "offline" : "—"}
            </Badge>
            <Badge variant={badgeVariant(llmOk)}>
              LLM{" "}
              {llmOk === true
                ? "reachable"
                : llmOk === false
                  ? "unreachable"
                  : "—"}
            </Badge>
            <Badge
              variant={
                tavilyConfigured === true
                  ? "ok"
                  : tavilyConfigured === false
                    ? "default"
                    : "warn"
              }
            >
              Tavily{" "}
              {tavilyConfigured === true
                ? "on"
                : tavilyConfigured === false
                  ? "off"
                  : "—"}
            </Badge>
            <Badge>Queue {stats?.queueSize ?? "—"}</Badge>
            <Badge
              variant={
                stats?.memoryJobStatus === "running"
                  ? "ok"
                  : stats?.memoryJobStatus === "scheduled"
                    ? "warn"
                    : "default"
              }
            >
              Memory{" "}
              {stats?.memoryJobStatus === "running"
                ? "extracting"
                : stats?.memoryJobStatus === "scheduled"
                  ? memoryCountdown
                    ? `in ${memoryCountdown}`
                    : "scheduled"
                  : "idle"}
            </Badge>
            <Badge
              variant={
                stats?.visionJobStatus === "running"
                  ? "ok"
                  : stats?.visionJobStatus === "scheduled"
                    ? "warn"
                    : "default"
              }
            >
              Vision{" "}
              {stats?.visionJobStatus === "running"
                ? "backfill"
                : stats?.visionJobStatus === "scheduled"
                  ? visionCountdown
                    ? `in ${visionCountdown}`
                    : "scheduled"
                  : "idle"}
            </Badge>
          </div>
        </div>
      </aside>

      <div className="min-w-0 p-4 md:ml-60 md:p-6 md:pb-10">
        {apiUnreachable ? (
          <ErrorBanner
            error={
              sectionErrors.stats ??
              sectionErrors.settings ??
              new Error("API is not responding")
            }
            onRetry={() => void load()}
          />
        ) : null}

        {saveOk ? (
          <div className="mb-4 rounded-lg border border-accent/35 bg-accent/10 px-4 py-3 text-sm text-accent">
            Saved
          </div>
        ) : null}

        <main className="mx-auto max-w-[820px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
