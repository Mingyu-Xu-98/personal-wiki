# Eve-style runtime migration

`personal-wiki-harness` is now the product home for the Studio frontend and the file-system-first harness runtime.

## Product entry

- Studio frontend: `apps/studio`
- Agent directories: `agents`
- Core runtime packages: `packages/agent-runtime`, `packages/harness-core`, `packages/engine-core`
- Durable run output: `.pwh-studio/eve-runtime`

## Agent as directory

Each agent is represented by a directory:

```text
agents/
  commander/
    agent.ts
    instructions.md
    tools/
    evals/
  site-builder/
    agent.ts
    instructions.md
    tools/
    skills/
    subagents/
      designer/
      coder/
      qa/
```

`agent-runtime` can load and validate this structure with `loadFileSystemAgent` and `listFileSystemAgentIds`.

## Durable workflow output

Every Studio build now writes an eve-style durable record:

```text
.pwh-studio/eve-runtime/
  runs/<run-id>/
    run.json
    trace.json
    approvals.json
    manifest.json
  artifacts/<run-id>/
    index.html
```

`trace.json` uses span names aligned with the eve framing:

- `ai.eve.turn`
- `ai.streamText`
- `ai.subagent`
- `ai.toolCall`
- `ai.version`

The Studio UI exposes this through `Trace JSON` in the build timeline. The API endpoint is:

```text
GET /api/runs/:runId/trace
```

## Policy and sandbox

- `SandboxRunner` writes draft artifacts into an isolated artifact directory and validates required files.
- `ApprovalGate` records approval checkpoints.
- `evaluateDeploymentPolicy` allows preview deployment after validation and requires admin or `deploy:production` scope for production.

## Verification

```bash
npm run inspect:agents
npm run check
npm run smoke:eve-runtime
npm run smoke:build-jobs
npm run smoke:studio
npm run build -w @personal-wiki-harness/studio
```
