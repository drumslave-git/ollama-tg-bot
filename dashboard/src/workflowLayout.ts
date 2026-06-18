import type { WorkflowDefinition } from "./api";

const MAIN_X = 80;
const BRANCH_X = 400;
const SIDE_X = 400;
const Y_STEP = 120;

export function computeWorkflowLayout(
  definition: WorkflowDefinition,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeIds = new Set(definition.nodes.map((node) => node.stepId));

  const primaryNext = new Map<string, string>();
  for (const edge of definition.edges) {
    if (edge.style === "primary") {
      primaryNext.set(edge.source, edge.target);
    }
  }

  const spine: string[] = [];
  let current: string | undefined = "message";
  const visited = new Set<string>();

  while (current && nodeIds.has(current) && !visited.has(current)) {
    visited.add(current);
    spine.push(current);

    const next = primaryNext.get(current);
    if (next) {
      current = next;
      continue;
    }

    const queueBranch = definition.edges.find(
      (edge) => edge.source === current && edge.target === "queue",
    );
    current = queueBranch?.target;
  }

  spine.forEach((stepId, index) => {
    positions.set(stepId, { x: MAIN_X, y: index * Y_STEP });
  });

  const branchEdge = definition.edges.find(
    (edge) => edge.target === "not-addressed",
  );
  if (branchEdge) {
    const sourcePos = positions.get(branchEdge.source);
    if (sourcePos) {
      positions.set("not-addressed", { x: BRANCH_X, y: sourcePos.y });
    }
  }

  const sideTargets = definition.edges
    .filter((edge) => edge.style === "side" && edge.source === "delivery")
    .map((edge) => edge.target);

  const deliveryPos = positions.get("delivery");
  if (deliveryPos) {
    sideTargets.forEach((stepId, index) => {
      positions.set(stepId, {
        x: SIDE_X,
        y: deliveryPos.y + index * Y_STEP,
      });
    });
  }

  let fallbackY = spine.length * Y_STEP;
  for (const node of definition.nodes) {
    if (positions.has(node.stepId)) continue;
    positions.set(node.stepId, { x: MAIN_X, y: fallbackY });
    fallbackY += Y_STEP;
  }

  return positions;
}

export function shouldUseSavedWorkflowLayout(
  savedNodes: { id: string; x: number; y: number }[],
  definition: WorkflowDefinition,
): boolean {
  if (savedNodes.length === 0) return false;

  const currentIds = new Set(definition.nodes.map((node) => node.stepId));
  const savedIds = new Set(savedNodes.map((node) => node.id));

  for (const id of savedIds) {
    if (!currentIds.has(id)) return false;
  }

  return savedIds.size === currentIds.size;
}

export function layoutWorkflowNodes(
  definition: WorkflowDefinition,
  savedNodes: { id: string; x: number; y: number }[] = [],
): Map<string, { x: number; y: number }> {
  const autoLayout = computeWorkflowLayout(definition);
  if (!shouldUseSavedWorkflowLayout(savedNodes, definition)) {
    return autoLayout;
  }

  const merged = new Map(autoLayout);
  for (const saved of savedNodes) {
    merged.set(saved.id, { x: saved.x, y: saved.y });
  }
  return merged;
}

export { MAIN_X, BRANCH_X, SIDE_X, Y_STEP };
