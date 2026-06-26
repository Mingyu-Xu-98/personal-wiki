# Development Roadmap

This project should move as one architecture, not as a sequence of disconnected experiments.

## Product Shape

Personal Wiki Harness has two surfaces over the same engine:

- Studio: hosted GUI for users who want to upload or manage knowledge bases and build personal websites.
- CLI: local-first tool for users who want to read files in place, maintain a private `.pwh/` workspace, and export static HTML.

Both surfaces must use the same durable concepts:

- raw sources are immutable evidence
- the wiki is the maintained semantic layer
- a website is a compiled artifact
- build versions, tool calls, context handoffs, and reflections are recorded

## Core Runtime Order

The implementation order is fixed until the first complete product loop is done:

1. Workspace and wiki durability
   - local `.pwh/` workspace
   - source references instead of raw source copying
   - `index.wiki`, `log.wiki`, `snapshot.json`

2. Wiki mutation governance
   - create `WikiMutationPlan`
   - review plan before apply
   - preserve evidence refs, page refs, entity refs, and artifact refs
   - apply only after the commander or user accepts the plan

3. Commander pacing
   - workspace discovery
   - source linking
   - ontology ingest
   - wiki maintenance
   - intent clarification
   - site planning
   - site building
   - verification
   - versioning
   - reflection

4. Model-backed wiki maintainer
   - use a strong or balanced model for ontology extraction
   - return candidates with source/page evidence
   - never promote uncertain candidates without a review boundary

5. Site build pipeline
   - clarify user intent through chat
   - select exactly one knowledge base
   - produce a site plan
   - compile a versioned artifact
   - verify source grounding and user constraints

6. Studio integration
   - knowledge bases are isolated
   - create page is a conversation, not a static form
   - preview appears only after a build exists
   - users can revise, publish, or save versions

7. System Meta Skill loop
   - collect evidence during real runs
   - promote only system-level lessons
   - keep user-specific preferences out of global skills unless explicitly generalized

## Hard Constraints

- Do not mutate raw source files.
- Do not mix knowledge bases.
- Do not publish without explicit user action.
- Do not use summaries as the only carrier of important evidence.
- Carry source ids, page ids, artifact refs, tool calls, and version ids forward.
- Strong model decisions should control commander, planning, reflection, and system skill promotion.

## Soft Constraints

- Avoid template-like websites.
- Let personal meaning and audience shape the site.
- Prefer lower-cost models for bounded writing, summarization, and in-site assistant calls.
- Prefer deterministic scaffolding first, then replace internals with model-backed decisions behind the same contracts.

## Current Focus

The current milestone is mutation plan governance:

```txt
source files
  -> source extraction
  -> WikiMutationPlan
  -> review summary
  -> review batches / handoff refs
  -> apply plan
  -> build site
```

This is the first concrete commander boundary. It prevents the system from turning local files into opaque state changes and gives the later model commander a stable place to pause, split, explain, or reject work.
