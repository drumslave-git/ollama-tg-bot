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
import { Button } from "../components/ui/Button";
import {
  Actions,
  Card,
  Hint,
  Page,
  PageHeader,
} from "../components/ui/Layout";
import { cn } from "../lib/cn";

type WorkflowNodeData = {
  label: string;
  sublabel?: string;
  kind: WorkflowNodeKind;
  enabled: boolean;
};

type WorkflowNode = Node<WorkflowNodeData, "workflow">;

const workflowNodeKindClasses: Record<
  WorkflowNodeKind,
  { container: string; label: string }
> = {
  input: {
    container: "border-emerald-400 bg-emerald-400/8",
    label: "text-emerald-400",
  },
  output: {
    container: "border-emerald-400 bg-emerald-400/8",
    label: "text-emerald-400",
  },
  decision: {
    container: "border-warning bg-warning/8",
    label: "text-warning",
  },
  optional: {
    container: "border-slate-500 bg-slate-500/8",
    label: "text-slate-400",
  },
  process: {
    container: "border-blue-400 bg-blue-400/8",
    label: "text-blue-400",
  },
  llm: {
    container: "border-violet-400 bg-violet-400/8",
    label: "text-violet-400",
  },
  side: {
    container: "border-pink-400 bg-pink-400/8",
    label: "text-pink-400",
  },
};

const legendItems: {
  kind: WorkflowNodeKind | "input";
  label: string;
  colorClass: string;
}[] = [
  { kind: "input", label: "Input / Output", colorClass: "bg-emerald-400" },
  { kind: "decision", label: "Decision", colorClass: "bg-warning" },
  { kind: "optional", label: "Optional module", colorClass: "bg-slate-500" },
  { kind: "process", label: "Process", colorClass: "bg-blue-400" },
  { kind: "llm", label: "LLM", colorClass: "bg-violet-400" },
  { kind: "side", label: "Side effect", colorClass: "bg-pink-400" },
];

function WorkflowNode({ data }: NodeProps<WorkflowNode>) {
  const kindClasses = workflowNodeKindClasses[data.kind];
  const isEnabled = data.enabled;

  return (
    <div
      className={cn(
        "min-w-[140px] rounded-[10px] border-2 border-border bg-surface px-4 py-2.5 text-center text-sm leading-snug",
        kindClasses.container,
        !isEnabled &&
          "border-dashed border-muted bg-bg opacity-45 [&_.workflow-node-label]:!text-muted [&_.workflow-node-sublabel]:!text-muted",
      )}
    >
      <div className={cn("workflow-node-label text-sm font-bold", kindClasses.label)}>
        {data.label}
      </div>
      {data.sublabel ? (
        <div className="workflow-node-sublabel mt-0.5 text-xs text-muted">
          {data.sublabel}
        </div>
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
      <Page>
        <Card>
          <Hint>Loading workflow…</Hint>
        </Card>
      </Page>
    );
  }

  if (loadError) {
    return (
      <Page>
        <Card>
          <p className="m-0 mb-3 text-danger">
            Could not load workflow definition.
          </p>
          <Button onClick={() => void loadWorkflow()}>Retry</Button>
        </Card>
      </Page>
    );
  }

  return (
    <Page className="gap-4">
      <PageHeader
        title="Workflow"
        description="Live view of the message pipeline. The diagram updates automatically when pipeline hosts change."
      />

      <div className="flex flex-wrap gap-3 text-sm">
        {legendItems.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-muted"
          >
            <span
              className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", item.colorClass)}
              aria-hidden
            />
            {item.label}
          </span>
        ))}
      </div>

      <div className="h-[720px] overflow-hidden rounded-lg border border-border bg-bg">
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

      <Card className="mt-8">
        <Actions className="mt-0">
          <Button
            onClick={() => void save()}
            disabled={saving || !draft || configBlocked}
          >
            {saving ? "Saving…" : "Save layout"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => settings && setDraft(settings)}
            disabled={!settings}
          >
            Reset
          </Button>
          <Button
            variant="secondary"
            onClick={resetLayout}
            disabled={configBlocked || !definition}
          >
            Auto layout
          </Button>
          <Button variant="secondary" onClick={() => void loadWorkflow()}>
            Refresh pipeline
          </Button>
        </Actions>
      </Card>

      <details className="mt-8 text-sm leading-relaxed">
        <summary className="mb-2 cursor-pointer font-semibold text-muted">
          About this pipeline
        </summary>
        <ol className="m-0 list-decimal pl-5 text-muted">
          {aboutItems.map((item) => (
            <li key={item.stepId} className="mb-1">
              <strong className="text-text">{item.label}</strong>
              {item.optional ? " — optional module" : null}
              {!item.enabled ? " — disabled in settings" : null}
              {item.sublabel ? <> — {item.sublabel}</> : null}
            </li>
          ))}
        </ol>
      </details>
    </Page>
  );
}
