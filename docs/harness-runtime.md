# Harness Runtime

The runtime is the software boundary around model calls.

It provides:

- `agent-loader`: loads `agent.ts` and `instructions.md` from a directory.
- `workflow-runner`: executes durable steps and records versions.
- `trace-recorder`: records OpenTelemetry-style span trees.
- `tool-registry`: future scoped tool manifest builder.
- `approval-gate`: future human-in-the-loop checkpoints.
- `sandbox-runner`: future isolated artifact execution.

The runtime should remain domain-aware enough to serve Personal Wiki, but generic enough that agents do not own orchestration.
