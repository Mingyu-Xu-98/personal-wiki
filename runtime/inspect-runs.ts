import fs from "node:fs/promises";
import path from "node:path";
import type { HarnessRun } from "../domain/index.js";
import type { ApprovalRequest, TraceSpan } from "./types.js";

const runsRoot = path.join(process.cwd(), "workspace/runs");
let runIds: string[] = [];
try {
  const entries = await fs.readdir(runsRoot, { withFileTypes: true });
  runIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
} catch {
  runIds = [];
}

const summaries = [];
for (const runId of runIds) {
  const runDir = path.join(runsRoot, runId);
  const run = JSON.parse(await fs.readFile(path.join(runDir, "run.json"), "utf8")) as HarnessRun;
  const trace = JSON.parse(await fs.readFile(path.join(runDir, "trace.json"), "utf8")) as TraceSpan[];
  const approvals = JSON.parse(await fs.readFile(path.join(runDir, "approvals.json"), "utf8")) as ApprovalRequest[];

  summaries.push({
    id: run.id,
    status: run.status,
    step: run.currentStep,
    versions: run.versions.length,
    toolCalls: run.toolTrace.length,
    approvals: approvals.map((approval) => approval.status),
    traceSpans: trace.length,
    updatedAt: run.updatedAt,
  });
}

console.log(JSON.stringify(summaries, null, 2));
