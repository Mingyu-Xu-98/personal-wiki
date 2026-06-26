import fs from "node:fs/promises";
import path from "node:path";
import type { HarnessRun } from "../domain/index.js";
import type { TraceSpan } from "./types.js";

export interface AgentEvalCase {
  name: string;
  intent: string;
  expectedTraceSpans: string[];
  expectedArtifact: string;
}

export interface EvalResult {
  name: string;
  status: "passed" | "failed";
  failures: string[];
}

export async function loadAgentEvalCases(agentDir: string): Promise<AgentEvalCase[]> {
  const evalDir = path.join(agentDir, "evals");
  let files: string[];
  try {
    files = await fs.readdir(evalDir);
  } catch {
    return [];
  }

  const cases: AgentEvalCase[] = [];
  for (const file of files.filter((item) => item.endsWith(".json")).sort()) {
    const json = await fs.readFile(path.join(evalDir, file), "utf8");
    cases.push(JSON.parse(json) as AgentEvalCase);
  }
  return cases;
}

export async function evaluateRun(input: {
  run: HarnessRun;
  trace: TraceSpan[];
  cases: AgentEvalCase[];
}): Promise<EvalResult[]> {
  return Promise.all(input.cases.map(async (testCase) => {
    const failures: string[] = [];
    const traceNames = new Set(input.trace.map((span) => span.name));

    for (const expectedSpan of testCase.expectedTraceSpans) {
      if (!traceNames.has(expectedSpan)) failures.push(`Missing trace span: ${expectedSpan}`);
    }

    if (input.run.versions.length === 0) failures.push("No build version was recorded");
    if (!input.run.versions.some((version) => version.validationStatus === "passed")) {
      failures.push("No passed build version was recorded");
    }

    return {
      name: testCase.name,
      status: failures.length === 0 ? "passed" : "failed",
      failures,
    };
  }));
}
