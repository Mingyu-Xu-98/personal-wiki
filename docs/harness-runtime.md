# Harness Runtime

The harness turns intent into durable, inspectable work.

## Runtime Loop

1. Capture `BuildIntent`.
2. Build a `ContextLedger` from selected wiki pages, source summaries, prior run notes, and available tool descriptions.
3. Produce a `HarnessPlan`.
4. Execute plan steps through registered tools or internal handlers.
5. Record every tool call as a `ToolCallRecord`.
6. Verify the output against intent, wiki constraints, and compiler constraints.
7. Emit a `BuildVersion`.

## Non-Goals For The First Version

- No migration from `create-any-site`.
- No framework commitment for Studio.
- No external model dependency in the core orchestrator.
- No hidden mutable global state.

## Design Bias

The runtime should be boring and auditable. Each run has a beginning, a plan, records of what happened, verification results, and a version record. Future model calls can be swapped into the planning and execution boundaries without changing the core wiki model.
