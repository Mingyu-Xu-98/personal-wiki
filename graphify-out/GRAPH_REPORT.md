# Graph Report - personal-wiki-harness  (2026-05-06)

## Corpus Check
- 8 files · ~2,039 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 18 nodes · 22 edges · 3 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]

## God Nodes (most connected - your core abstractions)
1. `HarnessOrchestrator` - 6 edges
2. `createEmptyContentModel()` - 2 edges
3. `emptyWikiSnapshot()` - 2 edges
4. `createSequentialIds()` - 2 edges
5. `summarizeWiki()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.47
Nodes (2): HarnessOrchestrator, summarizeWiki()

### Community 1 - "Community 1"
Cohesion: 0.6
Nodes (1): createEmptyContentModel()

### Community 2 - "Community 2"
Cohesion: 0.67
Nodes (2): emptyWikiSnapshot(), createSequentialIds()

## Knowledge Gaps
- **Thin community `Community 0`** (6 nodes): `HarnessOrchestrator`, `.createContextLedger()`, `.createPlan()`, `.getState()`, `.run()`, `summarizeWiki()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 1`** (5 nodes): `createEmptyContentModel()`, `orchestrator.ts`, `types.ts`, `index.ts`, `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 2`** (3 nodes): `emptyWikiSnapshot()`, `createSequentialIds()`, `.constructor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HarnessOrchestrator` connect `Community 0` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.243) - this node is a cross-community bridge._
- **Why does `createEmptyContentModel()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `summarizeWiki()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._