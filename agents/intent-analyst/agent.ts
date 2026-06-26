import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "intent-analyst",
  name: "Intent Analyst",
  model: "router/reasoning",
  description: "Turns user goals into structured build intent.",
  permissions: ["read_wiki"],
  tools: ["read_user_history", "update_build_intent"],
  subagents: []
};
