# Personal Wiki Harness

Personal Wiki Harness treats a personal wiki as the source of meaning and a personal website as a compiled artifact.

The harness is the coordinating runtime around the model. It owns intent capture, durable context, tool access, planning, execution, verification, and versioning. The first milestone is deliberately small: stable domain types, architecture notes, and a minimal orchestrator that can turn a build intent into a recorded run.

## Workspace

- `docs/` captures the architecture and operating model.
- `packages/wiki-core/` defines source, wiki, relation, event, and lint primitives.
- `packages/engine-core/` defines the shared GUI/CLI engine boundary and workspace adapter.
- `packages/harness-core/` defines the orchestration runtime.
- `packages/agent-runtime/` defines model and tool boundary contracts.
- `agents/` defines file-system-first agents, tools, skills, subagents, and eval metadata.
- `packages/meta-skill-core/` defines system-level reusable procedures and promotion policy.
- `packages/site-compiler/` defines content and site planning primitives.
- `apps/studio/` is the hosted GUI shell.
- `apps/cli/` is the local shell for reference-only local workspaces.

## Planning Docs

Start with:

- `docs/master-plan.md` for the complete architecture and implementation plan.
- `docs/README.md` for the documentation map.
- `docs/eve-runtime.md` for the eve-style agent directory and durable run trace migration.

## Eve-style Runtime

Studio builds now persist recoverable run records under `.pwh-studio/eve-runtime/`:

- `runs/<run-id>/run.json`
- `runs/<run-id>/trace.json`
- `runs/<run-id>/approvals.json`
- `runs/<run-id>/manifest.json`
- `artifacts/<run-id>/index.html`

Use `npm run inspect:agents` to validate the agent directory and `npm run smoke:eve-runtime` to verify durable trace, approval, and sandbox artifact output.

## First Local Check

```sh
npm run demo
```

The demo runs the minimal harness without calling an external model or adopting any older project framework.

## Studio Preview

```sh
npm install
npm run db:up
npm run dev
```

Open `http://127.0.0.1:3006`. The local seed admin account is:

- email: `admin@personal.wiki`
- password: `admin123`

Studio can hydrate user state from PostgreSQL when `PWH_STUDIO_STORE=postgres`, while keeping local JSON as a development fallback. Useful database commands:

```sh
npm run db:up
npm run db:url
npm run db:psql
npm run smoke:postgres-hydrate
npm run smoke:postgres-queue
```

See `docs/local-postgres.md` and `docs/mac-mini-alpha.md`.

## Local CLI Preview

```sh
npm run cli -- init /path/to/workspace
npm run cli -- link /path/to/notes --workspace /path/to/workspace
npm run cli -- ingest /path/to/notes --workspace /path/to/workspace
npm run cli -- ingest /path/to/notes --workspace /path/to/workspace --plan-only
npm run cli -- review-plan <mutation-plan-id> --workspace /path/to/workspace
npm run cli -- handoff-plan <mutation-plan-id> --workspace /path/to/workspace
npm run cli -- plans --workspace /path/to/workspace
npm run cli -- apply-plan <mutation-plan-id> --workspace /path/to/workspace
npm run cli -- build --workspace /path/to/workspace --title "My Site" --prompt "Create a public personal website"
npm run cli -- events --workspace /path/to/workspace
npm run cli -- verify --workspace /path/to/workspace
npm run cli -- audit --workspace /path/to/workspace
npm run cli -- status --workspace /path/to/workspace
```

The CLI creates `.pwh/` in the selected workspace. Raw files stay where they are; the workspace stores references, generated wiki files, logs, cache, build versions, and exported site artifacts.
Use `--plan-only` when you want the harness to pause after extracting sources and proposing a `WikiMutationPlan`; `apply-plan` commits that plan into the maintained wiki.
