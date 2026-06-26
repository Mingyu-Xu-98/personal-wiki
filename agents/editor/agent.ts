import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "editor",
  name: "Editor",
  model: "router/reasoning",
  description: "Turns edit requests into change requests, patch plans, and new versions.",
  permissions: ["read_wiki", "write_artifacts", "run_sandbox", "request_approval"],
  tools: ["create_change_request", "apply_patch_plan", "compare_versions"],
  subagents: []
};
