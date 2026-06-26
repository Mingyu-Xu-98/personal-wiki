import type { HarnessRun } from "../domain/index.js";

export type AgentPermission = "read_wiki" | "write_wiki" | "read_sources" | "write_artifacts" | "run_sandbox" | "request_approval";

export interface AgentDefinition {
  id: string;
  name: string;
  model: string;
  description: string;
  permissions: AgentPermission[];
  tools: string[];
  subagents: string[];
}

export interface LoadedAgent {
  definition: AgentDefinition;
  rootDir: string;
  instructions: string;
  localTools: string[];
  localSkills: string[];
  localEvals: string[];
  validationIssues: AgentValidationIssue[];
}

export interface AgentValidationIssue {
  severity: "warning" | "error";
  message: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  permissions: AgentPermission[];
  execute(input: unknown, run: HarnessRun): Promise<string>;
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  input?: unknown;
  output?: unknown;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "ok" | "error";
}

export interface ApprovalRequest {
  id: string;
  runId: string;
  reason: string;
  artifactPath?: string;
  requestedAt: string;
  resolvedAt?: string;
  status: "pending" | "approved" | "rejected";
}

export interface SandboxResult {
  status: "ok" | "error";
  logs: string[];
  artifactPath?: string;
  checkedFiles: string[];
}
