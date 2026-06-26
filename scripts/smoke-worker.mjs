import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";

const stateDir = await mkdtemp("/private/tmp/pwh-worker-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "state.json");
process.env.PWH_PUBLISHED_SITE_PATH = path.join(stateDir, "published-sites");
process.env.PWH_BUILD_WORKER_MODE = "external";
delete process.env.DATABASE_URL;
delete process.env.PWH_SITE_AGENTS_ENABLED;
delete process.env.PWH_WIKI_CURATOR_ENABLED;

const {
  addSource,
  createKnowledgeBase,
  enqueueRun,
  getBuildJobState,
  runBuildWorkerOnce
} = await import("../apps/studio/lib/server/store.ts");

const userId = `worker_smoke_${Date.now()}`;
const base = createKnowledgeBase(userId, {
  name: "Worker Smoke Wiki",
  description: "Verifies queued jobs can be processed by the standalone worker."
});

await addSource({
  userId,
  baseId: base.id,
  title: "Worker Notes",
  content: "The build worker should process queued jobs outside the request path."
});

const queued = await enqueueRun(userId, {
  title: "Worker Smoke Site",
  prompt: "Create a small personal website from this wiki.",
  audience: "alpha testers",
  desiredArtifact: "site",
  knowledgeBaseId: base.id,
  knowledgeBaseName: base.name,
  constraints: ["Use only the selected knowledge base."]
});

assert.equal(queued.job.status, "queued");
assert.equal(getBuildJobState(userId, queued.job.id).job.status, "queued");

const processed = await runBuildWorkerOnce();
assert.equal(processed.processed, true);

const completed = getBuildJobState(userId, queued.job.id);
assert.equal(completed.job.status, "completed");
assert.ok(completed.run?.buildVersion?.id);

console.log(
  JSON.stringify(
    {
      stateDir,
      userId,
      jobId: queued.job.id,
      runId: completed.run.id,
      versionId: completed.run.buildVersion.id,
      logCount: completed.logs.length
    },
    null,
    2
  )
);
