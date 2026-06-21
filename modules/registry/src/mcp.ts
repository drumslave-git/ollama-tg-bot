export interface ModuleMcpToolsMeta {
  /** workflowSteps entry that enables this module's MCP tools (e.g. "links"). */
  workflowStepId: string;
  /** OpenAI tool names exposed when the step is enabled. */
  toolNames: string[];
}
