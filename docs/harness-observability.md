# Harness Observability

Harness observability is the runtime layer that monitors agent behavior without trusting any single model, MCP server, plugin, or skill to self-report correctly.

The rule is simple: every meaningful agent action must pass through a Harness boundary before it reaches external capability.

## Scope

Observed behavior includes:

- run lifecycle: start, completion, failure
- phase lifecycle: phase start, completion, failure
- agent delegation: packet dispatch, start, completion, failure
- model routing: selected role and model tier
- tool calls: tool name, bounded input summary, output summary, status, duration
- MCP usage: synced MCP registries and future live MCP adapter calls
- skill/design asset usage: selected asset ids, reasons, target sections, constraints
- artifact creation: content model, design usage plan, site plan, HTML artifact
- verification: lint issue counts, blocking status, publish readiness
- versioning: created version id, site artifact refs, design usage refs

## Runtime Boundary

Agents do not call tools directly.

```text
Agent
  -> Harness Runtime
  -> Tool Registry / MCP Adapter / Skill Registry / Workspace Adapter / Model Router
  -> Observability Events
  -> Build logs, run state, PostgreSQL snapshots, future dashboard
```

This keeps monitoring in code. Plugins and MCP servers can provide capability, but the Harness owns the audit trail.

## Event Shape

Every event uses `HarnessObservationEvent`.

```ts
type HarnessObservationEvent = {
  id: string;
  runId: string;
  intentId: string;
  createdAt: string;
  target: "run" | "phase" | "agent" | "model" | "tool" | "mcp" | "skill" | "artifact" | "verification" | "version" | "reflection";
  type: string;
  status?: "started" | "completed" | "failed" | "blocked" | "skipped";
  phase?: string;
  agentRole?: string;
  traceId?: string;
  toolName?: string;
  inputSummary?: string;
  outputSummary?: string;
  artifactRefs?: string[];
  data?: Record<string, unknown>;
};
```

The event stores bounded summaries and stable refs, not full private content. Large wiki pages, raw files, and model messages should be referenced by id/hash/artifact ref instead of copied into logs.

## Hook API

`HarnessLifecycleHook` receives every observation event.

Typical future hooks:

- cost accounting
- live build timeline
- policy enforcement
- alerting
- evaluation capture
- meta skill evidence collection
- user-facing debug replay

Hooks are non-blocking from a product perspective: if an observer or hook fails, the Harness warns but does not fail the build.

## Current Implementation

Implemented in:

- `packages/harness-core/src/types.ts`
- `packages/harness-core/src/observability.ts`
- `packages/harness-core/src/orchestrator.ts`
- `apps/studio/lib/server/store.ts`
- `docs/db/migrations/006_harness_observability_events.sql`

Current persisted state:

- `HarnessRun.observabilityEvents`
- PostgreSQL `harness_runs.observability_events`
- Studio build logs include an event summary and tool-call summary
- Studio Create page shows a collapsible generation timeline backed by `observabilityEvents`
- `/api/runs?runId=...` can fetch a specific run and its event timeline

## Why This Matters

This makes later capabilities safer:

- Magic UI MCP can be tracked as design assets or live MCP calls.
- Design skills can be tracked as selected skill/design asset refs.
- Sub-agents can be audited without exposing full context.
- The Review Agent can inspect an actual behavior timeline instead of guessing.
- Cost, quota, quality, and debugging can share one source of truth.
