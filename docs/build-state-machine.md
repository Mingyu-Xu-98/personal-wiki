# Build State Machine

The build workflow is durable and resumable.

```text
analyze_intent
  -> curate_wiki
  -> compile_content
  -> plan_site
  -> build_site
  -> validate
  -> approval
  -> complete
```

Failure can enter `repair` and resume from the step that owns the failed artifact.

Every state transition should write:

- current step
- context ledger update
- tool trace update
- trace span
- optional build version

The first implementation phase only runs `build_site -> complete` with deterministic output.
