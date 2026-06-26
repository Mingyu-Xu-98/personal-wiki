import type { FileSystemAgentDefinition } from "@personal-wiki-harness/agent-runtime";

export const agent: FileSystemAgentDefinition = {
  id: "wiki-curator",
  name: "Wiki Curator",
  model: "router/knowledge",
  description: "Maintains the personal wiki as durable memory.",
  permissions: ["read_sources", "read_wiki", "write_wiki", "request_approval"],
  tools: ["read_source", "write_wiki_page", "detect_conflicts"],
  subagents: []
};
