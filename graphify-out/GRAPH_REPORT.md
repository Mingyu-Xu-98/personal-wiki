# Graph Report - personal-wiki-harness  (2026-05-06)

## Corpus Check
- 34 files · ~7,356 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 90 nodes · 135 edges · 6 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 14 edges
2. `POST()` - 12 edges
3. `HarnessOrchestrator` - 10 edges
4. `getCurrentUser()` - 9 edges
5. `now()` - 8 edges
6. `loginUser()` - 5 edges
7. `requireUser()` - 5 edges
8. `getPublicUser()` - 4 edges
9. `registerUser()` - 4 edges
10. `selectModelTier()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `AdminPage()` --calls--> `getCurrentUser()`  [INFERRED]
  apps/studio/app/admin/page.tsx → apps/studio/lib/server/auth.ts
- `KnowledgePage()` --calls--> `getCurrentUser()`  [INFERRED]
  apps/studio/app/knowledge/page.tsx → apps/studio/lib/server/auth.ts
- `SitePage()` --calls--> `getCurrentUser()`  [INFERRED]
  apps/studio/app/site/page.tsx → apps/studio/lib/server/auth.ts
- `POST()` --calls--> `logoutUser()`  [INFERRED]
  apps/studio/app/api/runs/route.ts → apps/studio/lib/server/auth.ts
- `POST()` --calls--> `registerUser()`  [INFERRED]
  apps/studio/app/api/runs/route.ts → apps/studio/lib/server/auth.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.15
Nodes (16): createSessionToken(), getCurrentUser(), getPublicUser(), hashPassword(), loginUser(), readSessionToken(), registerUser(), requireAdmin() (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.26
Nodes (5): appendSystemSkillEvidence(), createEmptyContentModel(), createInitialSystemSkillLibrary(), emptyWikiSnapshot(), createSequentialIds()

### Community 2 - "Community 2"
Cohesion: 0.27
Nodes (7): getAllUsers(), GET(), getKnowledge(), getRuns(), getSiteState(), getStats(), getSystemState()

### Community 3 - "Community 3"
Cohesion: 0.35
Nodes (5): selectActiveSystemSkills(), selectModelTier(), HarnessOrchestrator, summarizeWiki(), now()

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (5): logoutUser(), isDesiredArtifact(), POST(), addSource(), createRun()

### Community 5 - "Community 5"
Cohesion: 1.0
Nodes (2): addSource(), load()

## Knowledge Gaps
- **Thin community `Community 5`** (3 nodes): `KnowledgeWorkspace.tsx`, `addSource()`, `load()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Community 2` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Why does `getCurrentUser()` connect `Community 0` to `Community 2`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `GET()` (e.g. with `requireAdmin()` and `getSystemState()`) actually correct?**
  _`GET()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `POST()` (e.g. with `logoutUser()` and `registerUser()`) actually correct?**
  _`POST()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `getCurrentUser()` (e.g. with `AdminPage()` and `KnowledgePage()`) actually correct?**
  _`getCurrentUser()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `now()` (e.g. with `.constructor()` and `.run()`) actually correct?**
  _`now()` has 6 INFERRED edges - model-reasoned connections that need verification._