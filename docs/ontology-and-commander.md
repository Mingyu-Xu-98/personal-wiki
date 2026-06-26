# Ontology And Commander

LLM analysis should extract ontology, but ontology extraction is not the same as blindly accepting every model guess.

The harness should treat ontology as candidate structure grounded in sources:

- entities: people, projects, organizations, concepts, topics, tools, skills, documents, artifacts
- events: dated or ordered things that happened
- claims: statements that may need evidence or later contradiction checks
- relations: typed links between entities
- skills: user capabilities or reusable system procedures, kept distinct from System Meta Skills

## Extraction Flow

```txt
source document
  -> read/extract text
  -> candidate ontology extraction
  -> merge/dedupe against existing wiki
  -> ask human only when ambiguity matters
  -> create WikiMutationPlan
  -> apply wiki mutation
  -> update index.wiki and log.wiki
```

The model returns candidates with evidence references:

```json
{
  "kind": "skill",
  "label": "AI product prototyping",
  "summary": "Repeated work on AI tools and website generation.",
  "confidence": 0.78,
  "evidenceSourceIds": ["src_projects"],
  "evidencePageIds": ["page_projects"]
}
```

The wiki maintainer should not lose the source link. Summaries are allowed to be lossy; references and artifacts are not.

The concrete write boundary is `WikiMutationPlan`. It records planned source/page/entity/index/log/event changes before they are applied. This keeps ingest inspectable and gives the commander a place to pause for human confirmation.

Current implementation note: the CLI has a deterministic candidate extractor that records source-summary, topic, claim, event, skill, and tool candidates when obvious cues are present. `pwh ingest --plan-only` now stops after writing the plan, `pwh review-plan` explains whether it is ready or needs human review, `pwh handoff-plan` preserves review batches and must-carry-forward refs, and `pwh apply-plan` commits it into the maintained wiki. This is intentionally conservative scaffolding. The same `OntologyExtraction` slot should later be filled by the wiki-maintainer model, with the same evidence references and human-review boundary.

## Commander Role

The CLI commander is the pacing layer. It decides which phase the local workflow is in and when to ask the user for confirmation.

Recommended phases:

1. `workspace-discovery`: find or create `.pwh/`
2. `source-linking`: link local files without copying raw sources
3. `ontology-ingest`: extract candidate ontology from sources
4. `wiki-maintenance`: write summaries, entity pages, relations, index, and log
5. `intent-clarification`: ask what the user wants to do next
6. `site-planning`: plan a site only if the user wants one
7. `site-building`: compile the website artifact
8. `verification`: check constraints and source grounding
9. `versioning`: write build version and export files
10. `reflection`: record reusable process lessons

The commander should be flexible inside each phase, but the phase boundaries are useful guardrails.

## Hard And Soft Constraints

Hard constraints are non-negotiable. A run should stop, ask, or fail if they are violated.

Examples:

- raw source files are immutable
- a selected knowledge base must stay isolated
- local file access must stay inside the allowed workspace and linked file references
- generated site artifacts must be versioned
- publishing needs an explicit user action
- private source content must not be exposed unless the user approves
- code/site build must pass verification before being marked complete

Soft constraints guide taste and quality. They can be traded off or revised.

Examples:

- avoid template-like pages
- prefer a quiet, editorial style
- make the site feel personal but not self-important
- use concise section titles
- keep layout dense or spacious depending on the audience
- prefer low-cost models for bounded writing and summarization

The commander should carry both sets forward, but treat them differently:

```txt
hard constraint violated -> block or ask
soft constraint weakly satisfied -> revise or note tradeoff
```

## Context Handoff

Sub agents should not receive the full conversation history. They receive a bounded context packet:

- goal
- phase
- hard constraints
- soft constraints
- selected wiki refs
- source refs
- tool results
- output contract

They return:

- summary
- decisions
- artifacts
- evidence references
- must-carry-forward references
- context deltas

This preserves links and source evidence without growing the active context forever.

For wiki mutation plans, the concrete handoff object contains:

- review batches, so a large plan can be inspected in stable chunks
- evidence refs, especially `source:*` and `page:*`
- artifact refs, especially `mutation-plan:*`
- must-carry-forward refs, including source/page/entity ids
- discardable context, which names the text that can be dropped after refs are preserved
