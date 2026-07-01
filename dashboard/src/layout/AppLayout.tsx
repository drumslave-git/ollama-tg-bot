import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDashboard } from "../context/DashboardContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { Badge, badgeVariant } from "../components/ui/Badge";
import { cn } from "../lib/cn";
import {
  formatCountdown,
  useLiveClock,
} from "../pages/debug/debugUtils";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: null,
    items: [{ to: "/", label: "Overview", end: true }],
  },
  {
    label: "Persona",
    items: [
      { to: "/character", label: "Character" },
      { to: "/mood", label: "Mood" },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/history", label: "History" },
      { to: "/memory", label: "Memory" },
      { to: "/vision", label: "Vision" },
      { to: "/tasks", label: "Tasks" },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings" },
      { to: "/debug", label: "Debug" },
      { to: "/data", label: "Data" },
    ],
  },
];

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

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

  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
      {/* Mobile top bar with hamburger toggle. */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div>
          <h1 className="m-0 text-base font-bold tracking-tight">LLM Bot</h1>
        </div>
        <button
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex items-center justify-center rounded-md border border-border p-2 text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </header>

      <aside
        id="main-nav"
        className={cn(
          "z-30 flex-col gap-6 border-border bg-surface",
          "border-b p-4",
          "md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:overflow-y-auto md:border-b-0 md:border-r md:p-6",
          menuOpen ? "flex" : "hidden md:flex",
        )}
      >
        <div className="hidden md:block">
          <h1 className="m-0 mb-0.5 text-lg font-bold tracking-tight">
            LLM Bot
          </h1>
          <p className="m-0 text-sm text-muted">Dashboard</p>
        </div>

        <nav className="flex flex-col gap-4" aria-label="Main">
          {navSections.map((section) => (
            <div
              key={section.label ?? "main"}
              className={cn(
                "flex flex-col gap-1",
                section.label && "border-t border-border pt-4",
              )}
            >
              {section.label ? (
                <span className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted/80">
                  {section.label}
                </span>
              ) : null}
              {section.items.map(({ to, label, end }) => (
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
            </div>
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
