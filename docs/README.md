# Documentation Index

Start here when navigating the project architecture.

## Primary Planning Docs

- `master-plan.md` — complete architecture, workflow, agent topology, implementation plan, and documentation map.
- `development-roadmap.md` — implementation order and current milestone.
- `architecture.md` — core architecture thesis and package boundaries.
- `architecture-flow.html` — visual architecture flow for browser viewing.
- `production-runtime.md` — production runtime adapters, queue/log/quota/deployment boundaries.
- `site-generation-quality.md` — UI design asset registry, UI MCP/provider strategy, and generated-site quality gates.
- `site-workspace-patch-build.md` — Site Workspace, Site Graph, and Patch Build design for stable conversational editing.
- `local-postgres.md` — Docker PostgreSQL setup for local development.
- `mac-mini-alpha.md` — Mac mini alpha and small-scale self-hosting plan.
- `uploads.md` — source upload handling, local object storage, and large-file content modes.

## Runtime And Workflow

- `workflow.md` — canonical workflow spec for phases, allowed tools, required outputs, and confirmation gates.
- `harness-runtime.md` — runtime loop, commander role, model tiers, and handoff discipline.
- `agent-runtime.md` — model adapter, tool registry, sub-agent executor, and context packet contracts.
- `build-state-machine.md` — minimal run state machine.
- `model-routing.md` — centralized LLM client routing, model tiers, and low-cost provider policy.
- `system-meta-skill.md` — system-level reusable procedure layer.
- `verification.md` — deterministic verifier and audit scorecard design.
- `site-workspace-patch-build.md` — versioned site workspace, product graph, and patch editing contract.

## Wiki And Workspace

- `wiki-model.md` — source/wiki/entity/relation/event/lint model.
- `uploads.md` — uploaded raw sources and object-key references.
- `local-workspace.md` — `.pwh/` local workspace design.
- `ontology-and-commander.md` — ontology extraction, commander pacing, and context handoff.
- `events.md` — append-only event log schema and current CLI events.

## Reading Order

1. `master-plan.md`
2. `architecture.md`
3. `harness-runtime.md`
4. `local-workspace.md`
5. `ontology-and-commander.md`
6. `development-roadmap.md`
