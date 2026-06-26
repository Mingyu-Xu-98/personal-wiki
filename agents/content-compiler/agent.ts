import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "content-compiler",
  name: "Content Compiler",
  model: "router/reasoning",
  description: "Compiles wiki knowledge into a website-ready content model.",
  permissions: ["read_wiki", "read_sources"],
  tools: ["read_entity", "search_wiki", "create_content_model"],
  subagents: []
};
