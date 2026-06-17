import { useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeProps,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDashboard } from "../context/DashboardContext";

type WorkflowNodeData = { label: string; sublabel?: string; phase: string; enabled?: boolean };
type WorkflowNode = Node<WorkflowNodeData, "workflow">;

function WorkflowNode({ data }: NodeProps<WorkflowNode>) {
  const isEnabled = data.enabled !== false;
  return (
    <div className={`workflow-node workflow-node--${data.phase} ${!isEnabled ? "workflow-node--disabled" : ""}`}>
      <div className="workflow-node-label">{data.label}</div>
      {data.sublabel ? (
        <div className="workflow-node-sublabel">{data.sublabel}</div>
      ) : null}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { workflow: WorkflowNode };

const DEFAULT_WORKFLOW_NODES = [
  { id: "message", x: 240, y: 0 },
  { id: "maintenance", x: 240, y: 110 },
  { id: "address", x: 240, y: 220 },
  { id: "mood", x: 240, y: 330 },
  { id: "link-fetch", x: 240, y: 440 },
  { id: "search", x: 240, y: 550 },
  { id: "build", x: 240, y: 660 },
  { id: "llm", x: 240, y: 770 },
  { id: "parse", x: 240, y: 880 },
  { id: "reply", x: 240, y: 990 },
  { id: "history", x: 480, y: 770 },
  { id: "memory", x: 480, y: 880 },
  { id: "sticker", x: 480, y: 990 },
];

const DEFAULT_WORKFLOW_EDGES = [
  { id: "e-message-maintenance", source: "message", target: "maintenance" },
  { id: "e-maintenance-address", source: "maintenance", target: "address" },
  { id: "e-address-mood", source: "address", target: "mood" },
  { id: "e-mood-link", source: "mood", target: "link-fetch" },
  { id: "e-link-search", source: "link-fetch", target: "search" },
  { id: "e-search-build", source: "search", target: "build" },
  { id: "e-build-llm", source: "build", target: "llm" },
  { id: "e-llm-parse", source: "llm", target: "parse" },
  { id: "e-parse-reply", source: "parse", target: "reply" },
  { id: "e-llm-history", source: "llm", target: "history" },
  { id: "e-history-memory", source: "history", target: "memory" },
  { id: "e-parse-sticker", source: "parse", target: "sticker" },
];

export function WorkflowPage() {
  const {
    settings,
    draft,
    setDraft,
    saving,
    configBlocked,
    save,
  } = useDashboard();

  const toggleStep = (stepId: string) => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const current = currentDraft.workflowSteps || [];
      const next = current.includes(stepId)
        ? current.filter((s) => s !== stepId)
        : [...current, stepId];
      return { ...currentDraft, workflowSteps: next };
    });
  };

  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!draft) return;
    const enabledSteps = draft.workflowSteps || [];
    const stepEnabled = (stepId: string) => enabledSteps.includes(stepId);

    const getPosition = (id: string, defaultPos: { x: number; y: number }) => {
      const saved = draft.workflowNodes?.find((n) => n.id === id);
      return saved ? { x: saved.x, y: saved.y } : defaultPos;
    };

    const nextNodes: WorkflowNode[] = [
      {
        id: "message",
        type: "workflow",
        position: getPosition("message", { x: 240, y: 0 }),
        data: { label: "MESSAGE", sublabel: "Telegram update", phase: "input", enabled: true },
      },
      {
        id: "maintenance",
        type: "workflow",
        position: getPosition("maintenance", { x: 240, y: 110 }),
        data: {
          label: "Maintenance Gate",
          sublabel: "Drop unless owner (@mention in groups)",
          phase: "decision",
          enabled: true,
        },
      },
      {
        id: "address",
        type: "workflow",
        position: getPosition("address", { x: 240, y: 220 }),
        data: {
          label: "Address Check",
          sublabel: "@mention / reply / name match",
          phase: "decision",
          enabled: true,
        },
      },
      {
        id: "mood",
        type: "workflow",
        position: getPosition("mood", { x: 240, y: 330 }),
        data: {
          label: "Mood Evaluation",
          sublabel: "LLM mood analyzer",
          phase: "optional",
          enabled: stepEnabled("mood"),
        },
      },
      {
        id: "link-fetch",
        type: "workflow",
        position: getPosition("link-fetch", { x: 240, y: 440 }),
        data: {
          label: "Link Fetch",
          sublabel: "Playwright page scrape",
          phase: "optional",
          enabled: stepEnabled("links"),
        },
      },
      {
        id: "search",
        type: "workflow",
        position: getPosition("search", { x: 240, y: 550 }),
        data: {
          label: "Tavily Search",
          sublabel: "Web search when relevant",
          phase: "optional",
          enabled: stepEnabled("search"),
        },
      },
      {
        id: "build",
        type: "workflow",
        position: getPosition("build", { x: 240, y: 660 }),
        data: {
          label: "Build Messages",
          sublabel: "System prompt + history + context",
          phase: "process",
          enabled: true,
        },
      },
      {
        id: "llm",
        type: "workflow",
        position: getPosition("llm", { x: 240, y: 770 }),
        data: {
          label: "LLM Chat",
          sublabel: "/v1/chat/completions",
          phase: "llm",
          enabled: true,
        },
      },
      {
        id: "parse",
        type: "workflow",
        position: getPosition("parse", { x: 240, y: 880 }),
        data: {
          label: "Parse Response",
          sublabel: 'Extract {"reply":"…"} JSON',
          phase: "process",
          enabled: true,
        },
      },
      {
        id: "reply",
        type: "workflow",
        position: getPosition("reply", { x: 240, y: 990 }),
        data: { label: "Reply", sublabel: "Telegram message", phase: "output", enabled: true },
      },
      {
        id: "history",
        type: "workflow",
        position: getPosition("history", { x: 480, y: 770 }),
        data: {
          label: "History Record",
          sublabel: "SQLite / passive group",
          phase: "side",
          enabled: true,
        },
      },
      {
        id: "memory",
        type: "workflow",
        position: getPosition("memory", { x: 480, y: 880 }),
        data: {
          label: "Memory Extract",
          sublabel: "Background LLM pass",
          phase: "side",
          enabled: true,
        },
      },
      {
        id: "sticker",
        type: "workflow",
        position: getPosition("sticker", { x: 480, y: 990 }),
        data: {
          label: "Sticker Analysis",
          sublabel: "Telegram sticker reply",
          phase: "optional",
          enabled: stepEnabled("sticker"),
        },
      },
    ];

    const savedEdges = draft.workflowEdges && draft.workflowEdges.length > 0
      ? draft.workflowEdges
      : DEFAULT_WORKFLOW_EDGES;

    const nextEdges = savedEdges.map((e) => {
      const isStepEnabled = (stepId: string) => {
        if (stepId === "mood") return enabledSteps.includes("mood");
        if (stepId === "link-fetch") return enabledSteps.includes("links");
        if (stepId === "search") return enabledSteps.includes("search");
        if (stepId === "sticker") return enabledSteps.includes("sticker");
        return true;
      };

      const animated = isStepEnabled(e.source) && isStepEnabled(e.target);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated,
        style: !animated ? { stroke: "var(--border)", opacity: 0.25 } : undefined,
      };
    });

    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [draft?.workflowSteps, draft?.workflowNodes, draft?.workflowEdges]);

  const onNodesChange = useCallback((changes: any[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as WorkflowNode[]);
  }, []);

  const onNodeDragStop = useCallback((_event: any, _node: any) => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const updatedNodes = nodes.map((n) => ({
        id: n.id,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
      }));
      return {
        ...currentDraft,
        workflowNodes: updatedNodes,
      };
    });
  }, [setDraft, nodes]);

  const onEdgesChange = useCallback((changes: any[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));

    const hasRemoval = changes.some((c) => c.type === "remove");
    if (hasRemoval) {
      const removedIds = changes.filter((c) => c.type === "remove").map((c) => c.id);
      setDraft((currentDraft) => {
        if (!currentDraft) return currentDraft;
        const currentEdges = currentDraft.workflowEdges && currentDraft.workflowEdges.length > 0 
          ? currentDraft.workflowEdges 
          : DEFAULT_WORKFLOW_EDGES;
        const nextEdges = currentEdges.filter((e) => !removedIds.includes(e.id));
        return {
          ...currentDraft,
          workflowEdges: nextEdges,
        };
      });
    }
  }, [setDraft]);

  const onConnect = useCallback((connection: any) => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const currentEdges = currentDraft.workflowEdges && currentDraft.workflowEdges.length > 0 
        ? currentDraft.workflowEdges 
        : DEFAULT_WORKFLOW_EDGES;

      // Check if edge already exists
      const exists = currentEdges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (exists) return currentDraft;

      const newEdge = {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
      };

      return {
        ...currentDraft,
        workflowEdges: [...currentEdges, newEdge],
      };
    });
  }, [setDraft]);

  const resetToDefaultLayout = useCallback(() => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      return {
        ...currentDraft,
        workflowNodes: DEFAULT_WORKFLOW_NODES,
        workflowEdges: DEFAULT_WORKFLOW_EDGES,
      };
    });
  }, [setDraft]);

  if (!draft) {
    return (
      <div className="page">
        <section className="card">
          <p className="hint">Loading settings...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page workflow-page">
      <header className="page-header">
        <h2>Workflow</h2>
        <p className="page-desc">
          Message processing pipeline from Telegram to LLM and back. Configure active modules directly.
        </p>
      </header>

      <div className="workflow-legend">
        <span className="legend-item legend-item--input">Input / Output</span>
        <span className="legend-item legend-item--decision">Decision</span>
        <span className="legend-item legend-item--optional">Optional</span>
        <span className="legend-item legend-item--process">Process</span>
        <span className="legend-item legend-item--llm">LLM</span>
        <span className="legend-item legend-item--side">Side effect</span>
      </div>

      <div className="workflow-canvas" style={{ height: "640px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
        >
          <Background color="var(--border)" gap={20} size={1} />
          <Controls showInteractive={true} />
        </ReactFlow>
      </div>

      <section className="card" style={{ marginTop: "2rem" }}>
        <h3 className="section-title">Configure Pipeline Steps</h3>
        <p className="hint" style={{ marginBottom: "1.5rem" }}>
          Enable or disable modular workflow steps. Disabled steps are automatically bypassed during chat turn evaluation.
        </p>
        <fieldset disabled={configBlocked} className="form-fieldset" style={{ border: "none", padding: 0 }}>
          <div className="field toggle-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.workflowSteps?.includes("mood") ?? false}
                onChange={() => toggleStep("mood")}
              />
              Mood Evaluation
            </label>
            <p className="hint">
              Analyze chat context to decay or update bot's emotional state.
            </p>
          </div>

          <div className="field toggle-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.workflowSteps?.includes("links") ?? false}
                onChange={() => toggleStep("links")}
              />
              Link Fetching
            </label>
            <p className="hint">
              Extract URLs and scrape web pages using Playwright.
            </p>
          </div>

          <div className="field toggle-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.workflowSteps?.includes("search") ?? false}
                onChange={() => toggleStep("search")}
              />
              Tavily Web Search
            </label>
            <p className="hint">
              Query the web when system detects information gaps.
            </p>
          </div>

          <div className="field toggle-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.workflowSteps?.includes("sticker") ?? false}
                onChange={() => toggleStep("sticker")}
              />
              Sticker Replies
            </label>
            <p className="hint">
              Roll a chance to send context-relevant Telegram stickers.
            </p>
          </div>

          <div className="actions" style={{ marginTop: "2rem" }}>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft || configBlocked}
            >
              {saving ? "Saving…" : "Save workflow"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => settings && setDraft(settings)}
              disabled={!settings}
            >
              Reset
            </button>
            <button
              type="button"
              className="secondary"
              onClick={resetToDefaultLayout}
              disabled={configBlocked}
            >
              Reset layout & connections
            </button>
          </div>
        </fieldset>
      </section>

      <details className="workflow-details" style={{ marginTop: "2rem" }}>
        <summary>About this pipeline</summary>
        <ol>
          <li>
            <strong>MESSAGE</strong> — A Telegram update arrives via webhook or
            polling.
          </li>
          <li>
            <strong>Maintenance Gate</strong> — If{" "}
            <code>maintenanceModeEnabled</code> is on, only the owner can
            proceed; in groups the owner must also include a direct @mention of
            the bot.
          </li>
          <li>
            <strong>Address Check</strong> — In groups, the bot checks for
            @mention, reply, or name match. In private chat, all messages are
            accepted.
          </li>
          <li>
            <strong>Mood Evaluation</strong> — (Optional) Evaluates the current emotional state, decaying the mood value over time.
          </li>
          <li>
            <strong>Link Fetch</strong> — (Optional) If the message contains URLs,
            Playwright scrapes page content for context.
          </li>
          <li>
            <strong>Tavily Search</strong> — (Optional) An LLM side-pass decides if web
            search results would help the reply.
          </li>
          <li>
            <strong>Build Messages</strong> — Assembles the system prompt, chat
            history, reply context, and group speaker wrapping.
          </li>
          <li>
            <strong>LLM Chat</strong> — Sends the assembled messages to the
            OpenAI-compatible API and receives the response.
          </li>
          <li>
            <strong>Parse Response</strong> — Parses the JSON reply object from
            model output and strips chain-of-thought.
          </li>
          <li>
            <strong>Reply</strong> — The parsed response is sent back to
            Telegram.
          </li>
          <li>
            <strong>History Record</strong> — The exchange is saved to SQLite
            chat history.
          </li>
          <li>
            <strong>Memory Extract</strong> — A background LLM pass extracts
            facts into per-user, per-group, or general memory.
          </li>
          <li>
            <strong>Sticker Replies</strong> — (Optional) An LLM pass decides if the response should include a Telegram sticker.
          </li>
        </ol>
      </details>
    </div>
  );
}
