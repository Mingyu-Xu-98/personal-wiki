# Architecture

Personal Wiki is built around four layers:

```text
workspace/      durable files: raw sources, wiki pages, runs, artifacts
domain/         typed wiki, build, and site models
runtime/        agent loading, workflow execution, tracing, approvals, sandbox contracts
agents/         file-system-first agent capability directories
```

## Agent as Directory

Each agent is a directory with local identity, instructions, tools, skills, subagents, and evals. The harness loads the directory and decides what the agent can see and do during a workflow step.

## Harness as Control Plane

The harness owns:

- durable workflow state
- scoped tool access
- context ledger
- trace spans
- approvals
- sandbox execution contracts
- validation
- build versions

Agents do focused work inside those boundaries.

## Website as Artifact

The website is a compiled artifact derived from the personal wiki under a specific build intent. It is not the source of truth.
