# Graph Report - personal-wiki-harness  (2026-05-06)

## Corpus Check
- 9 files · ~3,831 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 27 nodes · 44 edges · 4 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]

## God Nodes (most connected - your core abstractions)
1. `HarnessOrchestrator` - 10 edges
2. `selectModelTier()` - 3 edges
3. `createEmptyContentModel()` - 2 edges
4. `emptyWikiSnapshot()` - 2 edges
5. `createSequentialIds()` - 2 edges
6. `summarizeWiki()` - 2 edges
7. `createInitialSystemSkillLibrary()` - 2 edges
8. `selectActiveSystemSkills()` - 2 edges
9. `appendSystemSkillEvidence()` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.36
Nodes (3): createEmptyContentModel(), selectModelTier(), HarnessOrchestrator

### Community 1 - "Community 1"
Cohesion: 0.53
Nodes (1): summarizeWiki()

### Community 2 - "Community 2"
Cohesion: 0.4
Nodes (3): appendSystemSkillEvidence(), createInitialSystemSkillLibrary(), selectActiveSystemSkills()

### Community 3 - "Community 3"
Cohesion: 0.67
Nodes (2): emptyWikiSnapshot(), createSequentialIds()

## Knowledge Gaps
- **Thin community `Community 1`** (6 nodes): `summarizeWiki()`, `index.ts`, `orchestrator.ts`, `types.ts`, `index.ts`, `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 3`** (3 nodes): `emptyWikiSnapshot()`, `createSequentialIds()`, `.constructor()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HarnessOrchestrator` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`?**
  _High betweenness centrality (0.313) - this node is a cross-community bridge._
- **Why does `selectModelTier()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `createEmptyContentModel()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `selectModelTier()` (e.g. with `.createPlan()` and `.createModelRoutingLedger()`) actually correct?**
  _`selectModelTier()` has 2 INFERRED edges - model-reasoned connections that need verification._