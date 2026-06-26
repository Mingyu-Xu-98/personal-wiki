import type { AgentDefinition } from "../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "intent-analyst",
  name: "Intent Analyst",
  model: "router/reasoning",
  description: "Turns user goals into structured build intent.",
  permissions: ["read_wiki"],
  tools: ["read_user_history", "update_build_intent"],
  subagents: [],
};
