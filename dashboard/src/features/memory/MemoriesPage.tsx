import { useState } from "react";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { ButtonLink } from "@llm-tg-bot/dashboard/components/ui/Button";
import { GeneralMemoriesPanel } from "./GeneralMemoriesPanel";
import { MemoriesPanel, type MemoryKind } from "./MemoriesPanel";

type TabKind = MemoryKind | "general";

const tabClass = (active: boolean) =>
  `cursor-pointer rounded-sm border px-3.5 py-1.5 font-inherit ${
    active
      ? "border-accent bg-accent/10 text-text"
      : "border-border bg-transparent text-muted hover:border-muted hover:text-text"
  }`;

export function MemoriesPage() {
  const { apiOnline } = useDashboard();
  const [kind, setKind] = useState<TabKind>("user");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Memory</h2>
          <p className="m-0 max-w-xl text-[0.92rem] text-muted">
            View and edit stored facts per user, group, and globally. Background
            maintenance is configured under Settings.
          </p>
        </div>
        <ButtonLink variant="secondary" to="/memory/debug">
          Job debug
        </ButtonLink>
      </header>

      <div
        className="mb-3 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Memory type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={kind === "user"}
          className={tabClass(kind === "user")}
          onClick={() => setKind("user")}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "group"}
          className={tabClass(kind === "group")}
          onClick={() => setKind("group")}
        >
          Groups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "general"}
          className={tabClass(kind === "general")}
          onClick={() => setKind("general")}
        >
          General
        </button>
      </div>
      {kind === "general" ? (
        <GeneralMemoriesPanel apiOnline={apiOnline === true} embedded />
      ) : (
        <MemoriesPanel apiOnline={apiOnline === true} kind={kind} embedded />
      )}
    </div>
  );
}
