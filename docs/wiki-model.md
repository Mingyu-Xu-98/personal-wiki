# Wiki Model

The wiki sits between immutable raw sources and compiled site artifacts. It is maintained by the harness and the model, but it should remain readable as ordinary markdown and inspectable as structured records.

## Invariants

- Raw source content is immutable after capture.
- Generated wiki pages may be rewritten as understanding improves.
- `index.md` is content-oriented and should remain the first navigation surface.
- `log.md` is chronological and append-only.
- Entity and file links use explicit schemes such as `entity://` and `file://`.
- Inline annotation may exist, but stripped annotation must preserve raw content exactly.

## Operations

### Ingest

Read one or more source documents, extract entities and relations, update wiki pages, update the index, and append log events.

Engineering rule: ingest should be a two-stage mutation. First create a `WikiMutationPlan`, then apply the plan to `WikiSnapshot`, `index.wiki`, `log.wiki`, and generated wiki pages. This makes human review and later model-driven ontology extraction possible without turning ingest into a black box.

### Query

Read the wiki first, then drill into sources only when evidence is needed. Valuable answers can be filed back into the wiki.

### Lint

Detect contradictions, stale claims, orphan pages, missing links, uncited claims, and important unnamed concepts.

## Records

The model starts with these durable concepts:

- `SourceDocument`
- `WikiEntity`
- `WikiPage`
- `WikiRelation`
- `WikiEvent`
- `WikiLintIssue`

They are intentionally transport-friendly TypeScript types rather than ORM models.

## Local Source Handling

For the local CLI, a source document does not have to mean "copy the whole file into the workspace." Large local files should usually be represented as referenced sources:

- `contentMode: "referenced"` means the original file remains at its `file://` URI.
- `contentMode: "excerpt"` means the wiki has cached a bounded text extraction or summary.
- `contentMode: "metadata-only"` means the system has linked the file but has not extracted useful text yet.
- `contentMode: "inline"` remains useful for hosted uploads and small text documents.

The durable wiki should still be compact and readable. It stores source summaries, entity pages, relation records, `index.wiki`, and `log.wiki`. The raw source is opened only when extraction, verification, citation, or repair requires direct evidence.

In Studio alpha, uploaded text-like files are written to local object storage and referenced by `object://...`. PostgreSQL stores the source hash, content mode, bounded content, metadata, and `object_key`; it does not need to hold the full file body for larger uploads.

## Ontology Extraction

LLM analysis should extract a candidate ontology from sources: entities, events, claims, skills, tools, and relations. These candidates must keep evidence references back to source documents and wiki pages.

The wiki should distinguish between:

- candidate ontology extracted by the model
- accepted ontology merged into durable wiki pages
- contested or deprecated claims found during lint

This avoids turning one model pass into permanent truth while still allowing the wiki to become structured enough for site building, search, and verification.
