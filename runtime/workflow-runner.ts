import type { BuildIntent, BuildVersion, HarnessRun } from "../domain/index.js";
import type { LoadedAgent } from "./types.js";
import { TraceRecorder } from "./trace-recorder.js";
import type { ToolRegistry } from "./tool-registry.js";
import { RunStore } from "./run-store.js";
import { ApprovalGate } from "./approval-gate.js";
import { SandboxRunner } from "./sandbox-runner.js";
import { createBuiltinTools } from "./builtin-tools.js";
import { createScopedToolRegistry } from "./scoped-tools.js";

export interface WorkflowResult {
  run: HarnessRun;
  trace: ReturnType<TraceRecorder["all"]>;
  approvals: ReturnType<ApprovalGate["all"]>;
  runDir: string;
}

export interface WorkflowOptions {
  workspaceRoot?: string;
  approvalMode?: "auto" | "manual";
}

export async function runSiteBuildWorkflow(agent: LoadedAgent, intent: BuildIntent, options: WorkflowOptions = {}): Promise<WorkflowResult> {
  const workspaceRoot = options.workspaceRoot ?? "workspace";
  const approvalMode = options.approvalMode ?? "auto";
  const now = new Date().toISOString();
  const recorder = new TraceRecorder();
  const store = new RunStore(workspaceRoot);
  const approvalGate = new ApprovalGate();
  const sandbox = new SandboxRunner(workspaceRoot);
  const { registry: toolRegistry, skipped } = createScopedToolRegistry(
    agent,
    createBuiltinTools({ workspaceRoot, approvalGate, sandbox }),
  );

  const run: HarnessRun = {
    id: crypto.randomUUID(),
    intent,
    currentStep: "build_site",
    status: "running",
    context: {
      wikiIndexPaths: ["workspace/wiki/index.md"],
      loadedEntityIds: [],
      loadedSourceRefs: [],
      visibleArtifacts: [],
      notes: [
        `Loaded agent ${agent.definition.id}`,
        `Local tools: ${agent.localTools.join(", ") || "none"}`,
        `Skipped tools: ${skipped.map((tool) => `${tool.name} (${tool.reason})`).join(", ") || "none"}`,
      ],
    },
    toolTrace: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
  await persist(store, run, recorder, approvalGate);

  const turn = recorder.start("ai.eve.turn", {
    agent: agent.definition.id,
    intent: intent.goal,
    tools: toolRegistry.manifest().map((tool) => tool.name),
  });

  const model = recorder.start("ai.streamText", {
    model: agent.definition.model,
    instructionsLength: agent.instructions.length,
  }, turn.id);

  recorder.end(model, {
    note: "Demo workflow uses deterministic output instead of an external model call.",
  });
  await persist(store, run, recorder, approvalGate);

  run.currentStep = "curate_wiki";
  await callTool({
    recorder,
    registry: toolRegistry,
    run,
    parentId: turn.id,
    name: "ingest_sources",
    input: { rawDir: "workspace/raw" },
  });

  run.currentStep = "compile_content";
  await callTool({
    recorder,
    registry: toolRegistry,
    run,
    parentId: turn.id,
    name: "create_content_model",
    input: { intentId: intent.id },
  });

  run.currentStep = "plan_site";
  await callTool({
    recorder,
    registry: toolRegistry,
    run,
    parentId: turn.id,
    name: "create_site_plan",
    input: { contentModel: "workspace/runs/<run-id>/content-model.json" },
  });

  run.currentStep = "build_site";
  await callTool({
    recorder,
    registry: toolRegistry,
    run,
    parentId: turn.id,
    name: "render_site_artifacts",
    input: {
      contentModel: "workspace/runs/<run-id>/content-model.json",
      sitePlan: "workspace/runs/<run-id>/site-plan.json",
    },
  });
  await persist(store, run, recorder, approvalGate);

  const artifactPath = sandbox.artifactDir(run.id);
  run.currentStep = "approval";
  run.status = "awaiting_approval";
  run.updatedAt = new Date().toISOString();
  await callTool({
    recorder,
    registry: toolRegistry,
    run,
    parentId: turn.id,
    name: "request_approval",
    input: {
      reason: "Approve generated site artifact before validation and version capture.",
      artifactPath,
      autoApprove: approvalMode === "auto",
    },
  });
  await persist(store, run, recorder, approvalGate);

  if (approvalMode === "manual") {
    recorder.end(turn, {
      status: run.status,
      note: "Workflow paused for human approval.",
    });
    await persist(store, run, recorder, approvalGate);
    return { run, trace: recorder.all(), approvals: approvalGate.all(), runDir: store.paths(run.id).runDir };
  }

  run.status = "running";
  await persist(store, run, recorder, approvalGate);

  await validateAndVersion({
    recorder,
    registry: toolRegistry,
    run,
    store,
    approvalGate,
    parentId: turn.id,
    artifactPath,
  });

  recorder.end(turn, {
    status: run.status,
    versionId: run.versions.at(-1)?.id,
  });
  await persist(store, run, recorder, approvalGate);

  return { run, trace: recorder.all(), approvals: approvalGate.all(), runDir: store.paths(run.id).runDir };
}

export async function resumeSiteBuildWorkflow(agent: LoadedAgent, runId: string, options: WorkflowOptions = {}): Promise<WorkflowResult> {
  const workspaceRoot = options.workspaceRoot ?? "workspace";
  const store = new RunStore(workspaceRoot);
  const run = await store.loadRun(runId);
  const existingTrace = await store.loadTrace(runId);
  const existingApprovals = await store.loadApprovals(runId);
  const recorder = new TraceRecorder(existingTrace);
  const approvalGate = new ApprovalGate(existingApprovals);
  const sandbox = new SandboxRunner(workspaceRoot);
  const { registry: toolRegistry } = createScopedToolRegistry(
    agent,
    createBuiltinTools({ workspaceRoot, approvalGate, sandbox }),
  );

  if (run.status !== "awaiting_approval") {
    return { run, trace: recorder.all(), approvals: approvalGate.all(), runDir: store.paths(run.id).runDir };
  }

  const pending = approvalGate.firstPending();
  if (!pending) throw new Error(`Run ${run.id} is awaiting approval but has no pending approval`);
  approvalGate.approve(pending.id);
  run.status = "running";
  run.updatedAt = new Date().toISOString();

  const turn = recorder.start("ai.eve.turn.resume", {
    agent: agent.definition.id,
    runId: run.id,
    approved: pending.id,
  });

  await validateAndVersion({
    recorder,
    registry: toolRegistry,
    run,
    store,
    approvalGate,
    parentId: turn.id,
    artifactPath: pending.artifactPath ?? sandbox.artifactDir(run.id),
  });

  recorder.end(turn, {
    status: run.status,
    versionId: run.versions.at(-1)?.id,
  });
  await persist(store, run, recorder, approvalGate);

  return { run, trace: recorder.all(), approvals: approvalGate.all(), runDir: store.paths(run.id).runDir };
}

async function callTool(input: {
  recorder: TraceRecorder;
  registry: ToolRegistry;
  run: HarnessRun;
  parentId: string;
  name: string;
  input: unknown;
  maxAttempts?: number;
}): Promise<void> {
  const span = input.recorder.start("ai.toolCall", {
    tool: input.name,
    input: input.input,
  }, input.parentId);
  const record = await input.registry.call(input.name, input.input, input.run, {
    maxAttempts: input.maxAttempts ?? 2,
  });
  input.run.toolTrace.push(record);
  input.run.updatedAt = new Date().toISOString();
  if (record.status === "ok") input.recorder.end(span, record);
  else input.recorder.error(span, record);
}

async function persist(store: RunStore, run: HarnessRun, recorder: TraceRecorder, approvalGate: ApprovalGate): Promise<void> {
  await store.saveRun(run);
  await store.saveTrace(run.id, recorder.all());
  await store.saveApprovals(run.id, approvalGate.all());
}

async function validateAndVersion(input: {
  recorder: TraceRecorder;
  registry: ToolRegistry;
  run: HarnessRun;
  store: RunStore;
  approvalGate: ApprovalGate;
  parentId: string;
  artifactPath: string;
}): Promise<void> {
  input.run.currentStep = "validate";
  input.run.updatedAt = new Date().toISOString();
  await callTool({
    recorder: input.recorder,
    registry: input.registry,
    run: input.run,
    parentId: input.parentId,
    name: "run_build",
    input: {
      requiredFiles: ["site.md", "index.html"],
    },
  });

  const validationCall = input.run.toolTrace.at(-1);
  const validationStatus = validationCall?.status === "ok" ? "passed" : "failed";
  const version: BuildVersion = {
    id: crypto.randomUUID(),
    runId: input.run.id,
    artifactPath: input.artifactPath,
    summary: `Created a site artifact plan for ${input.run.intent.audience}.`,
    usedEntityIds: [],
    usedSourceIds: [],
    validationStatus,
    createdAt: new Date().toISOString(),
  };

  input.run.versions.push(version);
  if (!input.run.context.visibleArtifacts.includes(version.artifactPath)) {
    input.run.context.visibleArtifacts.push(version.artifactPath);
  }
  input.run.currentStep = validationStatus === "passed" ? "complete" : "repair";
  input.run.status = validationStatus === "passed" ? "completed" : "failed";
  input.run.updatedAt = new Date().toISOString();
  await persist(input.store, input.run, input.recorder, input.approvalGate);
}
