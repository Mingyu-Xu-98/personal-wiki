import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";

const stateDir = await mkdtemp("/private/tmp/pwh-eve-runtime-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "state.json");
process.env.PWH_EVE_RUNTIME_PATH = path.join(stateDir, "eve-runtime");
delete process.env.PWH_SITE_AGENTS_ENABLED;

const {
  addSource,
  createKnowledgeBase,
  enqueueRun,
  getBuildJobState,
  getDurableRunRecord
} = await import("../apps/studio/lib/server/store.ts");

const userId = `eve_runtime_smoke_${Date.now()}`;
const base = createKnowledgeBase(userId, {
  name: "Eve Runtime Wiki",
  description: "Verifies file-system-first agent directories and durable run traces."
});

await addSource({
  userId,
  baseId: base.id,
  title: "Harness Notes",
  content: "The harness should persist every run as a recoverable workflow with trace spans and sandboxed artifacts."
});

const queued = await enqueueRun(userId, {
  title: "Durable Trace Site",
  prompt: "Create a small website from this wiki and persist an eve-style trace.",
  audience: "builders",
  desiredArtifact: "site",
  knowledgeBaseId: base.id,
  knowledgeBaseName: base.name,
  constraints: ["Persist trace.json", "Validate index.html in sandbox"]
});

const completed = await waitForJob(userId, queued.job.id);
assert.equal(completed.job.status, "completed");
assert.ok(completed.run?.id);

const durable = await getDurableRunRecord(userId, completed.run.id);
assert.ok(durable.trace.some((span) => span.name === "ai.eve.turn"));
assert.ok(durable.trace.some((span) => span.name === "ai.streamText"));
assert.ok(durable.trace.some((span) => span.name === "ai.subagent"));
assert.ok(durable.approvals.some((approval) => approval.status === "approved"));
assert.ok(existsSync(durable.paths.runJson));
assert.ok(existsSync(durable.paths.traceJson));
assert.ok(existsSync(durable.paths.approvalsJson));

const trace = JSON.parse(await readFile(durable.paths.traceJson, "utf8"));
assert.ok(Array.isArray(trace));
assert.ok(trace.length >= durable.trace.length);

console.log(
  JSON.stringify(
    {
      stateDir,
      jobId: completed.job.id,
      runId: completed.run.id,
      tracePath: durable.paths.traceJson,
      approvalCount: durable.approvals.length,
      spanNames: durable.trace.map((span) => span.name)
    },
    null,
    2
  )
);

async function waitForJob(userId, jobId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = getBuildJobState(userId, jobId);
    if (state.job.status === "completed" || state.job.status === "failed") return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for build job.");
}
