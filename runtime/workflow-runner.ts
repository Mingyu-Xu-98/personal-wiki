import type { BuildIntent, BuildVersion, HarnessRun } from "../domain/index.js";
import type { LoadedAgent } from "./types.js";
import { TraceRecorder } from "./trace-recorder.js";
import { ToolRegistry } from "./tool-registry.js";

export interface WorkflowResult {
  run: HarnessRun;
  trace: ReturnType<TraceRecorder["all"]>;
}

export async function runSiteBuildWorkflow(agent: LoadedAgent, intent: BuildIntent): Promise<WorkflowResult> {
  const now = new Date().toISOString();
  const recorder = new TraceRecorder();
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
      notes: [`Loaded agent ${agent.definition.id}`],
    },
    toolTrace: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };

  const turn = recorder.start("ai.eve.turn", {
    agent: agent.definition.id,
    intent: intent.goal,
  });

  const model = recorder.start("ai.streamText", {
    model: agent.definition.model,
    instructionsLength: agent.instructions.length,
  }, turn.id);

  recorder.end(model, {
    note: "Demo workflow uses deterministic output instead of an external model call.",
  });

  const toolRegistry = new ToolRegistry();
  toolRegistry.register({
    name: "read_content_model",
    description: "Read the content model selected for this site build.",
    permissions: ["read_wiki"],
    execute: async () => "Demo content model: technical portfolio for recruiter audience.",
  });

  const toolSpan = recorder.start("ai.toolCall", {
    tool: "read_content_model",
  }, turn.id);
  const toolRecord = await toolRegistry.call("read_content_model", { intentId: intent.id }, run);
  run.toolTrace.push(toolRecord);
  recorder.end(toolSpan, toolRecord);

  const version: BuildVersion = {
    id: crypto.randomUUID(),
    runId: run.id,
    artifactPath: `workspace/artifacts/${run.id}`,
    summary: `Created a site artifact plan for ${intent.audience}.`,
    usedEntityIds: [],
    usedSourceIds: [],
    createdAt: new Date().toISOString(),
  };

  run.versions.push(version);
  run.context.visibleArtifacts.push(version.artifactPath);
  run.currentStep = "complete";
  run.status = "completed";
  run.updatedAt = new Date().toISOString();

  recorder.end(turn, {
    status: run.status,
    versionId: version.id,
  });

  return { run, trace: recorder.all() };
}
