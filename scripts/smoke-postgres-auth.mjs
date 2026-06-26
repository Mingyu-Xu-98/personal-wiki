import assert from "node:assert/strict";
import pg from "pg";

process.env.DATABASE_URL ??= "postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const email = `pg-smoke-${Date.now()}@personal.wiki`;
  const userId = `pg_smoke_${Date.now()}`;
  await pool.query(
    `insert into users (id, email, name, role, password_hash, created_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    [userId, email, "Postgres Smoke", "user", "scrypt:smoke:hash", new Date().toISOString()]
  );

  const result = await pool.query(
    "select id, email, name, role from users where email = $1 limit 1",
    [email]
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].email, email);

  console.log(
    JSON.stringify(
      {
        database: new URL(process.env.DATABASE_URL).pathname.slice(1),
        insertedUserId: result.rows[0].id,
        insertedEmail: result.rows[0].email
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
