import type {
  PipelineModuleHost,
  PipelinePhase,
} from "@llm-tg-bot/modules-registry";

export const INTAKE_PHASES = ["preprocess", "gate"] as const;

export const QUEUE_STEP_ORDER = [
  "vision",
  "search",
  "system",
  "personality",
  "history",
  "mood",
  "completions",
  "sticker",
  "history-record",
] as const;

export type WorkflowNodeKind =
  | "input"
  | "decision"
  | "optional"
  | "process"
  | "llm"
  | "side"
  | "output";

export type WorkflowStage = "intake" | "queue" | "background";

export interface WorkflowNodeSpec {
  stepId: string;
  moduleId?: string;
  label: string;
  sublabel?: string;
  kind: WorkflowNodeKind;
  stage: WorkflowStage;
  alwaysOn: boolean;
  enabled: boolean;
}

export type WorkflowEdgeStyle = "primary" | "branch" | "side";

export interface WorkflowEdgeSpec {
  id: string;
  source: string;
  target: string;
  style: WorkflowEdgeStyle;
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeSpec[];
  edges: WorkflowEdgeSpec[];
}

const LLM_STEP_IDS = new Set([
  "address",
  "mood",
  "search",
  "completions",
  "vision",
  "sticker",
]);

const HOST_SUBLABELS: Record<string, string> = {
  intake: "Turn setup + memory input",
  "history-intake": "Store every message to SQLite",
  triggers: "Random reply / image reaction",
  address: "@mention, reply, or name match",
  vision: "Describe photos and stickers",
  links: "MCP fetch_link tool during main reply",
  search: "LLM decides + Tavily fetch",
  system: "System prompt + memories",
  personality: "Active personality prompt",
  history: "Inject compressed chat history",
  mood: "Update mood state for reply",
  completions: "Main LLM reply JSON",
  sticker: "Optional sticker after reply",
  "history-record": "Persist user + assistant turn",
};

const BUILTIN_NODES: Omit<
  WorkflowNodeSpec,
  "alwaysOn" | "enabled"
>[] = [
  {
    stepId: "message",
    label: "Message",
    sublabel: "Telegram update",
    kind: "input",
    stage: "intake",
  },
  {
    stepId: "maintenance",
    label: "Maintenance Gate",
    sublabel: "Owner-only when maintenance mode is on",
    kind: "decision",
    stage: "intake",
  },
  {
    stepId: "not-addressed",
    label: "Ignored",
    sublabel: "Not addressed or filtered out",
    kind: "output",
    stage: "intake",
  },
  {
    stepId: "queue",
    label: "Message Queue",
    sublabel: "Addressed turns processed one at a time",
    kind: "process",
    stage: "queue",
  },
  {
    stepId: "delivery",
    label: "Delivery",
    sublabel: "Reply, thinking, and sticker to Telegram",
    kind: "output",
    stage: "queue",
  },
  {
    stepId: "memory-job",
    moduleId: "memory",
    label: "Memory Extract",
    sublabel: "Debounced background LLM pass",
    kind: "side",
    stage: "background",
  },
  {
    stepId: "vision-backfill",
    moduleId: "vision",
    label: "Vision Backfill",
    sublabel: "Replace pending base64 media rows",
    kind: "side",
    stage: "background",
  },
];

function hostsInPhase(
  hosts: PipelineModuleHost[],
  phase: PipelinePhase,
): PipelineModuleHost[] {
  return hosts
    .filter((host) => host.phase === phase)
    .sort((a, b) => a.order - b.order);
}

function isHostEnabled(
  host: PipelineModuleHost,
  enabledSteps: string[],
): boolean {
  if (host.alwaysOn) return true;
  return enabledSteps.includes(host.stepId);
}

function hostKind(
  host: PipelineModuleHost,
  enabled: boolean,
): WorkflowNodeKind {
  if (!host.alwaysOn) return enabled ? "optional" : "optional";
  if (host.phase === "gate") return "decision";
  if (LLM_STEP_IDS.has(host.stepId)) return "llm";
  if (host.phase === "post-reply") return "side";
  return "process";
}

function hostStage(host: PipelineModuleHost): WorkflowStage {
  if (INTAKE_PHASES.includes(host.phase as (typeof INTAKE_PHASES)[number])) {
    return "intake";
  }
  return "queue";
}

function hostLabel(
  host: PipelineModuleHost,
  manifests: Map<string, { name: string; description: string }>,
): string {
  if (host.debugTitle) return host.debugTitle;
  const manifest = manifests.get(host.id);
  if (manifest) return manifest.name;
  return host.stepId;
}

function hostSublabel(
  host: PipelineModuleHost,
  manifests: Map<string, { name: string; description: string }>,
): string {
  return (
    HOST_SUBLABELS[host.stepId] ??
    manifests.get(host.id)?.description ??
    host.phase
  );
}

function hostNode(
  host: PipelineModuleHost,
  enabledSteps: string[],
  manifests: Map<string, { name: string; description: string }>,
): WorkflowNodeSpec {
  const enabled = isHostEnabled(host, enabledSteps);
  return {
    stepId: host.stepId,
    moduleId: host.id,
    label: hostLabel(host, manifests),
    sublabel: hostSublabel(host, manifests),
    kind: hostKind(host, enabled),
    stage: hostStage(host),
    alwaysOn: Boolean(host.alwaysOn),
    enabled,
  };
}

function chainEdges(
  stepIds: string[],
  style: WorkflowEdgeStyle = "primary",
): WorkflowEdgeSpec[] {
  const edges: WorkflowEdgeSpec[] = [];
  for (let i = 0; i < stepIds.length - 1; i += 1) {
    const source = stepIds[i]!;
    const target = stepIds[i + 1]!;
    edges.push({
      id: `e-${source}-${target}`,
      source,
      target,
      style,
    });
  }
  return edges;
}

export function buildWorkflowDefinitionFromHosts(
  hosts: PipelineModuleHost[],
  manifests: Map<string, { name: string; description: string }>,
  enabledSteps: string[],
): WorkflowDefinition {
  const nodes: WorkflowNodeSpec[] = [];
  const edges: WorkflowEdgeSpec[] = [];

  for (const builtin of BUILTIN_NODES) {
    nodes.push({
      ...builtin,
      alwaysOn: true,
      enabled: true,
    });
  }

  const intakeHostIds: string[] = [];
  for (const phase of INTAKE_PHASES) {
    for (const host of hostsInPhase(hosts, phase)) {
      nodes.push(hostNode(host, enabledSteps, manifests));
      intakeHostIds.push(host.stepId);
    }
  }

  const queueHostIds: string[] = [];
  for (const stepId of QUEUE_STEP_ORDER) {
    const host = hosts.find((entry) => entry.stepId === stepId);
    if (!host) continue;
    nodes.push(hostNode(host, enabledSteps, manifests));
    queueHostIds.push(host.stepId);
  }

  const intakeChain = [
    "message",
    "maintenance",
    ...intakeHostIds,
  ];
  edges.push(...chainEdges(intakeChain));

  const lastGateStep = intakeHostIds.at(-1) ?? "maintenance";
  edges.push({
    id: `e-${lastGateStep}-not-addressed`,
    source: lastGateStep,
    target: "not-addressed",
    style: "branch",
  });
  edges.push({
    id: `e-${lastGateStep}-queue`,
    source: lastGateStep,
    target: "queue",
    style: "branch",
  });

  const queueChain = ["queue", ...queueHostIds, "delivery"];
  edges.push(...chainEdges(queueChain));

  edges.push({
    id: "e-delivery-memory-job",
    source: "delivery",
    target: "memory-job",
    style: "side",
  });
  edges.push({
    id: "e-delivery-vision-backfill",
    source: "delivery",
    target: "vision-backfill",
    style: "side",
  });

  return { nodes, edges };
}
