import assert from "node:assert/strict";
import pg from "pg";

process.env.DATABASE_URL ??= "postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh";
process.env.PWH_KNOWLEDGE_STORE = "postgres";
delete process.env.PWH_SITE_AGENTS_ENABLED;

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const userId = `pg_knowledge_${Date.now()}`;
const email = `${userId}@personal.wiki`;

try {
  await pool.query(
    `insert into users (id, email, name, role, password_hash, created_at)
     values ($1, $2, $3, 'user', 'scrypt:smoke:hash', now())
     on conflict (id) do nothing`,
    [userId, email, "Postgres Knowledge Smoke"]
  );

  const { createKnowledgeBase, addSource, getKnowledge } = await import("../apps/studio/lib/server/store.ts");
  const base = createKnowledgeBase(userId, {
    name: "Postgres Knowledge Smoke Wiki",
    description: "Verifies normalized knowledge mirroring into PostgreSQL."
  });

  await addSource({
    userId,
    baseId: base.id,
    title: "Postgres Knowledge Notes",
    content: "The selected wiki should mirror source documents, pages, entities, and relations into PostgreSQL."
  });
  getKnowledge(userId, base.id);

  const counts = await waitForKnowledgeCounts(base.id);
  assert.ok(counts.bases >= 1);
  assert.ok(counts.sources >= 1);
  assert.ok(counts.pages >= 1);

  console.log(
    JSON.stringify(
      {
        database: new URL(process.env.DATABASE_URL).pathname.slice(1),
        userId,
        knowledgeBaseId: base.id,
        counts
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}

async function waitForKnowledgeCounts(baseId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await pool.query(
      `select
        (select count(*)::int from knowledge_bases where id = $1) as bases,
        (select count(*)::int from source_documents where knowledge_base_id = $1) as sources,
        (select count(*)::int from wiki_pages where knowledge_base_id = $1) as pages,
        (select count(*)::int from wiki_entities where knowledge_base_id = $1) as entities,
        (select count(*)::int from wiki_relations where knowledge_base_id = $1) as relations`,
      [baseId]
    );
    const counts = result.rows[0];
    if (counts?.bases > 0 && counts.sources > 0 && counts.pages > 0) return counts;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for PostgreSQL knowledge mirror.");
}
