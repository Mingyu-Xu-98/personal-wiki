# Harness Runtime

The runtime is the software boundary around model calls.

It provides:

- `agent-loader`: loads `agent.ts` and `instructions.md` from a directory.
- `workflow-runner`: executes durable steps, calls tools, records approvals, and captures versions.
- `trace-recorder`: records OpenTelemetry-style span trees.
- `tool-registry`: builds scoped tool manifests and records tool calls.
- tool calls record attempt counts and support bounded retries.
- `run-store`: persists runs, traces, and approvals under `workspace/runs`.
- `approval-gate`: creates human-in-the-loop checkpoints.
- `sandbox-runner`: writes and validates generated artifacts under `workspace/artifacts`.
- `eval-runner`: checks agent-local regression cases.

The runtime should remain domain-aware enough to serve Personal Wiki, but generic enough that agents do not own orchestration.
