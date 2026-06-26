#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const command = process.argv[2] || "help";
const dbName = process.env.POSTGRES_DB || "pwh";
const dbUser = process.env.POSTGRES_USER || "pwh";
const port = process.env.PWH_POSTGRES_PORT || "54322";
const password = process.env.POSTGRES_PASSWORD || "pwh_local_dev";
const databaseUrl = `postgresql://${dbUser}:${password}@127.0.0.1:${port}/${dbName}`;
const migrationsDir = path.join("docs", "db", "migrations");

const run = (args, options = {}) => {
  const result = spawnSync("docker", args, {
    stdio: "inherit",
    env: process.env,
    ...options
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("[db] Docker is not installed or is not available on PATH. Install Docker Desktop, then retry.");
      process.exit(1);
    }
    console.error(`[db] ${result.error.message}`);
    process.exit(1);
  }
  if (typeof result.status === "number" && result.status !== 0) process.exit(result.status);
};

const compose = (...args) => run(["compose", ...args]);

const runPsql = (sql) => {
  run(["compose", "exec", "-T", "postgres", "psql", "-U", dbUser, "-d", dbName], {
    input: sql,
    stdio: ["pipe", "inherit", "inherit"]
  });
};

const dollarQuote = (value) => {
  const tag = `pwh_${Math.random().toString(36).slice(2)}`;
  return `$${tag}$${value}$${tag}$`;
};

const readJsonFile = (filePath, fallback) => {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
};

if (command === "up") {
  compose("up", "-d", "postgres");
} else if (command === "down") {
  compose("down");
} else if (command === "reset") {
  compose("down", "-v");
  compose("up", "-d", "postgres");
} else if (command === "logs") {
  compose("logs", "-f", "postgres");
} else if (command === "ps") {
  compose("ps", "postgres");
} else if (command === "psql") {
  compose("exec", "postgres", "psql", "-U", dbUser, "-d", dbName);
} else if (command === "schema") {
  compose("exec", "-T", "postgres", "psql", "-U", dbUser, "-d", dbName, "-f", "/workspace/db/schema.sql");
} else if (command === "migrate") {
  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()
    : [];
  if (!files.length) {
    console.log("[db] No migration files found.");
  }
  for (const file of files) {
    console.log(`[db] Applying ${file}`);
    compose("exec", "-T", "postgres", "psql", "-U", dbUser, "-d", dbName, "-f", `/workspace/db/migrations/${file}`);
  }
} else if (command === "check") {
  runPsql(`
select current_database() as database, current_user as user;
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
`);
} else if (command === "snapshot") {
  const studioPath = process.env.PWH_STUDIO_STATE_PATH || path.join(".pwh-studio", "state.json");
  const authPath = process.env.PWH_STUDIO_AUTH_PATH || path.join(".pwh-studio", "users.json");
  const createdAt = new Date().toISOString();
  const snapshots = [
    {
      id: `studio-store-${Date.now()}`,
      kind: "studio-store",
      payload: readJsonFile(studioPath, { version: 1, users: {} })
    },
    {
      id: `studio-auth-${Date.now()}`,
      kind: "studio-auth",
      payload: readJsonFile(authPath, { version: 1, users: [] })
    }
  ];
  runPsql(`
create table if not exists studio_state_snapshots (
  id text primary key,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_studio_state_snapshots_kind_created
  on studio_state_snapshots(kind, created_at desc);
${snapshots
  .map(
    (snapshot) => `
insert into studio_state_snapshots (id, kind, payload, created_at)
values (${dollarQuote(snapshot.id)}, ${dollarQuote(snapshot.kind)}, ${dollarQuote(JSON.stringify(snapshot.payload))}::jsonb, ${dollarQuote(createdAt)}::timestamptz)
on conflict (id) do nothing;`
  )
  .join("\n")}
select kind, count(*) as snapshots, max(created_at) as latest
from studio_state_snapshots
group by kind
order by kind;
`);
} else if (command === "import-auth") {
  const authPath = process.env.PWH_STUDIO_AUTH_PATH || path.join(".pwh-studio", "users.json");
  const authState = readJsonFile(authPath, { version: 1, users: [] });
  const users = Array.isArray(authState.users) ? authState.users : [];
  if (!users.length) {
    console.log(`[db] No users found in ${authPath}. Start Studio once or keep seed users from runtime auth.`);
  } else {
    runPsql(`
${users
  .filter((user) => user?.id && user.email && user.passwordHash)
  .map(
    (user) => `
insert into users (id, email, name, role, password_hash, created_at)
values (
  ${dollarQuote(String(user.id))},
  ${dollarQuote(String(user.email).toLowerCase())},
  ${dollarQuote(String(user.name || user.email))},
  ${dollarQuote(user.role === "admin" ? "admin" : "user")},
  ${dollarQuote(String(user.passwordHash))},
  ${dollarQuote(String(user.createdAt || new Date().toISOString()))}::timestamptz
)
on conflict (email) do update set
  name = excluded.name,
  role = excluded.role,
  password_hash = excluded.password_hash;`
  )
  .join("\n")}
select id, email, role, created_at
from users
order by created_at asc;
`);
  }
} else if (command === "url") {
  console.log(databaseUrl);
} else {
  console.log(`Personal Wiki Harness database helper

Commands:
  npm run db:up       Start PostgreSQL on 127.0.0.1:${port}
  npm run db:down     Stop PostgreSQL
  npm run db:reset    Delete local database volume and recreate it from docs/db/schema.sql
  npm run db:ps       Show PostgreSQL container status
  npm run db:logs     Follow PostgreSQL logs
  npm run db:psql     Open psql inside the container
  npm run db:migrate  Apply docs/db/migrations/*.sql
  npm run db:check    Show database and public tables
  npm run db:snapshot Copy current local JSON state into PostgreSQL snapshot table
  npm run db:import-auth Import .pwh-studio/users.json into the PostgreSQL users table
  npm run db:url      Print the local DATABASE_URL

Local DATABASE_URL:
  ${databaseUrl}
`);
}
