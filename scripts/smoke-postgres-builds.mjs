import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

process.env.DATABASE_URL ??= "postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh";
process.env.PWH_KNOWLEDGE_STORE = "postgres";
process.env.PWH_BUILD_STORE = "postgres";
delete process.env.PWH_SITE_AGENTS_ENABLED;

const stateDir = await mkdtemp("/private/tmp/pwh-postgres-builds-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "state.json");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const userId = `pg_builds_${Date.now()}`;
const email = `${userId}@personal.wiki`;

try {
  await pool.query(
    `insert into users (id, email, name, role, password_hash, created_at)
     values ($1, $2, $3, 'user', 'scrypt:smoke:hash', now())
     on conflict (id) do nothing`,
    [userId, email, "Postgres Builds Smoke"]
  );

  const {
    addSource,
    createKnowledgeBase,
    enqueueRun,
    getBuildJobState,
    publishRunToSite
  } = await import("../apps/studio/lib/server/store.ts");

  const base = createKnowledgeBase(userId, {
    name: "Postgres Build Smoke Wiki",
    description: "Verifies build jobs, logs, runs, versions, publishing, and usage ledgers."
  });

  await addSource({
    userId,
    baseId: base.id,
    title: "Build Runtime Notes",
    content: [
      "A production build should be queued, logged, versioned, and publishable.",
      "The selected wiki must stay isolated by knowledge base.",
      "The generated site should include public-facing content and traceable build context."
    ].join("\n")
  });

  const queued = await enqueueRun(userId, {
    title: "Postgres Runtime Smoke Site",
    prompt: "Create a compact personal website from the selected wiki.",
    audience: "alpha testers",
    desiredArtifact: "site",
    knowledgeBaseId: base.id,
    knowledgeBaseName: base.name,
    constraints: ["Use only the selected knowledge base."]
  });

  const completed = await waitForJob(getBuildJobState, userId, queued.job.id);
  assert.equal(completed.job.status, "completed");
  assert.ok(completed.run?.buildVersion?.id);

  const publication = publishRunToSite(userId, completed.run.id);
  assert.equal(publication.status, "published");

  const counts = await waitForBuildCounts(userId, queued.job.id, completed.run.id, completed.run.buildVersion.id);
  assert.ok(counts.buildJobs >= 1);
  assert.ok(counts.buildLogs >= 3);
  assert.ok(counts.harnessRuns >= 1);
  assert.ok(counts.observabilityEvents > 0);
  assert.ok(counts.buildVersions >= 1);
  assert.ok(counts.publishedSites >= 1);
  assert.ok(counts.usageRecords >= 2);

  console.log(
    JSON.stringify(
      {
        database: new URL(process.env.DATABASE_URL).pathname.slice(1),
        userId,
        knowledgeBaseId: base.id,
        jobId: queued.job.id,
        runId: completed.run.id,
        versionId: completed.run.buildVersion.id,
        scopedRunId: `${userId}:${completed.run.id}`,
        scopedVersionId: `${userId}:${completed.run.buildVersion.id}`,
        publicationId: publication.id,
        counts
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

async function waitForBuildCounts(userId, jobId, runId, versionId) {
  const scopedRunId = `${userId}:${runId}`;
  const scopedVersionId = `${userId}:${versionId}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await pool.query(
      `select
        (select count(*)::int from build_jobs where id = $2 and user_id = $1) as "buildJobs",
        (select count(*)::int from build_logs where job_id = $2 and user_id = $1) as "buildLogs",
        (select count(*)::int from harness_runs where id = $3 and user_id = $1) as "harnessRuns",
        (select coalesce(jsonb_array_length(observability_events), 0)::int from harness_runs where id = $3 and user_id = $1) as "observabilityEvents",
        (select count(*)::int from build_versions where id = $4 and user_id = $1) as "buildVersions",
        (select count(*)::int from published_sites where version_id = $4 and user_id = $1) as "publishedSites",
        (select count(*)::int from usage_records where user_id = $1 and kind in ('build', 'publish')) as "usageRecords"`,
      [userId, jobId, scopedRunId, scopedVersionId]
    );
    const counts = result.rows[0];
    if (
      counts?.buildJobs > 0 &&
      counts.buildLogs > 0 &&
      counts.harnessRuns > 0 &&
      counts.observabilityEvents > 0 &&
      counts.buildVersions > 0 &&
      counts.publishedSites > 0 &&
      counts.usageRecords >= 2
    ) {
      return counts;
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for PostgreSQL build runtime mirror.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
