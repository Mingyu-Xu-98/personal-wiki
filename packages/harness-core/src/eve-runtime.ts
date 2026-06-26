import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { BuildVersion, HarnessRun, ToolCallRecord } from "./types.ts";

const execFileAsync = promisify(execFile);

export type EveTraceSpanStatus = "running" | "ok" | "error";

export type EveTraceSpan = {
  id: string;
  parentId?: string;
  name: string;
  input?: unknown;
  output?: unknown;
  startedAt: string;
  finishedAt?: string;
  status: EveTraceSpanStatus;
};

export type ApprovalRequest = {
  id: string;
  runId: string;
  reason: string;
  artifactPath?: string;
  requestedAt: string;
  resolvedAt?: string;
  status: "pending" | "approved" | "rejected";
};

export type SandboxResult = {
  status: "ok" | "error";
  logs: string[];
  artifactPath?: string;
  checkedFiles: string[];
};

export type DurableRunStorePaths = {
  runDir: string;
  runJson: string;
  traceJson: string;
  approvalsJson: string;
  manifestJson: string;
};

export type EvePrincipal = {
  userId: string;
  email?: string;
  role: "admin" | "builder" | "viewer";
  scopes: string[];
};

export type DeploymentPolicyInput = {
  principal: EvePrincipal;
  run: HarnessRun;
  environment: "preview" | "production";
  approvalStatuses?: ApprovalRequest["status"][];
};

export type DeploymentPolicyDecision = {
  decision: "allow" | "deny" | "review";
  reason: string;
};

export class EveTraceRecorder {
  private readonly spans: EveTraceSpan[];

  constructor(initialSpans: EveTraceSpan[] = []) {
    this.spans = [...initialSpans];
  }

  start(name: string, input?: unknown, parentId?: string): EveTraceSpan {
    const span: EveTraceSpan = {
      id: randomSpanId(name, this.spans.length),
      ...(parentId ? { parentId } : {}),
      name,
      ...(input === undefined ? {} : { input }),
      startedAt: new Date().toISOString(),
      status: "running"
    };
    this.spans.push(span);
    return span;
  }

  end(span: EveTraceSpan, output?: unknown): void {
    if (output !== undefined) span.output = output;
    span.finishedAt = new Date().toISOString();
    span.status = "ok";
  }

  error(span: EveTraceSpan, output?: unknown): void {
    if (output !== undefined) span.output = output;
    span.finishedAt = new Date().toISOString();
    span.status = "error";
  }

  all(): EveTraceSpan[] {
    return structuredClone(this.spans);
  }
}

export class ApprovalGate {
  private readonly approvals: ApprovalRequest[];

  constructor(initialApprovals: ApprovalRequest[] = []) {
    this.approvals = [...initialApprovals];
  }

  request(input: {
    runId: string;
    reason: string;
    artifactPath?: string;
    autoApprove?: boolean;
  }): ApprovalRequest {
    const now = new Date().toISOString();
    const approval: ApprovalRequest = {
      id: stableId("approval", `${input.runId}:${input.reason}:${input.artifactPath ?? ""}`),
      runId: input.runId,
      reason: input.reason,
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
      requestedAt: now,
      ...(input.autoApprove ? { resolvedAt: now } : {}),
      status: input.autoApprove ? "approved" : "pending"
    };
    this.approvals.push(approval);
    return approval;
  }

  approve(id: string): ApprovalRequest {
    const approval = this.approvals.find((item) => item.id === id);
    if (!approval) throw new Error(`Unknown approval: ${id}`);
    approval.status = "approved";
    approval.resolvedAt = new Date().toISOString();
    return approval;
  }

  firstPending(): ApprovalRequest | undefined {
    return this.approvals.find((item) => item.status === "pending");
  }

  all(): ApprovalRequest[] {
    return structuredClone(this.approvals);
  }
}

export class DurableRunStore {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  paths(runId: string): DurableRunStorePaths {
    const runDir = path.join(this.workspaceRoot, "runs", runId);
    return {
      runDir,
      runJson: path.join(runDir, "run.json"),
      traceJson: path.join(runDir, "trace.json"),
      approvalsJson: path.join(runDir, "approvals.json"),
      manifestJson: path.join(runDir, "manifest.json")
    };
  }

  async saveRun(run: HarnessRun): Promise<void> {
    const paths = this.paths(run.id);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.runJson, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  }

  async loadRun(runId: string): Promise<HarnessRun> {
    const json = await fs.readFile(this.paths(runId).runJson, "utf8");
    return JSON.parse(json) as HarnessRun;
  }

  async saveTrace(runId: string, trace: EveTraceSpan[]): Promise<void> {
    const paths = this.paths(runId);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.traceJson, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  }

  async loadTrace(runId: string): Promise<EveTraceSpan[]> {
    const json = await fs.readFile(this.paths(runId).traceJson, "utf8");
    return JSON.parse(json) as EveTraceSpan[];
  }

  async saveApprovals(runId: string, approvals: ApprovalRequest[]): Promise<void> {
    const paths = this.paths(runId);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.approvalsJson, `${JSON.stringify(approvals, null, 2)}\n`, "utf8");
  }

  async loadApprovals(runId: string): Promise<ApprovalRequest[]> {
    const json = await fs.readFile(this.paths(runId).approvalsJson, "utf8");
    return JSON.parse(json) as ApprovalRequest[];
  }

  async saveManifest(runId: string, manifest: Record<string, unknown>): Promise<void> {
    const paths = this.paths(runId);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.manifestJson, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

export class SandboxRunner {
  private readonly workspaceRoot: string;
  private readonly mode: "local" | "docker";

  constructor(
    workspaceRoot: string,
    mode: "local" | "docker" = process.env.SANDBOX_MODE === "docker" ? "docker" : "local"
  ) {
    this.workspaceRoot = workspaceRoot;
    this.mode = mode;
  }

  artifactDir(runId: string): string {
    return path.join(this.workspaceRoot, "artifacts", runId);
  }

  async writeArtifactFiles(runId: string, files: Array<{ path: string; content: string }>): Promise<string> {
    const artifactDir = this.artifactDir(runId);
    for (const file of files.length ? files : [createFallbackArtifactFile(runId)]) {
      const relativePath = cleanRelativePath(file.path);
      const filePath = path.join(artifactDir, relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, "utf8");
    }
    return artifactDir;
  }

  async validate(runId: string, requiredFiles: string[]): Promise<SandboxResult> {
    const artifactDir = this.artifactDir(runId);
    if (this.mode === "docker") return this.validateInDocker(artifactDir, requiredFiles);

    const logs: string[] = [];
    const checkedFiles: string[] = [];
    for (const file of requiredFiles) {
      const relativePath = cleanRelativePath(file);
      const filePath = path.join(artifactDir, relativePath);
      checkedFiles.push(filePath);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) logs.push(`Missing file: ${relativePath}`);
      } catch {
        logs.push(`Missing file: ${relativePath}`);
      }
    }

    return {
      status: logs.length === 0 ? "ok" : "error",
      logs: logs.length === 0 ? ["Artifact validation passed."] : logs,
      artifactPath: artifactDir,
      checkedFiles
    };
  }

  private async validateInDocker(artifactDir: string, requiredFiles: string[]): Promise<SandboxResult> {
    const checkedFiles = requiredFiles.map((file) => path.join(artifactDir, cleanRelativePath(file)));
    const testScript = requiredFiles.map((file) => `test -f /artifact/${shellQuote(cleanRelativePath(file))}`).join(" && ");
    try {
      const { stdout, stderr } = await execFileAsync(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--pids-limit",
          "64",
          "--memory",
          "256m",
          "-v",
          `${path.resolve(artifactDir)}:/artifact:ro`,
          "alpine:3.20",
          "sh",
          "-lc",
          testScript
        ],
        { timeout: 30_000 }
      );
      return {
        status: "ok",
        logs: ["Docker sandbox validation passed.", stdout, stderr].filter(Boolean),
        artifactPath: artifactDir,
        checkedFiles
      };
    } catch (error) {
      return {
        status: "error",
        logs: [error instanceof Error ? error.message : String(error)],
        artifactPath: artifactDir,
        checkedFiles
      };
    }
  }
}

export const createEveTraceFromHarnessRun = (
  run: HarnessRun,
  input: {
    userId?: string;
    jobId?: string;
    agentId?: string;
    model?: string;
  } = {}
): EveTraceSpan[] => {
  const trace = new EveTraceRecorder();
  const root = trace.start("ai.eve.turn", {
    runId: run.id,
    userId: input.userId,
    jobId: input.jobId,
    agent: input.agentId ?? "commander",
    intent: {
      title: run.intent.title,
      desiredArtifact: run.intent.desiredArtifact ?? "site",
      knowledgeBaseId: run.intent.knowledgeBaseId
    }
  });
  const model = trace.start("ai.streamText", {
    model: input.model ?? "studio-routing-policy",
    routing: run.contextLedger?.modelRouting ?? []
  }, root.id);
  trace.end(model, {
    decisions: run.commanderDecisions?.length ?? 0,
    contextPacketIds: run.contextLedger?.commanderDecisionIds ?? []
  });

  for (const subAgent of run.subAgentTraces ?? []) {
    const span = trace.start("ai.subagent", {
      role: subAgent.role,
      packetId: subAgent.packet.id,
      allowedToolNames: subAgent.packet.allowedToolNames ?? []
    }, root.id);
    const output = {
      status: subAgent.status,
      artifactRefs: subAgent.result?.artifactRefs ?? [],
      mustCarryForwardRefs: subAgent.result?.mustCarryForwardRefs ?? [],
      summary: subAgent.result?.summary ?? ""
    };
    subAgent.status === "failed" ? trace.error(span, output) : trace.end(span, output);
  }

  for (const toolCall of run.toolCalls) {
    const span = trace.start("ai.toolCall", {
      toolName: toolCall.toolName,
      input: toolCall.input
    }, root.id);
    toolCall.status === "failed" ? trace.error(span, toolOutput(toolCall)) : trace.end(span, toolOutput(toolCall));
  }

  const versionSpan = trace.start("ai.version", {
    versionId: run.buildVersion?.id,
    state: run.state
  }, root.id);
  if (run.state === "failed") {
    trace.error(versionSpan, { error: run.error ?? "run failed" });
    trace.error(root, { status: run.state, error: run.error ?? "run failed" });
  } else {
    trace.end(versionSpan, {
      lintIssues: run.buildVersion?.lintIssues.length ?? 0,
      files: run.buildVersion?.siteArtifact?.files?.map((file) => file.path) ?? []
    });
    trace.end(root, {
      status: run.state,
      versionId: run.buildVersion?.id,
      eventCount: run.observabilityEvents?.length ?? 0
    });
  }

  return trace.all();
};

export const createAutoApprovalForRun = (run: HarnessRun, artifactPath?: string): ApprovalRequest[] => {
  const gate = new ApprovalGate();
  gate.request({
    runId: run.id,
    reason: "Studio generated and verified this draft before preview/publish.",
    ...(artifactPath ? { artifactPath } : {}),
    autoApprove: run.state === "versioned"
  });
  return gate.all();
};

export const evaluateDeploymentPolicy = (input: DeploymentPolicyInput): DeploymentPolicyDecision => {
  const latest = input.run.buildVersion;
  if (!latest) return { decision: "deny", reason: "run has no build version" };
  if (input.run.state !== "versioned") return { decision: "deny", reason: "run is not versioned" };
  if (latest.lintIssues.some((issue) => issue.severity === "error")) {
    return { decision: "deny", reason: "latest version has blocking lint issues" };
  }

  const hasApprovedGate =
    input.approvalStatuses?.includes("approved") ??
    input.run.observabilityEvents?.some((event) => event.type === "version.created");
  if (!hasApprovedGate) return { decision: "review", reason: "deployment requires an approved checkpoint" };

  if (input.environment === "preview") {
    if (input.principal.role === "viewer") return { decision: "deny", reason: "viewer cannot deploy preview artifacts" };
    return { decision: "allow", reason: "preview deployment allowed after validation" };
  }

  if (
    input.principal.role === "admin" ||
    input.principal.scopes.includes("deploy:production") ||
    input.principal.scopes.includes("*")
  ) {
    return { decision: "allow", reason: "production deployment allowed by role or scope" };
  }

  return { decision: "review", reason: "production deployment requires admin or deploy:production scope" };
};

export const filesFromBuildVersion = (version: BuildVersion | undefined): Array<{ path: string; content: string }> => {
  const files = version?.siteArtifact?.files?.map((file) => ({
    path: file.path,
    content: file.content
  })) ?? [];
  return files.length ? files : [createFallbackArtifactFile(version?.id ?? "draft")];
};

const toolOutput = (toolCall: ToolCallRecord) => ({
  output: toolCall.output,
  status: toolCall.status,
  startedAt: toolCall.startedAt,
  finishedAt: toolCall.finishedAt
});

const createFallbackArtifactFile = (id: string) => ({
  path: "index.html",
  content: `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(id)}</title></head><body><main><h1>${escapeHtml(id)}</h1><p>Generated by Personal Wiki Harness.</p></main></body></html>`
});

const cleanRelativePath = (value: string) => {
  const normalized = path.posix.normalize(value || "index.html").replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe artifact path: ${value}`);
  }
  return normalized;
};

const shellQuote = (input: string): string => {
  if (input.startsWith("/") || input.includes("..") || input.includes("'")) {
    throw new Error(`Unsafe sandbox file path: ${input}`);
  }
  return `'${input}'`;
};

const stableId = (prefix: string, value: string) =>
  `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;

const randomSpanId = (name: string, index: number) => stableId("span", `${Date.now()}:${index}:${name}`);

const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
