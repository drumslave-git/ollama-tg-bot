import { useState } from "react";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { GeneralMemoriesPanel } from "./GeneralMemoriesPanel";
import { MemoriesPanel, type MemoryKind } from "./MemoriesPanel";
import { MemoryJobConfigSection } from "./MemoryJobConfigSection";

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
      <MemoryJobConfigSection apiOnline={apiOnline === true} />
      {kind === "general" ? (
        <GeneralMemoriesPanel apiOnline={apiOnline === true} embedded />
      ) : (
        <MemoriesPanel apiOnline={apiOnline === true} kind={kind} embedded />
      )}
    </div>
  );
}
