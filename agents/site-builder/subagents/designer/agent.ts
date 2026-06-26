import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "site-builder/designer",
  name: "Designer",
  model: "router/design",
  description: "Creates visual direction and section-level design decisions.",
  permissions: ["read_wiki"],
  tools: ["read_content_model"],
  subagents: []
};
