# Workflow Spec

This is the readable contract for the Personal Wiki Harness workflow. The typed runtime contract lives in `packages/harness-core/src/workflow.ts`.

The product should feel like a user-facing personal website platform. The harness remains internal: it coordinates state, tools, context, versioning, verification, and recovery.

## Rule

The runtime uses three visible agent roles and one persistent knowledge layer.

```txt
Knowledge Layer
  raw sources -> wiki pages/entities/relations/log/index

Conversation Agent
  selects one knowledge base
  clarifies site type, audience, style, hard constraints
  produces the build intent / build spec

Builder Agent
  reads the selected wiki through tools
  chooses design assets / MCP components / design skills
  produces content model, design usage plan, site plan, and HTML artifact

Review Agent
  verifies grounding, privacy, design refs, public language, and publish readiness
  returns pass, warnings, or patch request

Harness Runtime
  owns phase transitions, context packets, tool gates, queue, logs, versions, publish, cost, retry
```

Agents are roles. Phases are harness states. A long workflow can still have multiple states, but it should not create a new conceptual agent for every state.

## Canonical Phases

```txt
workspace-discovery
knowledge-base-selection
source-linking
ontology-ingest
mutation-plan-review
wiki-maintenance
intent-clarification
site-generation
verification
versioning
reflection
```

For normal site creation, the selected phase subset is:

```txt
workspace-discovery
knowledge-base-selection
intent-clarification
site-generation
verification
versioning
reflection
```

## Phase Table

| Phase | Owner | Runtime role | Required Inputs | Required Outputs | Confirmation |
|---|---|---|---|---|---|
| `workspace-discovery` | Harness | none | none | `workspaceManifest` | no |
| `knowledge-base-selection` | Conversation Agent | `conversation-agent` | `workspaceManifest` | `knowledgeBaseSelection` | yes |
| `source-linking` | Knowledge Layer | `wiki-curator` | `workspaceManifest` | `sourceReferences` | no |
| `ontology-ingest` | Knowledge Layer | `wiki-curator` | `sourceReferences` | `sourceDocuments`, `wikiMutationPlan` | no |
| `mutation-plan-review` | Knowledge Layer | `wiki-curator` | `wikiMutationPlan` | `planReview`, `planHandoff` | yes |
| `wiki-maintenance` | Knowledge Layer | `wiki-curator` | `wikiMutationPlan`, `planReview`, `planHandoff` | `wikiSnapshot` | no |
| `intent-clarification` | Conversation Agent | `conversation-agent` | `knowledgeBaseSelection`, `wikiSnapshot` | `buildIntent`, `intentBrief` | yes |
| `site-generation` | Builder Agent | `builder-agent` | `buildIntent`, `wikiSnapshot` | `contentModel`, `designUsagePlan`, `sitePlan`, `siteArtifact` | no |
| `verification` | Review Agent | `review-agent` | `siteArtifact`, `designUsagePlan`, `buildIntent`, `wikiSnapshot` | `verificationReport` | no |
| `versioning` | Harness | none | `siteArtifact`, `designUsagePlan`, `verificationReport` | `buildVersion` | publish only |
| `reflection` | Harness | none | `buildVersion` | `runReflection` | no |

`wiki-curator` is an internal runtime role for maintaining the knowledge layer. It is not a fourth product agent in the website build flow.

## Boundary Objects

The workflow passes stable objects instead of relying on shrinking chat memory.

| Object | Owner | Purpose |
|---|---|---|
| `BuildIntent` / `buildSpec` | Conversation Agent | Freezes what the user wants to build. |
| `RunContextManifest` | Harness | Records selected knowledge base, wiki/source snapshots, tool registry, design registry, style guide, and carry-forward refs. |
| `ContentModel` | Builder Agent | Converts wiki meaning into public-site sections and copy structure. |
| `DesignUsagePlan` | Builder Agent | Explains which UI assets, MCP registry items, components, design skills, or verifier tools were used or rejected. |
| `SitePlan` | Builder Agent | Routes, navigation, and section placement. |
| `SiteArtifact` | Builder Agent | The compiled HTML files. |
| `ReviewReport` | Review Agent | Pass/warn/block decision with patch request when needed. |
| `BuildVersion` | Harness | Durable version record with site workspace, site graph, artifact refs, and lineage. |

## Hard Gates

- Raw source files are never mutated.
- Exactly one knowledge base is selected for a site build.
- Knowledge bases are isolated; a site build cannot silently mix sources from another base.
- Ontology candidates keep source/page evidence refs.
- Blocked mutation plans cannot be applied.
- Builder Agent must produce `DesignUsagePlan` before a site version can be accepted.
- Builder Agent must use knowledge tools and design asset tools when available; selected assets must be stable refs.
- Preview appears only after a build artifact exists.
- Hard verification failures block versioning.
- Public HTML cannot expose internal terms such as harness runtime, model routing, context packet, or tool registry.
- Publishing requires explicit user action.
- System-level lessons are not promoted from one-off user preferences.

## Design Asset Protocol

Design assets include UI components, Magic UI MCP registry items, shadcn/Figma style registries, internal templates, design skills, and verifier tools.

The Builder Agent should treat them as a searchable design memory:

```txt
recommend/search assets
  -> read selected asset constraints
  -> write DesignUsagePlan
  -> reference asset ids from ContentModel sections
  -> compile HTML
  -> Review Agent verifies refs and public quality
```

This keeps Magic UI and future MCP tools flexible. The agent is not told to hard-code one component; it is required to explain and preserve the design choices it made.

## Handoff Rule

Any phase that compresses context must return refs:

```txt
summary
decisions
artifacts
evidenceRefs
artifactRefs
mustCarryForwardRefs
contextDeltas
toolCalls
```

The summary can shrink. Refs must survive. A later patch build should re-read wiki pages, source docs, design assets, site graph nodes, and prior artifacts by id rather than trusting old prose.
