import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  api,
  type WorkflowDefinition,
  type WorkflowNodeKind,
} from "../api";
import { useDashboard } from "../context/DashboardContext";
import { layoutWorkflowNodes } from "../workflowLayout";

type WorkflowNodeData = {
  label: string;
  sublabel?: string;
  kind: WorkflowNodeKind;
  enabled: boolean;
};

type WorkflowNode = Node<WorkflowNodeData, "workflow">;

function WorkflowNode({ data }: NodeProps<WorkflowNode>) {
  const isEnabled = data.enabled;
  return (
    <div
      className={`workflow-node workflow-node--${data.kind} ${!isEnabled ? "workflow-node--disabled" : ""}`}
    >
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

function buildFlowGraph(
  definition: WorkflowDefinition,
  savedNodes: { id: string; x: number; y: number }[],
  useAutoLayoutOnly = false,
): { nodes: WorkflowNode[]; edges: Edge[] } {
  const positions = layoutWorkflowNodes(
    definition,
    useAutoLayoutOnly ? [] : savedNodes,
  );

  const nodes: WorkflowNode[] = definition.nodes.map((spec) => {
    const position = positions.get(spec.stepId) ?? { x: 0, y: 0 };

    return {
      id: spec.stepId,
      type: "workflow",
      position,
      data: {
        label: spec.label,
        sublabel: spec.sublabel,
        kind: spec.kind,
        enabled: spec.enabled,
      },
    };
  });

  const nodeEnabled = (stepId: string) =>
    definition.nodes.find((node) => node.stepId === stepId)?.enabled ?? true;

  const edges: Edge[] = definition.edges.map((edge) => {
    const active =
      edge.style === "primary" &&
      nodeEnabled(edge.source) &&
      nodeEnabled(edge.target);

    const baseStyle =
      edge.style === "branch" || edge.style === "side"
        ? { stroke: "var(--border)", strokeDasharray: "6 4", opacity: 0.55 }
        : undefined;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: active,
      style: active ? undefined : baseStyle,
    };
  });

  return { nodes, edges };
}

export function WorkflowPage() {
  const {
    draft,
    setDraft,
    saving,
    configBlocked,
    save,
    settings,
  } = useDashboard();

  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const loadWorkflow = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await api.getWorkflow();
      setDefinition(next);
    } catch (err) {
      setLoadError(err);
      setDefinition(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow, settings?.workflowSteps]);

  useEffect(() => {
    if (!definition) return;
    const savedNodes = draft?.workflowNodes ?? settings?.workflowNodes ?? [];
    const graph = buildFlowGraph(definition, savedNodes);
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [definition, draft?.workflowNodes, settings?.workflowNodes]);

  const onNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    setNodes((current) => applyNodeChanges(changes, current) as WorkflowNode[]);
  }, []);

  const onNodeDragStop = useCallback(() => {
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      const updatedNodes = nodes.map((node) => ({
        id: node.id,
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      }));
      return {
        ...currentDraft,
        workflowNodes: updatedNodes,
      };
    });
  }, [setDraft, nodes]);

  const resetLayout = useCallback(() => {
    if (!definition) return;
    const graph = buildFlowGraph(definition, [], true);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      return {
        ...currentDraft,
        workflowNodes: graph.nodes.map((node) => ({
          id: node.id,
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        })),
      };
    });
  }, [definition, setDraft]);

  const aboutItems = useMemo(
    () =>
      definition?.nodes.map((node) => ({
        stepId: node.stepId,
        label: node.label,
        sublabel: node.sublabel,
        enabled: node.enabled,
        optional: !node.alwaysOn,
      })) ?? [],
    [definition],
  );

  if (loading && !definition) {
    return (
      <div className="page">
        <section className="card">
          <p className="hint">Loading workflow…</p>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page">
        <section className="card">
          <p className="error">Could not load workflow definition.</p>
          <button type="button" onClick={() => void loadWorkflow()}>
            Retry
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page workflow-page">
      <header className="page-header">
        <h2>Workflow</h2>
        <p className="page-desc">
          Live view of the message pipeline discovered from loaded modules. The
          diagram updates automatically when pipeline hosts change.
        </p>
      </header>

      <div className="workflow-legend">
        <span className="legend-item legend-item--input">Input / Output</span>
        <span className="legend-item legend-item--decision">Decision</span>
        <span className="legend-item legend-item--optional">Optional module</span>
        <span className="legend-item legend-item--process">Process</span>
        <span className="legend-item legend-item--llm">LLM</span>
        <span className="legend-item legend-item--side">Side effect</span>
      </div>

      <div className="workflow-canvas" style={{ height: "720px" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={!configBlocked}
          nodesConnectable={false}
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
        <div className="actions">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !draft || configBlocked}
          >
            {saving ? "Saving…" : "Save layout"}
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
            onClick={resetLayout}
            disabled={configBlocked || !definition}
          >
            Auto layout
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void loadWorkflow()}
          >
            Refresh pipeline
          </button>
        </div>
      </section>

      <details className="workflow-details" style={{ marginTop: "2rem" }}>
        <summary>About this pipeline</summary>
        <ol>
          {aboutItems.map((item) => (
            <li key={item.stepId}>
              <strong>{item.label}</strong>
              {item.optional ? " — optional module" : null}
              {!item.enabled ? " — disabled in settings" : null}
              {item.sublabel ? <> — {item.sublabel}</> : null}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
