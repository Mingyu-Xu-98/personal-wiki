import type { AgentDefinition } from "../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "site-planner",
  name: "Site Planner",
  model: "router/design",
  description: "Produces a site plan from intent and content model.",
  permissions: ["read_wiki"],
  tools: ["propose_sections", "map_entities_to_sections"],
  subagents: [],
};
