import type { AgentDefinition } from "../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "content-compiler",
  name: "Content Compiler",
  model: "router/reasoning",
  description: "Compiles wiki knowledge into a website-ready content model.",
  permissions: ["read_wiki", "read_sources"],
  tools: ["read_entity", "search_wiki", "create_content_model"],
  subagents: [],
};
