import { useState } from "react";
import { useDashboard } from "@llm-tg-bot/dashboard/context/DashboardContext";
import { GeneralMemoriesPanel } from "./GeneralMemoriesPanel";
import { MemoriesPanel, type MemoryKind } from "./MemoriesPanel";
import { MemoryJobConfigSection } from "./MemoryJobConfigSection";

type TabKind = MemoryKind | "general";

export function MemoriesPage() {
  const { apiOnline } = useDashboard();
  const [kind, setKind] = useState<TabKind>("user");

  return (
    <div className="page">
      <div className="memories-tabs" role="tablist" aria-label="Memory type">
        <button
          type="button"
          role="tab"
          aria-selected={kind === "user"}
          className={kind === "user" ? "memories-tab active" : "memories-tab"}
          onClick={() => setKind("user")}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "group"}
          className={kind === "group" ? "memories-tab active" : "memories-tab"}
          onClick={() => setKind("group")}
        >
          Groups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "general"}
          className={
            kind === "general" ? "memories-tab active" : "memories-tab"
          }
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
