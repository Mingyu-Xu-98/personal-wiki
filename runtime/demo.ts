import path from "node:path";
import { loadAgent } from "./agent-loader.js";
import { resumeSiteBuildWorkflow, runSiteBuildWorkflow } from "./workflow-runner.js";
import { evaluateRun, loadAgentEvalCases } from "./eval-runner.js";
import type { BuildIntent } from "../domain/index.js";

const root = process.cwd();
const agent = await loadAgent(path.join(root, "agents/commander"));

const intent: BuildIntent = {
  id: crypto.randomUUID(),
  audience: "recruiter",
  purpose: "portfolio",
  goal: "Compile a personal wiki into a focused technical portfolio website.",
  constraints: ["Use wiki citations", "Preserve build trace", "Create a versioned artifact"],
  createdAt: new Date().toISOString(),
};

const manualApproval = process.argv.includes("--manual-approval");
const initial = await runSiteBuildWorkflow(agent, intent, {
  approvalMode: manualApproval ? "manual" : "auto",
});
const result = manualApproval && initial.run.status === "awaiting_approval"
  ? await resumeSiteBuildWorkflow(agent, initial.run.id)
  : initial;
const evalCases = await loadAgentEvalCases(path.join(root, "agents/commander"));
const evals = await evaluateRun({
  run: result.run,
  trace: result.trace,
  cases: evalCases,
});

console.log(JSON.stringify({
  agent: result.run.context.notes[0],
  status: result.run.status,
  step: result.run.currentStep,
  versions: result.run.versions.length,
  toolCalls: result.run.toolTrace.map((tool) => tool.name),
  attempts: result.run.toolTrace.map((tool) => ({ name: tool.name, attempts: tool.attempts })),
  approvals: result.approvals.map((approval) => approval.status),
  mode: manualApproval ? "manual-approval-resume" : "auto-approval",
  runDir: result.runDir,
  artifactPath: result.run.versions[0]?.artifactPath,
  evals,
  trace: result.trace.map((span) => ({
    name: span.name,
    parentId: span.parentId,
    status: span.status,
  })),
}, null, 2));
