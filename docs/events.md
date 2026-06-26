# Event Log

The event log is the append-only audit trail for a workspace.

`snapshot.json` answers "what is true now." `events.jsonl` answers "how did this workspace get here."

## Local Path

```txt
.pwh/
  events.jsonl
```

Each line is one JSON event. The CLI appends events; it does not rewrite old events.

## Event Shape

The shared event type is `WorkspaceEvent` in `packages/engine-core/src/index.ts`.

```ts
{
  id: string;
  kind: WorkspaceEventKind;
  occurredAt: string;
  summary: string;
  actor: { type: "user" | "system" | "commander" | "sub-agent" | "cli"; id?: string; name?: string };
  workspaceId?: string;
  knowledgeBaseId?: string;
  runId?: string;
  versionId?: string;
  mutationPlanId?: string;
  sourceIds?: string[];
  pageIds?: string[];
  entityIds?: string[];
  artifactRefs?: string[];
  workflowPhaseId?: CommanderPhase;
  workflowToolName?: WorkflowToolName;
  allowedWorkflowToolNames?: WorkflowToolName[];
  payload?: Record<string, unknown>;
}
```

## Current CLI Events

The CLI currently records:

- `workspace.created`
- `source.linked`
- `source.extracted`
- `mutation-plan.created`
- `mutation-plan.reviewed`
- `mutation-plan.handoff-created`
- `mutation-plan.applied`
- `site.build-started`
- `site.build-completed`
- `verification.completed`
- `audit.completed`
- `version.created`

You can inspect the latest local events with:

```sh
pwh events --workspace /path/to/workspace
```

## Design Rules

- Events are append-only.
- Events preserve ids and artifact refs.
- Events preserve workflow phase and tool gates when they come from harness-controlled operations.
- Events should be small enough to scan and large enough to replay decisions.
- Events should not contain full raw source content.
- Derived state belongs in `snapshot.json`; event history belongs in `events.jsonl`.

## Future Reducer

A future reducer can rebuild or audit workspace state from the event log:

```txt
events.jsonl
  -> reducer
  -> reconstructed timeline
  -> audit findings
  -> optional snapshot repair
```

The first implementation only appends and reads events. Replay is a later verifier/audit milestone.
