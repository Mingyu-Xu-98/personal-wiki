import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);

process.env.DATABASE_URL ??= "postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh";
process.env.PWH_AUTH_STORE = "postgres";
process.env.PWH_STUDIO_STORE = "postgres";
process.env.PWH_KNOWLEDGE_STORE = "postgres";
process.env.PWH_BUILD_STORE = "postgres";
delete process.env.PWH_SITE_AGENTS_ENABLED;

const stateDir = await mkdtemp("/private/tmp/pwh-postgres-hydrate-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "writer-state.json");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const userId = `pg_hydrate_${Date.now()}`;
const email = `${userId}@personal.wiki`;

try {
  await pool.query(
    `insert into users (id, email, name, role, password_hash, created_at)
     values ($1, $2, $3, 'user', 'scrypt:smoke:hash', now())
     on conflict (id) do nothing`,
    [userId, email, "Postgres Hydrate Smoke"]
  );

  const {
    addSource,
    createKnowledgeBase,
    enqueueRun,
    getBuildJobState,
    prepareStudioState,
    publishRunToSite
  } = await import("../apps/studio/lib/server/store.ts");

  await prepareStudioState(userId);
  const base = createKnowledgeBase(userId, {
    name: "Postgres Hydrate Wiki",
    description: "Verifies Studio can restore runtime state from PostgreSQL after a fresh process starts."
  });

  await addSource({
    userId,
    baseId: base.id,
    title: "Hydration Notes",
    content: "A rebuilt Studio process should recover the selected wiki, build run, version, publication, logs, and usage."
  });

  const queued = await enqueueRun(userId, {
    title: "Hydrated Runtime Site",
    prompt: "Create a site and persist the complete runtime state.",
    audience: "alpha testers",
    desiredArtifact: "site",
    knowledgeBaseId: base.id,
    knowledgeBaseName: base.name,
    constraints: ["Recover this state from PostgreSQL after restart."]
  });

  const completed = await waitForJob(getBuildJobState, userId, queued.job.id);
  assert.equal(completed.job.status, "completed");
  assert.ok(completed.run?.buildVersion?.id);

  const publication = publishRunToSite(userId, completed.run.id);
  await waitForPublication(userId, publication.versionId);

  const restored = await runFreshHydrationProcess({
    userId,
    baseId: base.id,
    jobId: queued.job.id,
    runId: completed.run.id,
    versionId: completed.run.buildVersion.id,
    stateDir
  });

  assert.equal(restored.activeBaseId, base.id);
  assert.ok(restored.sourceCount >= 1);
  assert.ok(restored.runCount >= 1);
  assert.ok(restored.jobCount >= 1);
  assert.ok(restored.logCount >= 1);
  assert.ok(restored.publishedCount >= 1);
  assert.ok(restored.costUnitsToday > 0);

  console.log(
    JSON.stringify(
      {
        database: new URL(process.env.DATABASE_URL).pathname.slice(1),
        userId,
        knowledgeBaseId: base.id,
        jobId: queued.job.id,
        runId: completed.run.id,
        versionId: completed.run.buildVersion.id,
        publicationId: publication.id,
        restored
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}

async function waitForJob(getBuildJobState, userId, jobId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = getBuildJobState(userId, jobId);
    if (state.job.status === "completed" || state.job.status === "failed") return state;
    await sleep(75);
  }
  throw new Error("Timed out waiting for build job.");
}

async function waitForPublication(userId, versionId) {
  const scopedVersionId = `${userId}:${versionId}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await pool.query(
      "select count(*)::int as count from published_sites where user_id = $1 and version_id = $2",
      [userId, scopedVersionId]
    );
    if (result.rows[0]?.count > 0) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for publication mirror.");
}

async function runFreshHydrationProcess(input) {
  const readerStatePath = path.join(input.stateDir, "reader-state.json");
  const code = `
    process.env.DATABASE_URL = ${JSON.stringify(process.env.DATABASE_URL)};
    process.env.PWH_AUTH_STORE = "postgres";
    process.env.PWH_STUDIO_STORE = "postgres";
    process.env.PWH_KNOWLEDGE_STORE = "postgres";
    process.env.PWH_BUILD_STORE = "postgres";
    process.env.PWH_STUDIO_STATE_PATH = ${JSON.stringify(readerStatePath)};
    delete process.env.PWH_SITE_AGENTS_ENABLED;

    const {
      getBuildJobState,
      getBuildJobs,
      getKnowledge,
      getQuotaState,
      getRuns,
      getSiteState,
      prepareStudioState
    } = await import("./apps/studio/lib/server/store.ts");

    await prepareStudioState(${JSON.stringify(input.userId)});
    const knowledge = getKnowledge(${JSON.stringify(input.userId)}, ${JSON.stringify(input.baseId)});
    const jobState = getBuildJobState(${JSON.stringify(input.userId)}, ${JSON.stringify(input.jobId)});
    const site = getSiteState(${JSON.stringify(input.userId)});
    const quota = getQuotaState(${JSON.stringify(input.userId)});

    console.log(JSON.stringify({
      activeBaseId: knowledge.activeBase.id,
      sourceCount: knowledge.sources.length,
      pageCount: knowledge.pages.length,
      entityCount: knowledge.entities.length,
      runCount: getRuns(${JSON.stringify(input.userId)}).length,
      jobCount: getBuildJobs(${JSON.stringify(input.userId)}).length,
      restoredRunId: jobState.run?.id,
      restoredVersionId: jobState.run?.buildVersion?.id,
      logCount: jobState.logs.length,
      publishedCount: site.publishedVersions.length,
      costUnitsToday: quota.usage.costUnitsToday
    }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: path.resolve("."),
    env: process.env
  });
  return JSON.parse(stdout.trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
