# Production Surface

The current implementation is a local production-shaped runtime, not yet a hosted multi-user product.

It includes:

- file-system-first agents
- durable run persistence
- scoped tools and permission checks
- API-key authentication backed by PostgreSQL
- multi-user run ownership
- approval pause and resume
- sandbox artifact writing and Docker validation mode
- retry metadata for tool calls
- regression evals
- HTTP health, agents, and runs endpoints
- Dockerfile
- GitHub Actions CI

## Runtime Commands

```sh
npm run check
npm run build
npm run inspect:agents
npm run demo:approval
npm run inspect:runs
npm run serve
npm run db:migrate
npm run db:create-user -- user@example.com admin '*'
```

## HTTP Endpoints

- `GET /health`
- `GET /agents` authenticated
- `GET /runs` authenticated and user-scoped
- `POST /runs` authenticated, creates a run for the current user
- `GET /artifacts/:runId/index.html` authenticated and owner-scoped
- `POST /deployments/:runId/authorize` authenticated, policy checked

## Authentication

Set `DATABASE_URL`, `AUTH_MODE=api-key`, and `AUTH_SECRET`.

For local PostgreSQL:

```sh
docker compose up -d postgres
```

Create a user and API key:

```sh
npm run db:migrate
npm run db:create-user -- user@example.com builder runs:read,runs:write,artifacts:read,deploy:preview
```

Use the returned key:

```sh
curl -H "Authorization: Bearer <api-key>" http://localhost:4317/runs
```

## Sandbox

Set `SANDBOX_MODE=docker` in production. Validation then runs with:

- no network
- read-only container filesystem
- dropped Linux capabilities
- memory and PID limits
- artifact mounted read-only

Local development can use `SANDBOX_MODE=local`.

## Deployment Policy

Deployment authorization checks:

- run exists and belongs to the user, unless admin
- run is completed
- latest build version passed validation
- approval checkpoint exists
- preview requires builder/admin
- production requires admin or `deploy:production` scope

## Remaining Production Hardening

Before public multi-user hosting, add OpenTelemetry export, managed secrets, database backups, rate limits, artifact object storage, and a real deployment provider integration.
