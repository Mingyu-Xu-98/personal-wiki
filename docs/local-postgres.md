# Local PostgreSQL

Personal Wiki Harness uses PostgreSQL as the target production database. Local development should run PostgreSQL through Docker so the app, future worker, and Mac mini alpha deployment share the same database shape.

## Prerequisite

Install Docker Desktop on macOS. After installation, verify:

```sh
docker --version
docker compose version
```

## Start Database

```sh
npm run db:up
npm run db:ps
```

The database listens only on localhost:

```text
127.0.0.1:54322
```

Default connection string:

```text
postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh
```

This is also written in `.env.local.example` as `DATABASE_URL`.

## Reset Database

This deletes the local Docker volume and recreates the database from `docs/db/schema.sql`.

```sh
npm run db:reset
```

## Open psql

```sh
npm run db:psql
```

## Check Schema

```sh
npm run db:check
```

This prints the connected database/user and the public tables.

## Apply Migrations

Fresh databases automatically load `docs/db/schema.sql`. Incremental migrations live in `docs/db/migrations/`.

```sh
npm run db:migrate
```

Migration `003` adds `knowledge_mutation_reviews`, which preserves pending uploaded-source reviews before the user confirms or rejects them.

## Snapshot Current Local Studio State

While Studio still runs on `.pwh-studio/state.json`, you can copy the current JSON state into PostgreSQL:

```sh
npm run db:snapshot
```

This writes `studio-store` and `studio-auth` snapshots into `studio_state_snapshots`. It is a migration bridge, not the final normalized repository adapter.

## Schema Source

The first schema lives in:

```text
docs/db/schema.sql
```

Docker mounts that file into `/docker-entrypoint-initdb.d/001_schema.sql`, so it is applied automatically only when the PostgreSQL data volume is first created. If the schema changes during development, use `npm run db:reset`.

## Current App State

Studio auth can use PostgreSQL by setting:

```text
PWH_AUTH_STORE=postgres
PWH_STUDIO_STORE=postgres
PWH_KNOWLEDGE_STORE=postgres
PWH_BUILD_STORE=postgres
PWH_BUILD_QUEUE=postgres
DATABASE_URL=postgresql://pwh:pwh_local_dev@127.0.0.1:54322/pwh
```

The active Studio process still keeps hot objects in memory for fast harness execution and writes `.pwh-studio/state.json` as a local fallback. With `PWH_STUDIO_STORE=postgres`, every authenticated API request first hydrates the user's Studio state from PostgreSQL. If no rows exist for a new user, Studio creates the starter state and mirrors it into PostgreSQL.

With PostgreSQL flags enabled, Studio stores:

- `PWH_KNOWLEDGE_STORE=postgres`: knowledge bases, source documents, wiki pages, entities, and relations.
- Knowledge mutation reviews: pending, approved, and rejected source-to-wiki review records.
- `PWH_BUILD_STORE=postgres`: build jobs, build logs, harness runs, build versions, publications, and usage records.
- `PWH_BUILD_QUEUE=postgres`: claims queued jobs in PostgreSQL before execution and requeues interrupted running jobs after restart.

Harness run ids and version ids are scoped with the user id in PostgreSQL, because the in-process harness uses local sequential ids such as `run_1` and `version_1`.

To smoke test direct PostgreSQL writes:

```sh
npm run smoke:postgres-auth
npm run smoke:postgres-knowledge
npm run smoke:postgres-builds
npm run smoke:postgres-hydrate
npm run smoke:postgres-queue
```

To import existing local JSON users into the normalized `users` table:

```sh
npm run db:import-auth
```
