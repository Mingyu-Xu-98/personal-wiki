# Eve-Style Harness Plan

## Goal

Rebuild Personal Wiki as a file-system-first agent harness inspired by Vercel eve.

The product is not a generic AI website generator. It is a durable system that turns a personal wiki into audience-specific websites through observable, resumable, and versioned workflows.

## Core Thesis

```text
Personal wiki = source of meaning
Harness run = durable workflow
Agent directory = executable capability unit
Website = compiled artifact
```

The model should not be the project manager. The harness owns orchestration, context, permissions, validation, retries, and versioning.

## What We Borrow From Eve

- An agent is a directory.
- Every conversation or build run is a durable workflow.
- Agent-generated code runs outside the app runtime.
- Parents delegate to subagents with scoped tools and clean contexts.
- Every run produces a trace.
- Human approval is a workflow node, not an afterthought.
- Evals and regression cases live near the agent they test.

## What Is Different Here

Eve is a general agent framework. Personal Wiki is domain-specific.

Our domain adds:

- A persistent personal wiki as long-term memory.
- Wiki entities, pages, relations, events, and lint issues.
- Website-specific content models and site plans.
- Versioned website artifacts tied back to wiki sources.
- Editing workflows that produce change requests and patch plans.

## Target Directory Model

```text
agents/
  wiki-curator/
    agent.ts
    instructions.md
    tools/
    skills/
    evals/
  intent-analyst/
  content-compiler/
  site-planner/
  site-builder/
    subagents/
      designer/
      coder/
      qa/
  editor/

runtime/
  agent-loader.ts
  workflow-runner.ts
  tool-registry.ts
  trace-recorder.ts
  approval-gate.ts
  sandbox-runner.ts

domain/
  wiki/
  build/
  site/

workspace/
  raw/
  wiki/
  runs/
  artifacts/
```

## Agent Directory Contract

Every top-level agent can contain:

- `agent.ts`: model choice, permissions, tool scope, subagent declarations.
- `instructions.md`: role, operating rules, and output expectations.
- `tools/*.ts`: capabilities the agent can call.
- `skills/*.md`: durable domain knowledge or procedures.
- `subagents/*`: delegated agents with narrower context.
- `evals/*.json`: regression cases.
- `channels/*`: future user interfaces such as web, CLI, or Slack.
- `schedules/*`: future autonomous triggers.

## Harness Runtime Responsibilities

1. Load agents from directories.
2. Build scoped tool manifests.
3. Create durable workflow runs.
4. Maintain a context ledger.
5. Record OpenTelemetry-style trace spans.
6. Gate dangerous steps behind approvals.
7. Run generated code in sandbox contracts.
8. Validate artifacts and record versions.
9. Resume failed or paused runs.
10. Run regression evals.

## First Implementation Phase

This phase deliberately avoids UI, database, real model calls, and production deployment.

It should provide:

- A clean TypeScript project.
- Domain types for wiki, build, and site.
- Runtime types for agents, tools, workflows, traces, approvals, and sandboxes.
- An agent loader that reads `agent.ts` and `instructions.md`.
- A workflow runner that records spans and versions.
- A `site-builder` example agent.
- A local demo proving the harness shape.
- Durable run files under `workspace/runs`.
- Isolated artifact files under `workspace/artifacts`.
- Agent-local eval cases.

## Later Phases

- Add persistent storage for `HarnessRun`, `BuildVersion`, and `TraceSpan`.
- Add model adapters and real tool calling.
- Add wiki ingest and entity extraction.
- Add sandboxed site artifact generation.
- Add human approval UI.
- Add regression eval runner.
- Add Studio UI only after the runtime contract is stable.

## Migration Rule

Do not port the old framework directly.

Old prototypes can inform concepts, but this project should treat eve-style agent directories and durable workflow state as the architectural foundation.
