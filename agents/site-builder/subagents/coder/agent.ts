import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "site-builder/coder",
  name: "Coder",
  model: "router/code",
  description: "Writes site files from approved plans.",
  permissions: ["write_artifacts", "run_sandbox"],
  tools: ["write_site_file", "run_build"],
  subagents: []
};
