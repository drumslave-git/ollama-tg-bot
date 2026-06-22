import { describe, expect, it } from "vitest";
import type { PipelineModuleHost } from "../../src/contracts/index.js";
import { buildWorkflowDefinitionFromHosts } from "../../src/pipeline/workflow-definition.js";

const manifests = new Map([
  ["history", { name: "History", description: "Chat history module" }],
  ["completions", { name: "Completions", description: "Main reply" }],
  ["sticker-selection", { name: "Stickers", description: "Sticker pick" }],
]);

const fixtureIntakeHosts: PipelineModuleHost[] = [
  {
    id: "history",
    stepId: "intake",
    alwaysOn: true,
    run: async () => ({
      status: "ok",
      phaseId: "intake",
      phaseTitle: "Turn setup",
      summary: "ok",
    }),
  },
  {
    id: "addressing-detection",
    stepId: "address",
    alwaysOn: true,
    run: async () => ({
      status: "ok",
      phaseId: "address",
      phaseTitle: "Address check",
      summary: "ok",
    }),
  },
];

const fixtureQueueHosts: PipelineModuleHost[] = [
  {
    id: "sticker-selection",
    stepId: "sticker",
    run: async () => ({
      status: "ok",
      phaseId: "sticker",
      phaseTitle: "Sticker",
      summary: "ok",
    }),
  },
  {
    id: "completions",
    stepId: "completions",
    alwaysOn: true,
    run: async () => ({
      status: "ok",
      phaseId: "completions",
      phaseTitle: "Main reply",
      summary: "ok",
    }),
  },
];

describe("buildWorkflowDefinitionFromHosts", () => {
  it("includes intake, queue, and background nodes", () => {
    const definition = buildWorkflowDefinitionFromHosts(
      fixtureIntakeHosts,
      fixtureQueueHosts,
      manifests,
      ["sticker"],
    );

    expect(definition.nodes.some((node) => node.stepId === "message")).toBe(true);
    expect(definition.nodes.some((node) => node.stepId === "queue")).toBe(true);
    expect(definition.nodes.some((node) => node.stepId === "delivery")).toBe(true);
    expect(definition.nodes.some((node) => node.stepId === "memory-job")).toBe(
      true,
    );
    expect(
      definition.nodes.some((node) => node.stepId === "vision-backfill"),
    ).toBe(true);
    expect(definition.nodes.some((node) => node.stepId === "completions")).toBe(
      true,
    );
  });

  it("marks optional queue modules by enabled state", () => {
    const enabled = buildWorkflowDefinitionFromHosts(
      fixtureIntakeHosts,
      fixtureQueueHosts,
      manifests,
      ["sticker"],
    );
    const disabled = buildWorkflowDefinitionFromHosts(
      fixtureIntakeHosts,
      fixtureQueueHosts,
      manifests,
      [],
    );

    expect(
      enabled.nodes.find((node) => node.stepId === "sticker")?.enabled,
    ).toBe(true);
    expect(
      disabled.nodes.find((node) => node.stepId === "sticker")?.enabled,
    ).toBe(false);
    expect(
      enabled.nodes.find((node) => node.stepId === "completions")?.alwaysOn,
    ).toBe(true);
  });

  it("chains intake, branches, queue, and side-effect edges", () => {
    const definition = buildWorkflowDefinitionFromHosts(
      fixtureIntakeHosts,
      fixtureQueueHosts,
      manifests,
      ["sticker"],
    );

    expect(
      definition.edges.some(
        (edge) =>
          edge.source === "message" &&
          edge.target === "maintenance" &&
          edge.style === "primary",
      ),
    ).toBe(true);
    expect(
      definition.edges.some(
        (edge) => edge.target === "not-addressed" && edge.style === "branch",
      ),
    ).toBe(true);
    expect(
      definition.edges.some(
        (edge) => edge.source === "queue" && edge.style === "primary",
      ),
    ).toBe(true);
    expect(
      definition.edges.some(
        (edge) =>
          edge.source === "delivery" &&
          edge.target === "memory-job" &&
          edge.style === "side",
      ),
    ).toBe(true);
  });
});
