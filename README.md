# Personal Wiki Harness

Personal Wiki Harness treats a personal wiki as the source of meaning and a personal website as a compiled artifact.

The harness is the coordinating runtime around the model. It owns intent capture, durable context, tool access, planning, execution, verification, and versioning. The first milestone is deliberately small: stable domain types, architecture notes, and a minimal orchestrator that can turn a build intent into a recorded run.

## Workspace

- `docs/` captures the architecture and operating model.
- `packages/wiki-core/` defines source, wiki, relation, event, and lint primitives.
- `packages/harness-core/` defines the orchestration runtime.
- `packages/agent-runtime/` defines model and tool boundary contracts.
- `packages/site-compiler/` defines content and site planning primitives.
- `apps/studio/` is reserved for the future UI.

## First Local Check

```sh
npm run demo
```

The demo runs the minimal harness without calling an external model or adopting any older project framework.
