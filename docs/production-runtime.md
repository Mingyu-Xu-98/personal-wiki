# Production Runtime Plan

Personal Wiki Harness is now shaped as a production platform with replaceable adapters. The current Studio app still uses local JSON persistence for development, but the runtime contracts are no longer tied to request-local synchronous execution.

## Runtime Boundaries

- Studio UI owns user-facing flows: knowledge base selection, create conversation, build progress, preview, publish, and version management.
- Create Agent turns user conversation into a site brief. It uses the LLM routing layer and can fall back from primary to economy routes.
- Harness Orchestrator owns deterministic build state: intent, context ledger, workflow, sub-agent traces, verification, reflection, and build version.
- Build Queue owns long-running execution. `/api/runs` enqueues a build job, returns immediately, and the UI polls job status and logs.
- Production Ledger owns quota, usage, cost units, deployment records, and build logs.
- Publishing owns deployment records. The current provider is `local-artifact`; future providers can implement Vercel, Cloudflare Pages, or object storage plus CDN.

## Current Alpha Implementation

- Persistence: PostgreSQL hydrate/write-through when `PWH_STUDIO_STORE=postgres`, with `.pwh-studio/state.json` as a local fallback
- Auth persistence: PostgreSQL when `PWH_AUTH_STORE=postgres`, with JSON fallback
- Queue: in-process worker for simple local dev, or a separate worker process with `npm run worker`
- Source uploads: local object storage with bounded wiki excerpts for text, Markdown, CSV, JSON, YAML, PDF, DOCX, PPTX, and RTF
- Knowledge review state: pending/approved/rejected wiki mutation reviews are persisted in PostgreSQL after migration `003`
- Logs: persisted build log events
- Quota: alpha daily build/source/cost limits
- Cost: estimated cost units per build and publish action
- Deployment: real local static artifacts under `.pwh-studio/published-sites`, exposed through authenticated artifact URLs
- Design asset system: server-side registry for UI components, patterns, templates, MCP-sourced candidates, design skills, and verifier tools

## Production Adapter Targets

- Database: PostgreSQL using `docs/db/schema.sql`
- Files: object storage for source uploads and compiled site artifacts. The alpha source upload adapter writes to `.pwh-studio/objects` by default and stores `object_key` in PostgreSQL.
- Queue: durable queue such as Redis/BullMQ, Cloud Tasks, SQS, or database-backed jobs
- Logs: append-only build log table plus optional OpenTelemetry spans
- CDN: Vercel, Cloudflare Pages, or S3-compatible storage with CDN invalidation
- Cost: provider-specific usage events tied to route/use case/model

## Alpha Acceptance

The platform is ready for internal production-style testing when:

- A build is enqueued instead of blocking the request.
- Queued jobs are claimed in PostgreSQL, and interrupted running jobs are requeued after restart.
- The user sees build progress and failure messages.
- Each build records job, logs, version, and usage.
- Publishing creates a deployment record and writes a browsable `index.html` artifact.
- Quota failures are explicit.
- Studio can recover user knowledge, runs, versions, publications, logs, and usage from PostgreSQL after a fresh process starts.

## Local Alpha Commands

Run Studio with the default in-process worker:

```sh
npm run restart:studio
```

Run Studio with a separate worker process:

```sh
PWH_BUILD_WORKER_MODE=external npm run restart:studio
npm run worker
```

Run one worker tick for tests or manual recovery:

```sh
npm run worker:once
```

The external worker claims queued jobs, writes build logs, creates build versions, and records estimated usage through the same store APIs as Studio. In PostgreSQL mode, use `PWH_STUDIO_STORE=postgres` and `PWH_BUILD_QUEUE=postgres` for both Studio and the worker.
