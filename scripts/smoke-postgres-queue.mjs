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
process.env.PWH_BUILD_QUEUE = "postgres";
delete process.env.PWH_SITE_AGENTS_ENABLED;

const stateDir = await mkdtemp("/private/tmp/pwh-postgres-queue-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "writer-state.json");

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const userId = `pg_queue_${Date.now()}`;
const email = `${userId}@personal.wiki`;

try {
  await pool.query(
    `insert into users (id, email, name, role, password_hash, created_at)
     values ($1, $2, $3, 'user', 'scrypt:smoke:hash', now())
     on conflict (id) do nothing`,
    [userId, email, "Postgres Queue Smoke"]
  );

  const { addSource, createKnowledgeBase, prepareStudioState } =
    await import("../apps/studio/lib/server/store.ts");

  await prepareStudioState(userId);
  const base = createKnowledgeBase(userId, {
    name: "Postgres Queue Recovery Wiki",
    description: "Verifies interrupted build jobs can be recovered from PostgreSQL."
  });

  await addSource({
    userId,
    baseId: base.id,
    title: "Queue Recovery Notes",
    content: "A stale running job should be requeued and completed by a fresh Studio process."
  });

  const jobId = `pg_queue_job_${Date.now()}`;
  const createdAt = new Date().toISOString();
  const intent = {
    title: "Recovered Queue Site",
    prompt: "Recover this stale running job and build a site.",
    audience: "alpha testers",
    desiredArtifact: "site",
    knowledgeBaseId: base.id,
    knowledgeBaseName: base.name,
    constraints: ["This job must be recoverable from PostgreSQL."]
  };

  await pool.query(
    `insert into build_jobs (
       id, user_id, knowledge_base_id, kind, status, intent, attempt, queue_position, created_at, updated_at, started_at
     )
     values ($1, $2, $3, 'site-build', 'running', $4::jsonb, 1, 0, $5, $5, $5)`,
    [jobId, userId, base.id, JSON.stringify(intent), createdAt]
  );

  const restored = await runFreshQueueProcess({ userId, baseId: base.id, jobId, stateDir });
  assert.equal(restored.jobStatus, "completed");
  assert.ok(restored.attempt >= 2);
  assert.ok(restored.runId);
  assert.ok(restored.versionId);
  assert.ok(restored.recoveryLogFound);

  console.log(
    JSON.stringify(
      {
        database: new URL(process.env.DATABASE_URL).pathname.slice(1),
        userId,
        knowledgeBaseId: base.id,
        jobId,
        restored
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}

async function runFreshQueueProcess(input) {
  const readerStatePath = path.join(input.stateDir, "reader-state.json");
  const code = `
    process.env.DATABASE_URL = ${JSON.stringify(process.env.DATABASE_URL)};
    process.env.PWH_AUTH_STORE = "postgres";
    process.env.PWH_STUDIO_STORE = "postgres";
    process.env.PWH_KNOWLEDGE_STORE = "postgres";
    process.env.PWH_BUILD_STORE = "postgres";
    process.env.PWH_BUILD_QUEUE = "postgres";
    process.env.PWH_STUDIO_STATE_PATH = ${JSON.stringify(readerStatePath)};
    delete process.env.PWH_SITE_AGENTS_ENABLED;

    const { getBuildJobState, prepareStudioState } = await import("./apps/studio/lib/server/store.ts");
    await prepareStudioState(${JSON.stringify(input.userId)});

    let state;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      state = getBuildJobState(${JSON.stringify(input.userId)}, ${JSON.stringify(input.jobId)});
      if (state.job.status === "completed" || state.job.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }

    console.log(JSON.stringify({
      jobStatus: state?.job.status,
      attempt: state?.job.attempt,
      runId: state?.run?.id,
      versionId: state?.run?.buildVersion?.id,
      logCount: state?.logs.length ?? 0,
      recoveryLogFound: Boolean(state?.logs.some((event) => event.message.includes("恢复并重新排队")))
    }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: path.resolve("."),
    env: process.env
  });
  return JSON.parse(stdout.trim());
}
