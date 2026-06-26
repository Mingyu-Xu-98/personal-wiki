import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "site-planner",
  name: "Site Planner",
  model: "router/design",
  description: "Produces a site plan from intent and content model.",
  permissions: ["read_wiki"],
  tools: ["propose_sections", "map_entities_to_sections"],
  subagents: []
};
