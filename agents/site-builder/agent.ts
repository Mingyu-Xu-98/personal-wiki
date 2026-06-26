import type { AgentDefinition } from "../../runtime/index.js";

export const agent: AgentDefinition = {
  id: "site-builder",
  name: "Site Builder",
  model: "router/code",
  description: "Builds versioned site artifacts from a site plan.",
  permissions: ["read_wiki", "write_artifacts", "run_sandbox", "request_approval"],
  tools: ["read_content_model", "write_site_file", "run_build", "request_approval"],
  subagents: ["designer", "coder", "qa"],
};
