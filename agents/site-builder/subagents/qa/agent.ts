import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "site-builder/qa",
  name: "QA",
  model: "router/reasoning",
  description: "Validates artifacts against intent, content fidelity, accessibility, and responsive behavior.",
  permissions: ["read_wiki", "run_sandbox", "request_approval"],
  tools: ["run_build", "request_approval"],
  subagents: []
};
