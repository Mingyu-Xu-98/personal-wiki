# Graph Report - personal-wiki-harness  (2026-05-29)

## Corpus Check
- 75 files · ~84,764 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 750 nodes · 1782 edges · 20 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 200 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 30 edges
2. `now()` - 30 edges
3. `POST()` - 29 edges
4. `now()` - 28 edges
5. `HarnessOrchestrator` - 27 edges
6. `stateForUser()` - 25 edges
7. `ensureWorkspace()` - 20 edges
8. `addSource()` - 18 edges
9. `ingest()` - 18 edges
10. `stableHash()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `tick()` --calls--> `runBuildWorkerOnce()`  [INFERRED]
  scripts/worker.mjs → apps/studio/lib/server/store.ts
- `waitForJob()` --calls--> `getBuildJobState()`  [INFERRED]
  scripts/smoke-postgres-builds.mjs → apps/studio/lib/server/store.ts
- `waitForJob()` --calls--> `getBuildJobState()`  [INFERRED]
  scripts/smoke-build-jobs.mjs → apps/studio/lib/server/store.ts
- `waitForJob()` --calls--> `getBuildJobState()`  [INFERRED]
  scripts/smoke-postgres-hydrate.mjs → apps/studio/lib/server/store.ts
- `createSharedContextInputs()` --calls--> `GET()`  [INFERRED]
  packages/harness-core/src/commander.ts → apps/studio/app/api/session/route.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (128): submit(), createUsageRecord(), GET(), isBrief(), isDesiredArtifact(), isUploadedFile(), POST(), waitForJob() (+120 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (81): applyWikiMutationPlan(), auditBuildArtifacts(), auditEventLogPresence(), auditMutationPlanCoverage(), auditWorkspaceState(), batchKindForOperation(), batchReviewReasons(), check() (+73 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (61): createEmptyWorkspaceSnapshot(), createWorkspaceToolRegistry(), PersonalWikiEngine, sourceDocumentFromManifestEntry(), toHarnessToolCallRecord(), createLocalWorkspaceAdapter(), getLocalWorkspacePaths(), LocalWorkspaceAdapter (+53 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (45): addEdge(), addNode(), appendSystemSkillEvidence(), createEmptyContentModel(), createInitialSystemSkillLibrary(), createPatchPlan(), createSiteGraph(), createSiteWorkspace() (+37 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (51): createContextPacket(), createDryRunSubAgentExecutor(), createModelBackedSubAgentExecutor(), createOpenAICompatibleAgentRuntime(), createOpenAICompatibleSubAgentExecutor(), createOpenAIResponsesAgentRuntime(), createOpenAIResponsesSubAgentExecutor(), createRoleBasedSubAgentExecutor() (+43 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (24): readTextExcerpt(), avoidWhenRole(), buildToolArguments(), collectItems(), constraintsForRole(), extractExamples(), extractRegistryItems(), findTool() (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (23): createSeedUser(), createSessionToken(), ensureSeedUsers(), getAllUsers(), getAuthRepository(), getCurrentUser(), getPublicUser(), hashPassword() (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (25): assertBuildQuota(), createLocalDeploymentRecord(), createQuotaSnapshot(), estimateBuildCostUnits(), getDesignAssetCacheRoot(), getSiteDesignAssetRegistry(), getSiteDesignComponentRegistry(), isRecord() (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (23): cleanText(), excerpt(), firstUsefulParagraph(), inferAvoidWhen(), inferCapabilities(), inferConstraints(), inferRecommendedFor(), inferRole() (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (17): budgetForRole(), Commander, createDecisionSummary(), createOutputContract(), createPacketInputs(), createPhaseInstructions(), createSharedContextInputs(), retentionPolicyForPhase() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.23
Nodes (20): clean(), getDatabaseUrl(), getPostgresPool(), isPostgresConfigured(), isPostgresStoreEnabled(), queryPostgres(), mirrorBuildJobToPostgres(), mirrorBuildLogToPostgres() (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (11): clearKnowledgeBase(), compilePrompt(), createContextualSuggestions(), latestAssistantMessage(), logDetail(), makeId(), selectKnowledgeBase(), sendMessage() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.27
Nodes (14): buildModelPrompt(), buildReadyAcknowledgement(), buildReply(), callCreateAgentModel(), clampSections(), includesAny(), inferBriefFromText(), mergeUnique() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.33
Nodes (12): assertAllowedUpload(), cleanPositiveInt(), detectTextMediaType(), extractOfficeOpenXml(), extractPdf(), extractTextFromStoredFile(), getObjectStorageConfig(), persistUploadedSourceFile() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (8): addSource(), amendReview(), createBase(), dropUploadFile(), load(), selectBase(), submitMutationReview(), uploadFile()

### Community 15 - "Community 15"
Cohesion: 0.47
Nodes (3): compose(), run(), runPsql()

### Community 16 - "Community 16"
Cohesion: 0.47
Nodes (3): freePort(), listPidsOnPort(), sleep()

### Community 17 - "Community 17"
Cohesion: 0.6
Nodes (3): sleep(), waitForJob(), waitForPublication()

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (2): createBuilderAgentOutput(), createPlannerOutput()

### Community 19 - "Community 19"
Cohesion: 0.83
Nodes (3): sleep(), waitForBuildCounts(), waitForJob()

## Knowledge Gaps
- **Thin community `Community 18`** (5 nodes): `smoke-site-agents.mjs`, `createBuilderAgentOutput()`, `createBuilderOutput()`, `createPlannerOutput()`, `jsonResponse()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Community 0` to `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 12`, `Community 13`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `addSource()` connect `Community 0` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 0` to `Community 12`, `Community 13`, `Community 6`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `GET()` (e.g. with `.handleMessage()` and `createSharedContextInputs()`) actually correct?**
  _`GET()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `now()` (e.g. with `.createDispatch()` and `.createPacket()`) actually correct?**
  _`now()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `POST()` (e.g. with `logoutUser()` and `registerUser()`) actually correct?**
  _`POST()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `now()` (e.g. with `.constructor()` and `.run()`) actually correct?**
  _`now()` has 6 INFERRED edges - model-reasoned connections that need verification._