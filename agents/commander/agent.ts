import type { AgentDefinition } from "../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "commander",
  name: "Commander",
  model: "router/reasoning",
  description: "Owns the full durable website build workflow across wiki, content, planning, building, approval, and validation.",
  permissions: ["read_sources", "read_wiki", "write_wiki", "write_artifacts", "run_sandbox", "request_approval"],
  tools: [
    "ingest_sources",
    "create_content_model",
    "create_site_plan",
    "read_content_model",
    "render_site_artifacts",
    "request_approval",
    "run_build",
  ],
  subagents: ["wiki-curator", "content-compiler", "site-planner", "site-builder", "editor"],
};
