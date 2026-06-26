import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "commander",
  name: "Commander",
  model: "router/reasoning",
  description: "Owns the durable website build workflow across wiki, content, planning, building, approval, validation, and versioning.",
  permissions: ["read_sources", "read_wiki", "write_wiki", "write_artifacts", "run_sandbox", "request_approval", "deploy_preview"],
  tools: [
    "ingest_sources",
    "create_content_model",
    "create_site_plan",
    "read_content_model",
    "render_site_artifacts",
    "request_approval",
    "run_build"
  ],
  subagents: ["wiki-curator", "content-compiler", "site-planner", "site-builder", "editor"]
};
