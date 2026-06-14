import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type WorkflowNodeData = { label: string; sublabel?: string; phase: string };
type WorkflowNode = Node<WorkflowNodeData, "workflow">;

function WorkflowNode({ data }: NodeProps<WorkflowNode>) {
  return (
    <div className={`workflow-node workflow-node--${data.phase}`}>
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

const initialNodes: WorkflowNode[] = [
  {
    id: "message",
    type: "workflow",
    position: { x: 240, y: 0 },
    data: { label: "MESSAGE", sublabel: "Telegram update", phase: "input" },
  },
  {
    id: "maintenance",
    type: "workflow",
    position: { x: 240, y: 110 },
    data: {
      label: "Maintenance Gate",
      sublabel: "Drop if maintenance mode",
      phase: "decision",
    },
  },
  {
    id: "address",
    type: "workflow",
    position: { x: 240, y: 220 },
    data: {
      label: "Address Check",
      sublabel: "@mention / reply / name match",
      phase: "decision",
    },
  },
  {
    id: "link-fetch",
    type: "workflow",
    position: { x: 240, y: 330 },
    data: {
      label: "Link Fetch",
      sublabel: "Playwright page scrape",
      phase: "optional",
    },
  },
  {
    id: "search",
    type: "workflow",
    position: { x: 240, y: 440 },
    data: {
      label: "Tavily Search",
      sublabel: "Web search when relevant",
      phase: "optional",
    },
  },
  {
    id: "build",
    type: "workflow",
    position: { x: 240, y: 550 },
    data: {
      label: "Build Messages",
      sublabel: "System prompt + history + context",
      phase: "process",
    },
  },
  {
    id: "llm",
    type: "workflow",
    position: { x: 240, y: 660 },
    data: {
      label: "LLM Chat",
      sublabel: "/v1/chat/completions",
      phase: "llm",
    },
  },
  {
    id: "parse",
    type: "workflow",
    position: { x: 240, y: 770 },
    data: {
      label: "Parse Response",
      sublabel: "Extract [REPLY]…[/REPLY]",
      phase: "process",
    },
  },
  {
    id: "reply",
    type: "workflow",
    position: { x: 240, y: 880 },
    data: { label: "REPLY", sublabel: "Telegram message", phase: "output" },
  },
  {
    id: "history",
    type: "workflow",
    position: { x: 480, y: 660 },
    data: {
      label: "History Record",
      sublabel: "SQLite / passive group",
      phase: "side",
    },
  },
  {
    id: "memory",
    type: "workflow",
    position: { x: 480, y: 770 },
    data: {
      label: "Memory Extract",
      sublabel: "Background LLM pass",
      phase: "side",
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e-message-maintenance", source: "message", target: "maintenance", animated: true },
  { id: "e-maintenance-address", source: "maintenance", target: "address", animated: true },
  { id: "e-address-link", source: "address", target: "link-fetch", animated: true },
  { id: "e-link-search", source: "link-fetch", target: "search", animated: true },
  { id: "e-search-build", source: "search", target: "build", animated: true },
  { id: "e-build-llm", source: "build", target: "llm", animated: true },
  { id: "e-llm-parse", source: "llm", target: "parse", animated: true },
  { id: "e-parse-reply", source: "parse", target: "reply", animated: true },
  { id: "e-llm-history", source: "llm", target: "history", animated: true },
  { id: "e-history-memory", source: "history", target: "memory", animated: true },
];

export function WorkflowPage() {
  const nodes = useMemo(() => initialNodes, []);
  const edges = useMemo(() => initialEdges, []);

  return (
    <div className="page workflow-page">
      <header className="page-header">
        <h2>Workflow</h2>
        <p className="page-desc">
          Message processing pipeline from Telegram to LLM and back.
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

      <div className="workflow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background color="var(--border)" gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <details className="workflow-details">
        <summary>About this pipeline</summary>
        <ol>
          <li>
            <strong>MESSAGE</strong> — A Telegram update arrives via webhook or
            polling.
          </li>
          <li>
            <strong>Maintenance Gate</strong> — If{" "}
            <code>maintenanceModeEnabled</code> is on, non-owner messages are
            dropped before any processing.
          </li>
          <li>
            <strong>Address Check</strong> — In groups, the bot checks for
            @mention, reply, or name match. In private chat, all messages are
            accepted.
          </li>
          <li>
            <strong>Link Fetch</strong> — If the message contains URLs,
            Playwright scrapes page content for context.
          </li>
          <li>
            <strong>Tavily Search</strong> — An LLM side-pass decides if web
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
            <strong>Parse Response</strong> — Extracts <code>[REPLY]</code>{" "}
            tags from the model output and strips chain-of-thought.
          </li>
          <li>
            <strong>REPLY</strong> — The parsed response is sent back to
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
        </ol>
      </details>
    </div>
  );
}
