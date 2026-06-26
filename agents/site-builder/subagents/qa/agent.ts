import type { AgentDefinition } from "../../../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "site-builder/qa",
  name: "QA",
  model: "router/reasoning",
  description: "Validates artifacts against intent, content fidelity, and accessibility.",
  permissions: ["read_wiki", "run_sandbox", "request_approval"],
  tools: ["run_build", "request_approval"],
  subagents: [],
};
