# Harness Runtime

The harness turns intent into durable, inspectable work.

## Runtime Loop

1. Capture `BuildIntent`.
2. Build a `ContextLedger` from selected wiki pages, source summaries, prior run notes, and available tool descriptions.
3. Produce a `HarnessPlan`.
4. Execute plan steps through registered tools or internal handlers.
5. Record every tool call as a `ToolCallRecord`.
6. Verify the output against intent, wiki constraints, and compiler constraints.
7. Reflect on run quality and collect system-skill evidence.
8. Emit a `BuildVersion`.

## Commander

The commander controls pacing. It decides whether the run is linking sources, extracting ontology, maintaining the wiki, clarifying intent, planning a site, building, verifying, versioning, or reflecting.

The commander should read the workflow spec instead of inventing phase order locally. The readable contract is `docs/workflow.md`; the typed runtime contract is `packages/harness-core/src/workflow.ts`.

The first Commander object now lives in `packages/harness-core/src/commander.ts`. It creates:

- `CommanderDecision[]` for selected workflow phases
- `SubAgentTrace[]` for delegated phases
- bounded `ContextPacket` objects with budgets, allowed tools, output contracts, and carry-forward refs
- `ContextLedger.preservedReferenceIds` so later phases can re-read artifacts instead of trusting summaries

The executable sub-agent boundary lives in `packages/agent-runtime/src/index.ts`.

- `createDryRunSubAgentExecutor()` is the default safe executor. It marks traces as skipped and preserves packet refs.
- `createModelBackedSubAgentExecutor()` accepts an `AgentRuntime` and optional `ToolRegistry`.
- Model-backed execution exposes only `packet.allowedToolNames`, records bounded tool calls, and parses structured output into `SubAgentResult`.
- A model result must carry `summary`, `decisions`, `artifactRefs`, `evidenceRefs`, `mustCarryForwardRefs`, `discardableContext`, and `contextDeltas`.
- `content-model` and `site-plan` artifacts can influence `BuildVersion` after sanitizer checks.
- `ontology-extraction` artifacts from `wiki-curator` can influence `WikiMutationPlan` after evidence-ref validation.
- Unknown model-provided page/entity/section refs are dropped and recorded as lint warnings.
- Unknown ontology source refs are rejected, and model-backed ontology plans stay pending human review.

CLI and Studio now expose this as an opt-in path. CLI uses `pwh ingest --model-curator`; Studio uses `PWH_WIKI_CURATOR_ENABLED=true` plus the OpenAI-compatible endpoint variables. In both cases the model path writes a reviewable mutation plan before durable wiki state changes.

Studio also has an opt-in model path for website generation:

```txt
PWH_SITE_AGENTS_ENABLED=true
PWH_SITE_BUILDER_MODEL=<cheaper-or-specialized-model>
```

When enabled, the website build path is handled by one model-backed `builder-agent` runtime role. The Conversation Agent is primarily the Studio chat/create flow, and the Review Agent is currently deterministic verification plus an optional context packet. Builder Agent tools are gated to wiki reading, design asset selection, site planning, compilation, and artifact recording.

The builder returns the full build handoff in one structured result: `content-model`, `design-usage-plan`, `site-plan`, and `html`. The orchestrator sanitizes all of these before they become a `BuildVersion`.

Studio model selection is centralized in `apps/studio/lib/server/llm-client.ts`.

The default routing policy is:

- `create-agent` and `wiki-curator` use the primary provider
- `site-builder` is the configured route for Builder Agent and can prefer a lower-cost provider when verification is available
- future `site-chatbot` and `summarizer` prefer the economy provider
- future `image-generation` uses the image provider when configured, then falls back to cheaper OpenAI-compatible providers

The admin overview exposes only non-secret routing state: provider configured status, use-case route, model name, tier, and enabled/disabled state.

The versioning gate now performs deterministic checks on model-backed site artifacts:

- model-backed `builder-agent` must return `content-model`, `design-usage-plan`, `site-plan`, and `html`
- `design-usage-plan` must select concrete design asset refs and target known section ids
- HTML artifacts must include usable `text/html` content
- user-facing HTML must not expose internal system language such as model routing, context packets, tool registries, or system meta skills
- sections with generated copy should keep source page or entity refs
- navigation hrefs should resolve to planned routes or hash anchors

Blocking issues are recorded as `WikiLintIssue` with `severity: "error"` and stop versioning. Non-blocking quality issues remain warnings so a later editor/verifier can fix them.

The commander should separate hard and soft constraints:

- hard constraints block or pause the run when violated
- soft constraints guide quality and can be traded off with an explicit note

For local CLI use, the commander should not jump straight to website generation. It should first help the user link local files, construct or refresh the wiki, lint the result, and then ask whether to build a website from the wiki.

## Shared Context Manifest

Sub-agents do not receive identical full prompts. They receive bounded context packets backed by the same manifest and registries.

Each run now creates a `RunContextManifest` containing:

- selected `knowledgeBaseId`
- `wikiSnapshotId`
- `sourceSnapshotId`
- `designSystemId`
- `componentRegistryId` (currently the design asset registry id)
- `toolRegistryId`
- `styleGuideId`
- `buildIntentId`
- optional `baseVersionId`
- `requiredCarryForwardRefs`

Every sub-agent packet includes:

- `run-context-manifest`
- `design-system`
- `component-registry` / design asset registry
- `tool-registry`
- `style-guide`

Those refs are automatically inserted into `mustCarryForwardRefs`, so a later phase can re-read authoritative context instead of trusting a compressed summary. UI design assets, whether they came from Magic UI MCP, another MCP, a design skill, or an internal verifier tool, must travel as stable refs in the same way as wiki/source/entity refs.

The orchestrator verifies packet and handoff completeness. If a sub-agent packet is missing shared context, or if a result drops a required carry-forward ref, the run records lint issues before versioning.

## System Skills And Model Tiers

The runtime selects active System Meta Skills before planning. These skills provide reusable procedure such as reading the wiki before compilation or routing command decisions to a strong model tier.

Model routing is recorded in the `ContextLedger`. The default posture is:

- strong tier for commander, planner, reflection, and system-skill promotion
- balanced tier for bounded code generation and wiki maintenance
- small tier for website assistant calls and summarization
- embedding or retrieval tier for search

## Non-Goals For The First Version

- No migration from `create-any-site`.
- No framework commitment for Studio.
- No external model dependency in the core orchestrator.
- No hidden mutable global state.

## Design Bias

The runtime should be boring and auditable. Each run has a beginning, a plan, records of what happened, verification results, and a version record. Future model calls can be swapped into the planning and execution boundaries without changing the core wiki model.

Sub agents should receive bounded context packets rather than the full conversation. They may summarize, but they must preserve references to wiki pages, source documents, tool calls, and artifacts so later stages can re-read evidence instead of relying on memory.

## Plan Handoff

Mutation plan review is the first implemented commander handoff.

```txt
WikiMutationPlan
  <- wiki-curator ontology-extraction artifact
  -> review summary
  -> review batches
  -> evidence refs
  -> artifact refs
  -> must-carry-forward refs
```

The handoff is intentionally more important than the prose summary. Later agents can receive a small summary, but source ids, page ids, entity ids, batch ids, and the mutation plan artifact ref must survive every handoff. When a later phase needs detail, it should use tools to re-read the referenced artifact or source instead of trusting a compressed memory of the plan.
