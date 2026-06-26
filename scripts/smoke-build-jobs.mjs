import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";

const stateDir = await mkdtemp("/private/tmp/pwh-build-jobs-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "state.json");
delete process.env.PWH_SITE_AGENTS_ENABLED;

const {
  addSource,
  createKnowledgeBase,
  enqueueRun,
  getBuildJobState,
  getQuotaState
} = await import("../apps/studio/lib/server/store.ts");

const userId = `build_jobs_smoke_${Date.now()}`;
const base = createKnowledgeBase(userId, {
  name: "Build Job Wiki",
  description: "Verifies queued build jobs, logs, quota, and run completion."
});

await addSource({
  userId,
  baseId: base.id,
  title: "Build Queue Notes",
  content: "A site build should run as a queued job, emit logs, and create a versioned website artifact."
});

const queued = await enqueueRun(userId, {
  title: "Queued Personal Site",
  prompt: "Create a concise personal website from the selected wiki.",
  audience: "alpha testers",
  desiredArtifact: "site",
  knowledgeBaseId: base.id,
  knowledgeBaseName: base.name,
  constraints: ["Use only the selected knowledge base."]
});

assert.ok(queued.job.status === "queued" || queued.job.status === "running");
assert.ok(queued.logs.some((event) => event.phase === "queued"));

const completed = await waitForJob(userId, queued.job.id);
assert.equal(completed.job.status, "completed");
assert.equal(completed.run?.state, "versioned");
assert.ok(completed.run?.buildVersion?.id);
assert.ok((completed.run?.observabilityEvents?.length ?? 0) > 0);
assert.ok(completed.logs.some((event) => event.data?.eventTypes));
assert.ok(completed.logs.some((event) => event.phase === "version"));

const quota = getQuotaState(userId);
assert.equal(quota.usage.buildsToday, 1);
assert.ok(quota.usage.costUnitsToday > 0);

console.log(
  JSON.stringify(
    {
      stateDir,
      jobId: completed.job.id,
      runId: completed.run?.id,
      versionId: completed.run?.buildVersion?.id,
      logCount: completed.logs.length,
      observabilityEvents: completed.run?.observabilityEvents?.length ?? 0,
      costUnitsToday: quota.usage.costUnitsToday
    },
    null,
    2
  )
);

async function waitForJob(userId, jobId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = getBuildJobState(userId, jobId);
    if (state.job.status === "completed" || state.job.status === "failed") return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for build job.");
}
