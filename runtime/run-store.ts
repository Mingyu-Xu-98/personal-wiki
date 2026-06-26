import fs from "node:fs/promises";
import path from "node:path";
import type { HarnessRun } from "../domain/index.js";
import type { ApprovalRequest, TraceSpan } from "./types.js";

export interface RunStorePaths {
  runDir: string;
  runJson: string;
  traceJson: string;
  approvalsJson: string;
}

export class RunStore {
  constructor(private readonly workspaceRoot: string) {}

  paths(runId: string): RunStorePaths {
    const runDir = path.join(this.workspaceRoot, "runs", runId);
    return {
      runDir,
      runJson: path.join(runDir, "run.json"),
      traceJson: path.join(runDir, "trace.json"),
      approvalsJson: path.join(runDir, "approvals.json"),
    };
  }

  async saveRun(run: HarnessRun): Promise<void> {
    const paths = this.paths(run.id);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.runJson, `${JSON.stringify(run, null, 2)}\n`);
  }

  async loadRun(runId: string): Promise<HarnessRun> {
    const json = await fs.readFile(this.paths(runId).runJson, "utf8");
    return JSON.parse(json) as HarnessRun;
  }

  async saveTrace(runId: string, trace: TraceSpan[]): Promise<void> {
    const paths = this.paths(runId);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.traceJson, `${JSON.stringify(trace, null, 2)}\n`);
  }

  async loadTrace(runId: string): Promise<TraceSpan[]> {
    const json = await fs.readFile(this.paths(runId).traceJson, "utf8");
    return JSON.parse(json) as TraceSpan[];
  }

  async saveApprovals(runId: string, approvals: ApprovalRequest[]): Promise<void> {
    const paths = this.paths(runId);
    await fs.mkdir(paths.runDir, { recursive: true });
    await fs.writeFile(paths.approvalsJson, `${JSON.stringify(approvals, null, 2)}\n`);
  }

  async loadApprovals(runId: string): Promise<ApprovalRequest[]> {
    const json = await fs.readFile(this.paths(runId).approvalsJson, "utf8");
    return JSON.parse(json) as ApprovalRequest[];
  }
}
