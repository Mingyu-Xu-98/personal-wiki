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
