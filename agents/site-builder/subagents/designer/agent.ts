import type { AgentDefinition } from "../../../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "site-builder/designer",
  name: "Designer",
  model: "router/design",
  description: "Creates visual direction and section-level design decisions.",
  permissions: ["read_wiki"],
  tools: ["read_content_model"],
  subagents: [],
};
