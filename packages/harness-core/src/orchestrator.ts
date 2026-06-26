import {
  createDryRunSubAgentExecutor,
  defaultModelRoutingPolicy,
  selectModelTier,
  type ModelRoutingDecision,
  type ModelRoutingPolicy,
  type SubAgentArtifact,
  type SubAgentExecutor,
  type SubAgentTrace
} from "../../agent-runtime/src/index.ts";
import {
  appendSystemSkillEvidence,
  createInitialSystemSkillLibrary,
  selectActiveSystemSkills,
  type SystemMetaSkill,
  type SystemSkillLibrary
} from "../../meta-skill-core/src/index.ts";
import {
  createEmptyContentModel,
  createPatchPlan,
  createSiteGraph,
  createSiteWorkspace,
  type ContentBlock,
  type ContentModel,
  type DesignUsagePlan,
  type SiteArtifact,
  type SiteArtifactFile,
  type SectionSpec,
  type SiteNavigationItem,
  type SitePlan,
  type SiteRoute
} from "../../site-compiler/src/index.ts";
import { emptyWikiSnapshot, type WikiLintIssue, type WikiSnapshot } from "../../wiki-core/src/index.ts";
import {
  createWorkflowPlanSteps,
  defaultWorkflowSpec,
  selectWorkflowPhasesForIntent,
  type WorkflowSpec
} from "./workflow.ts";
import { Commander } from "./commander.ts";
import { summarizeObservationValue } from "./observability.ts";
import type {
  BuildIntent,
  BuildVersion,
  CommanderPhase,
  ContextLedger,
  HarnessClock,
  HarnessIdGenerator,
  HarnessLifecycleHook,
  HarnessObservationEvent,
  HarnessObserver,
  HarnessRegistryRef,
  HarnessPlan,
  HarnessRun,
  HarnessRuntimeState,
  RunContextManifest,
  RunReflection,
  ToolCallRecord
} from "./types.ts";

export type HarnessOrchestratorOptions = {
  wiki?: WikiSnapshot;
  systemSkills?: SystemSkillLibrary;
  modelRoutingPolicy?: ModelRoutingPolicy;
  workflowSpec?: WorkflowSpec;
  subAgentExecutor?: SubAgentExecutor;
  lifecycleHooks?: HarnessLifecycleHook[];
  observers?: HarnessObserver[];
  clock?: HarnessClock;
  ids?: HarnessIdGenerator;
};

export class HarnessOrchestrator {
  private readonly clock: HarnessClock;
  private readonly ids: HarnessIdGenerator;
  private readonly workflowSpec: WorkflowSpec;
  private readonly subAgentExecutor: SubAgentExecutor;
  private readonly lifecycleHooks: HarnessLifecycleHook[];
  private readonly observers: HarnessObserver[];
  private readonly state: HarnessRuntimeState;

  constructor(options: HarnessOrchestratorOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.ids = options.ids ?? createSequentialIds();
    this.workflowSpec = options.workflowSpec ?? defaultWorkflowSpec;
    this.subAgentExecutor =
      options.subAgentExecutor ?? createDryRunSubAgentExecutor({ clock: this.clock });
    this.lifecycleHooks = options.lifecycleHooks ?? [];
    this.observers = options.observers ?? [];
    const bootTime = this.clock.now();
    this.state = {
      wiki: options.wiki ?? emptyWikiSnapshot(),
      systemSkills: options.systemSkills ?? createInitialSystemSkillLibrary(bootTime),
      modelRoutingPolicy: options.modelRoutingPolicy ?? defaultModelRoutingPolicy,
      runs: [],
      versions: [],
      reflections: []
    };
  }

  getState(): HarnessRuntimeState {
    return structuredClone(this.state);
  }

  replaceWikiSnapshot(wiki: WikiSnapshot): void {
    this.state.wiki = structuredClone(wiki);
  }

  async run(intentInput: Omit<BuildIntent, "id" | "createdAt">): Promise<HarnessRun> {
    const intent: BuildIntent = {
      ...intentInput,
      id: this.ids.next("intent"),
      createdAt: this.clock.now()
    };

    const run: HarnessRun = {
      id: this.ids.next("run"),
      state: "created",
      intent,
      toolCalls: [],
      observabilityEvents: []
    };

    this.state.runs.push(run);

    try {
      await this.emitObservation(run, {
        target: "run",
        type: "run.started",
        status: "started",
        message: `Started harness run for "${intent.title}".`,
        inputSummary: summarizeObservationValue({
          title: intent.title,
          desiredArtifact: intent.desiredArtifact ?? "site",
          knowledgeBaseId: intent.knowledgeBaseId,
          baseVersionId: intent.baseVersionId
        })
      });

      run.state = "planning";
      await this.emitPhaseStarted(run, "intent-clarification", "Creating context ledger, workflow plan, and commander dispatch.");
      run.contextLedger = this.createContextLedger(intent);
      run.plan = this.createPlan(intent);
      const activeSystemSkills = this.selectSystemSkills(intent);
      await this.emitModelRouting(run, run.contextLedger.modelRouting);
      const dispatch = new Commander({
        workflowSpec: this.workflowSpec,
        clock: this.clock,
        ids: this.ids
      }).createDispatch({
        runId: run.id,
        intent,
        contextLedger: run.contextLedger,
        wiki: this.state.wiki,
        systemSkills: activeSystemSkills
      });
      run.commanderDecisions = dispatch.decisions;
      await this.emitPhaseCompleted(run, "intent-clarification", `Prepared ${dispatch.decisions.length} commander decisions.`);
      run.subAgentTraces = await this.executeSubAgentTraces(run, dispatch.subAgentTraces);
      run.toolCalls = createHarnessToolCallRecords(run.id, run.subAgentTraces);
      run.contextLedger.commanderDecisionIds = dispatch.decisions.map((decision) => decision.id);
      run.contextLedger.preservedReferenceIds = uniqueStrings([
        ...dispatch.preservedReferenceIds,
        ...run.subAgentTraces.flatMap((trace) => trace.result?.mustCarryForwardRefs ?? [])
      ]);

      run.state = "executing";
      await this.emitPhaseStarted(run, "site-generation", "Consuming sub-agent artifacts and creating build outputs.");
      const handoffLintIssues = this.verifySubAgentHandoffs(run.subAgentTraces);
      const consumedOutputs = this.consumeSubAgentArtifacts({
        intent,
        contextLedger: run.contextLedger,
        traces: run.subAgentTraces
      });
      const contentModel = consumedOutputs.contentModel;
      const designUsagePlan = consumedOutputs.designUsagePlan;
      const sitePlan = consumedOutputs.sitePlan;
      const siteArtifact = consumedOutputs.siteArtifact;
      const verificationInput: {
        intent: BuildIntent;
        traces: SubAgentTrace[];
        contentModel: ContentModel;
        designUsagePlan?: DesignUsagePlan;
        sitePlan: SitePlan;
        siteArtifact?: SiteArtifact;
      } = {
        intent,
        traces: run.subAgentTraces,
        contentModel,
        sitePlan
      };
      if (designUsagePlan) verificationInput.designUsagePlan = designUsagePlan;
      if (siteArtifact) verificationInput.siteArtifact = siteArtifact;
      const verificationLintIssues = this.verifyBuildOutputs(verificationInput);
      const artifactLintIssues = [...handoffLintIssues, ...consumedOutputs.lintIssues, ...verificationLintIssues];
      await this.emitArtifactObservations(run, {
        contentModel,
        designUsagePlan,
        sitePlan,
        siteArtifact
      });
      await this.emitPhaseCompleted(run, "site-generation", "Build outputs were assembled from agent artifacts.");

      run.state = "verifying";
      await this.emitPhaseStarted(run, "verification", "Checking grounding, design usage, artifact shape, and publish readiness.");
      await this.emitObservation(run, {
        target: "verification",
        type: artifactLintIssues.some((issue) => issue.severity === "error")
          ? "verification.failed"
          : "verification.completed",
        status: artifactLintIssues.some((issue) => issue.severity === "error") ? "blocked" : "completed",
        phase: "verification",
        message: `Verification completed with ${artifactLintIssues.length} lint issue(s).`,
        outputSummary: summarizeObservationValue(
          artifactLintIssues.map((issue) => ({
            severity: issue.severity,
            code: issue.code,
            message: issue.message
          }))
        ),
        data: {
          lintIssueCount: artifactLintIssues.length,
          errorCount: artifactLintIssues.filter((issue) => issue.severity === "error").length,
          warningCount: artifactLintIssues.filter((issue) => issue.severity === "warning").length
        }
      });
      const blockingIssue = artifactLintIssues.find((issue) => issue.severity === "error");
      if (blockingIssue) {
        await this.emitPhaseFailed(run, "verification", blockingIssue.message);
        throw new Error(`Build verification blocked versioning: ${blockingIssue.message}`);
      }
      await this.emitPhaseCompleted(run, "verification", "No blocking verification issue found.");
      run.state = "reflecting";
      await this.emitPhaseStarted(run, "reflection", "Recording reflection and system skill evidence.");
      run.reflection = this.createReflection(run, activeSystemSkills);
      this.state.reflections.push(run.reflection);
      this.recordSystemSkillEvidence(run, activeSystemSkills);
      await this.emitObservation(run, {
        target: "reflection",
        type: "reflection.created",
        status: "completed",
        phase: "reflection",
        message: run.reflection.summary,
        data: {
          findingCount: run.reflection.findings.length,
          candidateSystemSkillIds: run.reflection.candidateSystemSkillIds
        }
      });
      await this.emitPhaseCompleted(run, "reflection", "Reflection and system skill evidence were recorded.");

      const baseVersion = intent.baseVersionId
        ? this.state.versions.find((version) => version.id === intent.baseVersionId)
        : undefined;
      const versionId = this.ids.next("version");
      const createdAt = this.clock.now();
      const siteId = baseVersion?.siteWorkspace?.siteId ?? this.ids.next("site");
      const siteGraphId = this.ids.next("site-graph");
      const siteWorkspaceInput: {
        id: string;
        siteId: string;
        versionId: string;
        createdAt: string;
        title: string;
        knowledgeBaseId?: string;
        knowledgeBaseName?: string;
        baseVersionId?: string;
        graphId: string;
      } = {
        id: this.ids.next("site-workspace"),
        siteId,
        versionId,
        createdAt,
        title: contentModel.title,
        graphId: siteGraphId
      };
      if (intent.knowledgeBaseId) siteWorkspaceInput.knowledgeBaseId = intent.knowledgeBaseId;
      if (intent.knowledgeBaseName) siteWorkspaceInput.knowledgeBaseName = intent.knowledgeBaseName;
      if (intent.baseVersionId) siteWorkspaceInput.baseVersionId = intent.baseVersionId;
      const siteWorkspace = createSiteWorkspace(siteWorkspaceInput);
      const siteGraphInput: {
        id: string;
        siteId: string;
        versionId: string;
        createdAt: string;
        title: string;
        contentModel: ContentModel;
        designUsagePlan?: DesignUsagePlan;
        sitePlan: SitePlan;
        siteArtifact?: SiteArtifact;
        parentVersionId?: string;
      } = {
        id: siteGraphId,
        siteId,
        versionId,
        createdAt,
        title: contentModel.title,
        contentModel,
        sitePlan
      };
      if (designUsagePlan) siteGraphInput.designUsagePlan = designUsagePlan;
      if (siteArtifact) siteGraphInput.siteArtifact = siteArtifact;
      if (intent.baseVersionId) siteGraphInput.parentVersionId = intent.baseVersionId;
      const siteGraph = createSiteGraph(siteGraphInput);
      const patchPlan = baseVersion && intent.revisionReason
        ? createPatchPlan({
            id: this.ids.next("patch-plan"),
            baseVersionId: baseVersion.id,
            targetVersionId: versionId,
            createdAt,
            userRequest: intent.revisionReason,
            ...(baseVersion.siteGraph ? { baseGraph: baseVersion.siteGraph } : {}),
            targetGraph: siteGraph
          })
        : undefined;

      const version: BuildVersion = {
        id: versionId,
        runId: run.id,
        createdAt,
        summary: intent.baseVersionId
          ? `Created revised build version for "${intent.title}".`
          : `Created initial build version for "${intent.title}".`,
        contentModel,
        ...(designUsagePlan ? { designUsagePlan } : {}),
        sitePlan,
        ...(siteArtifact ? { siteArtifact } : {}),
        siteWorkspace,
        siteGraph,
        ...(patchPlan ? { patchPlan } : {}),
        runContextManifest: run.contextLedger.runContextManifest,
        toolCalls: run.toolCalls,
        lintIssues: artifactLintIssues,
        appliedSystemSkillIds: activeSystemSkills.map((skill) => skill.id)
      };
      if (intent.baseVersionId) version.parentVersionId = intent.baseVersionId;
      if (intent.revisionReason) version.changeSummary = intent.revisionReason;

      run.state = "versioned";
      run.buildVersion = version;
      this.state.versions.push(version);
      await this.emitObservation(run, {
        target: "version",
        type: "version.created",
        status: "completed",
        phase: "versioning",
        message: `Created build version ${version.id}.`,
        artifactRefs: [
          `version:${version.id}`,
          ...(version.siteArtifact ? [`site-artifact:${version.siteArtifact.id}`] : []),
          ...(version.designUsagePlan ? [`design-usage-plan:${version.designUsagePlan.id}`] : [])
        ],
        data: {
          versionId: version.id,
          siteId,
          lintIssueCount: version.lintIssues.length
        }
      });
      await this.emitObservation(run, {
        target: "run",
        type: "run.completed",
        status: "completed",
        message: `Harness run ${run.id} completed.`,
        data: {
          versionId: version.id,
          eventCount: run.observabilityEvents?.length ?? 0
        }
      });

      return structuredClone(run);
    } catch (error) {
      run.state = "failed";
      run.error = error instanceof Error ? error.message : String(error);
      await this.emitObservation(run, {
        target: "run",
        type: "run.failed",
        status: "failed",
        message: run.error,
        outputSummary: summarizeObservationValue({ error: run.error })
      });
      return structuredClone(run);
    }
  }

  private async emitObservation(
    run: HarnessRun,
    input: Omit<HarnessObservationEvent, "id" | "runId" | "intentId" | "createdAt">
  ): Promise<void> {
    const event: HarnessObservationEvent = {
      id: this.ids.next("obs"),
      runId: run.id,
      intentId: run.intent.id,
      createdAt: this.clock.now(),
      ...input
    };
    run.observabilityEvents = [...(run.observabilityEvents ?? []), event];

    for (const observer of this.observers) {
      try {
        await observer.record(event);
      } catch (error) {
        console.warn("[harness-observability] Observer failed.", error);
      }
    }
    for (const hook of this.lifecycleHooks) {
      try {
        await hook.handle(event);
      } catch (error) {
        console.warn(`[harness-observability] Lifecycle hook ${hook.name} failed.`, error);
      }
    }
  }

  private async emitPhaseStarted(run: HarnessRun, phase: CommanderPhase, message: string): Promise<void> {
    await this.emitObservation(run, {
      target: "phase",
      type: "phase.started",
      status: "started",
      phase,
      message
    });
  }

  private async emitPhaseCompleted(run: HarnessRun, phase: CommanderPhase, message: string): Promise<void> {
    await this.emitObservation(run, {
      target: "phase",
      type: "phase.completed",
      status: "completed",
      phase,
      message
    });
  }

  private async emitPhaseFailed(run: HarnessRun, phase: CommanderPhase, message: string): Promise<void> {
    await this.emitObservation(run, {
      target: "phase",
      type: "phase.failed",
      status: "failed",
      phase,
      message
    });
  }

  private async emitModelRouting(run: HarnessRun, decisions: ModelRoutingDecision[]): Promise<void> {
    for (const decision of decisions) {
      await this.emitObservation(run, {
        target: "model",
        type: "model.routing.selected",
        status: "completed",
        modelRole: decision.role,
        modelTier: decision.tier,
        message: `${decision.role} routes to ${decision.tier} model tier.`,
        data: {
          reason: decision.reason
        }
      });
    }
  }

  private async emitArtifactObservations(
    run: HarnessRun,
    input: {
      contentModel: ContentModel;
      designUsagePlan?: DesignUsagePlan | undefined;
      sitePlan: SitePlan;
      siteArtifact?: SiteArtifact | undefined;
    }
  ): Promise<void> {
    await this.emitObservation(run, {
      target: "artifact",
      type: "artifact.created",
      status: "completed",
      phase: "site-generation",
      message: `Created content model ${input.contentModel.id}.`,
      artifactRefs: [`content-model:${input.contentModel.id}`],
      data: {
        title: input.contentModel.title,
        sectionCount: input.contentModel.sections.length,
        sourcePageIds: input.contentModel.sourcePageIds
      }
    });
    if (input.designUsagePlan) {
      await this.emitObservation(run, {
        target: "artifact",
        type: "artifact.created",
        status: "completed",
        phase: "site-generation",
        message: `Created design usage plan ${input.designUsagePlan.id}.`,
        artifactRefs: [`design-usage-plan:${input.designUsagePlan.id}`],
        data: {
          selectedAssets: input.designUsagePlan.selectedAssets.map((selection) => selection.assetId),
          rejectedAssets: input.designUsagePlan.rejectedAssets.map((rejection) => rejection.assetId)
        }
      });
      for (const selection of input.designUsagePlan.selectedAssets) {
        await this.emitObservation(run, {
          target: "skill",
          type: "skill.selected",
          status: "completed",
          phase: "site-generation",
          message: `Selected design asset ${selection.assetId} for ${selection.role}.`,
          artifactRefs: [`design-asset:${selection.assetId}`],
          data: {
            role: selection.role,
            targetSectionIds: selection.targetSectionIds,
            reason: selection.reason,
            constraints: selection.constraints
          }
        });
      }
    }
    await this.emitObservation(run, {
      target: "artifact",
      type: "artifact.created",
      status: "completed",
      phase: "site-generation",
      message: `Created site plan ${input.sitePlan.id}.`,
      artifactRefs: [`site-plan:${input.sitePlan.id}`],
      data: {
        routes: input.sitePlan.routes.map((route) => route.path),
        navigation: input.sitePlan.navigation.map((item) => item.label)
      }
    });
    if (input.siteArtifact) {
      await this.emitObservation(run, {
        target: "artifact",
        type: "artifact.created",
        status: "completed",
        phase: "site-generation",
        message: `Created site artifact ${input.siteArtifact.id}.`,
        artifactRefs: [`site-artifact:${input.siteArtifact.id}`],
        data: {
          format: input.siteArtifact.format,
          files: input.siteArtifact.files.map((file) => file.path)
        }
      });
    }
  }

  private createContextLedger(intent: BuildIntent): ContextLedger {
    const intentKind = intent.desiredArtifact ?? "site";
    const activeSystemSkills = this.selectSystemSkills(intent);
    const modelRouting = this.createModelRoutingLedger();
    const runContextManifest = this.createRunContextManifest(intent);

    return {
      id: this.ids.next("ledger"),
      intentId: intent.id,
      createdAt: this.clock.now(),
      wikiSnapshotSummary: summarizeWiki(this.state.wiki),
      selectedPageIds: this.state.wiki.pages.slice(0, 12).map((page) => page.id),
      selectedSourceIds: this.state.wiki.sources.slice(0, 12).map((source) => source.id),
      selectedSystemSkillIds: activeSystemSkills.map((skill) => skill.id),
      modelRouting,
      runContextManifest,
      notes: [
        intent.knowledgeBaseName
          ? `Using isolated knowledge base: ${intent.knowledgeBaseName} (${intent.knowledgeBaseId ?? "unknown id"}).`
          : "Using the default isolated knowledge base.",
        `Selected ${activeSystemSkills.length} system meta skills for ${intentKind} intent.`,
        "Commander, planning, reflection, and system skill promotion use the strong tier by default.",
        "Bounded code, summarization, retrieval, and website assistant calls can use cheaper tiers when verification is available.",
        "Initial runtime uses deterministic context selection.",
        "Future versions can replace this with model-guided context assembly."
      ]
    };
  }

  private createRunContextManifest(intent: BuildIntent): RunContextManifest {
    const wikiSnapshotId = `wiki_${stableHash(JSON.stringify({
      sourceIds: this.state.wiki.sources.map((source) => source.id).sort(),
      pageIds: this.state.wiki.pages.map((page) => page.id).sort(),
      entityIds: this.state.wiki.entities.map((entity) => entity.id).sort(),
      relationIds: this.state.wiki.relations.map((relation) => relation.id).sort()
    }))}`;
    const sourceSnapshotId = `sources_${stableHash(JSON.stringify(
      this.state.wiki.sources.map((source) => ({
        id: source.id,
        hash: source.contentHash,
        uri: source.uri
      })).sort((a, b) => a.id.localeCompare(b.id))
    ))}`;
    const registryRefs: HarnessRegistryRef[] = [
      {
        kind: "wiki-snapshot",
        id: wikiSnapshotId,
        title: "Selected Wiki Snapshot",
        summary: summarizeWiki(this.state.wiki)
      },
      {
        kind: "source-snapshot",
        id: sourceSnapshotId,
        title: "Selected Source Snapshot",
        summary: `${this.state.wiki.sources.length} source refs are available through source/wiki tools.`
      },
      {
        kind: "design-system",
        id: "studio-design-system-v1",
        title: "Studio Design System",
        summary: "Shared UI tokens, spacing, typography, and page layout rules for Studio-facing site drafts.",
        version: "0.1.0"
      },
      {
        kind: "component-registry",
        id: "studio-design-asset-registry-v1",
        title: "Studio Design Asset Registry",
        summary:
          "Shared UI components, MCP registry items, design skills, templates, and verifier tools available to site planning and building agents.",
        version: "0.1.0"
      },
      {
        kind: "tool-registry",
        id: `${this.workflowSpec.id}-tools-${this.workflowSpec.version}`,
        title: "Workflow Tool Registry",
        summary: "Phase-gated tool names from the active workflow spec.",
        version: this.workflowSpec.version
      },
      {
        kind: "style-guide",
        id: "public-site-style-guide-v1",
        title: "Public Site Style Guide",
        summary: "User-facing language, preview, publishing, and version-history rules.",
        version: "0.1.0"
      },
      {
        kind: "build-intent",
        id: intent.id,
        title: intent.title,
        summary: intent.prompt.slice(0, 240)
      }
    ];

    if (intent.baseVersionId) {
      registryRefs.push({
        kind: "base-version",
        id: intent.baseVersionId,
        title: "Base Build Version",
        summary: intent.revisionReason ?? "This run revises an existing build version."
      });
    }

    const manifest: RunContextManifest = {
      id: `manifest_${stableHash(`${intent.id}:${wikiSnapshotId}:${sourceSnapshotId}:${intent.baseVersionId ?? "initial"}`)}`,
      createdAt: this.clock.now(),
      intentId: intent.id,
      wikiSnapshotId,
      sourceSnapshotId,
      designSystemId: "studio-design-system-v1",
      componentRegistryId: "studio-design-asset-registry-v1",
      toolRegistryId: `${this.workflowSpec.id}-tools-${this.workflowSpec.version}`,
      styleGuideId: "public-site-style-guide-v1",
      buildIntentId: intent.id,
      registryRefs,
      requiredCarryForwardRefs: []
    };
    if (intent.knowledgeBaseId) manifest.knowledgeBaseId = intent.knowledgeBaseId;
    if (intent.knowledgeBaseName) manifest.knowledgeBaseName = intent.knowledgeBaseName;
    if (intent.baseVersionId) manifest.baseVersionId = intent.baseVersionId;
    manifest.requiredCarryForwardRefs = [
      `run-context-manifest:${manifest.id}`,
      `wiki-snapshot:${manifest.wikiSnapshotId}`,
      `source-snapshot:${manifest.sourceSnapshotId}`,
      `design-system:${manifest.designSystemId}`,
      `component-registry:${manifest.componentRegistryId}`,
      `tool-registry:${manifest.toolRegistryId}`,
      `style-guide:${manifest.styleGuideId}`,
      `build-intent:${manifest.buildIntentId}`,
      ...(manifest.baseVersionId ? [`base-version:${manifest.baseVersionId}`] : [])
    ];
    return manifest;
  }

  private async executeSubAgentTraces(run: HarnessRun, traces: SubAgentTrace[]): Promise<SubAgentTrace[]> {
    const executed: SubAgentTrace[] = [];
    for (const trace of traces) {
      await this.emitObservation(run, {
        target: "agent",
        type: "agent.dispatched",
        status: "started",
        phase: asCommanderPhase(trace.packet.workflowPhaseId),
        agentRole: trace.role,
        traceId: trace.id,
        message: `${trace.role} received context packet ${trace.packet.id}.`,
        inputSummary: summarizeObservationValue({
          packetId: trace.packet.id,
          inputCharCount: trace.packet.inputCharCount,
          allowedToolNames: trace.packet.allowedToolNames ?? [],
          requiredOutputNames: trace.packet.requiredOutputNames ?? [],
          requiredCarryForwardRefs: trace.packet.requiredCarryForwardRefs ?? []
        })
      });
      await this.emitObservation(run, {
        target: "agent",
        type: "agent.started",
        status: "started",
        phase: asCommanderPhase(trace.packet.workflowPhaseId),
        agentRole: trace.role,
        traceId: trace.id,
        message: `${trace.role} started.`
      });
      const executedTrace = await this.subAgentExecutor.execute(trace);
      await this.emitObservation(run, {
        target: "agent",
        type: executedTrace.status === "failed" ? "agent.failed" : "agent.completed",
        status: toObservationStatus(executedTrace.status),
        phase: asCommanderPhase(executedTrace.packet.workflowPhaseId),
        agentRole: executedTrace.role,
        traceId: executedTrace.id,
        message: `${executedTrace.role} ${executedTrace.status}.`,
        durationMs: durationMs(executedTrace.startedAt, executedTrace.finishedAt),
        outputSummary: executedTrace.result?.summary ?? "",
        artifactRefs: executedTrace.result?.artifactRefs ?? [],
        data: {
          artifactKinds: executedTrace.result?.artifacts.map((artifact) => artifact.kind) ?? [],
          toolCallCount: executedTrace.result?.toolCalls.length ?? 0,
          mustCarryForwardRefs: executedTrace.result?.mustCarryForwardRefs ?? []
        }
      });
      for (const toolCall of executedTrace.result?.toolCalls ?? []) {
        await this.emitObservation(run, {
          target: "tool",
          type: toolCall.status === "failed" ? "tool.failed" : "tool.completed",
          status: toolCall.status,
          phase: asCommanderPhase(executedTrace.packet.workflowPhaseId),
          agentRole: executedTrace.role,
          traceId: executedTrace.id,
          toolName: toolCall.toolName,
          message: `${executedTrace.role} tool ${toolCall.toolName} ${toolCall.status}.`,
          inputSummary: summarizeObservationValue(toolCall.input),
          outputSummary: toolCall.error ?? summarizeObservationValue(toolCall.output),
          durationMs: durationMs(toolCall.startedAt, toolCall.finishedAt),
          data: {
            callId: toolCall.callId,
            error: toolCall.error
          }
        });
      }
      executed.push(executedTrace);
    }
    return executed;
  }

  private verifySubAgentHandoffs(traces: SubAgentTrace[]): WikiLintIssue[] {
    const lintIssues: WikiLintIssue[] = [];
    const requiredInputKinds = [
      "run-context-manifest",
      "design-system",
      "component-registry",
      "tool-registry",
      "style-guide"
    ] as const;

    for (const trace of traces) {
      const packetInputKinds = new Set(trace.packet.inputs.map((input) => input.kind));
      for (const inputKind of requiredInputKinds) {
        if (!packetInputKinds.has(inputKind)) {
          lintIssues.push(createArtifactLintIssue({
            code: "missing-shared-context-input",
            message: `${trace.role} packet ${trace.packet.id} is missing shared ${inputKind} context.`
          }));
        }
      }

      const carriedRefs = new Set(trace.result?.mustCarryForwardRefs ?? []);
      for (const ref of trace.packet.requiredCarryForwardRefs ?? []) {
        if (!carriedRefs.has(ref)) {
          lintIssues.push(createArtifactLintIssue({
            code: "missing-carry-forward-ref",
            message: `${trace.role} result for packet ${trace.packet.id} did not carry required ref ${ref}.`
          }));
        }
      }
    }

    return lintIssues;
  }

  private consumeSubAgentArtifacts(input: {
    intent: BuildIntent;
    contextLedger: ContextLedger;
    traces: SubAgentTrace[];
  }): {
    contentModel: ContentModel;
    designUsagePlan?: DesignUsagePlan;
    sitePlan: SitePlan;
    siteArtifact?: SiteArtifact;
    lintIssues: WikiLintIssue[];
  } {
    const lintIssues: WikiLintIssue[] = [];
    const baseContentModel = createEmptyContentModel(this.ids.next("content"), input.intent.title);
    baseContentModel.thesis = input.intent.prompt;
    baseContentModel.audience = input.intent.audience ?? "self";
    baseContentModel.sourcePageIds = input.contextLedger.selectedPageIds;

    const contentModelArtifact = findLastArtifact(input.traces, "content-model");
    const contentModelInput: {
      base: ContentModel;
      artifact?: SubAgentArtifact;
      lintIssues: WikiLintIssue[];
    } = {
      base: baseContentModel,
      lintIssues
    };
    if (contentModelArtifact) contentModelInput.artifact = contentModelArtifact;
    const contentModel = this.mergeContentModelArtifact(contentModelInput);

    const baseSitePlan: SitePlan = {
      id: this.ids.next("site-plan"),
      contentModelId: contentModel.id,
      generatedAt: this.clock.now(),
      routes: [
        {
          path: "/",
          title: contentModel.title,
          sectionIds: contentModel.sections.map((section) => section.id)
        }
      ],
      navigation: [
        {
          label: "Home",
          href: "/"
        }
      ]
    };
    const sitePlanArtifact = findLastArtifact(input.traces, "site-plan");
    const sitePlanInput: {
      base: SitePlan;
      artifact?: SubAgentArtifact;
      contentModel: ContentModel;
      lintIssues: WikiLintIssue[];
    } = {
      base: baseSitePlan,
      contentModel,
      lintIssues
    };
    if (sitePlanArtifact) sitePlanInput.artifact = sitePlanArtifact;
    const sitePlan = this.mergeSitePlanArtifact(sitePlanInput);

    const designUsagePlanArtifact = findLastArtifact(input.traces, "design-usage-plan");
    const designUsagePlanInput: {
      artifact?: SubAgentArtifact;
      contentModel: ContentModel;
      lintIssues: WikiLintIssue[];
    } = {
      contentModel,
      lintIssues
    };
    if (designUsagePlanArtifact) designUsagePlanInput.artifact = designUsagePlanArtifact;
    const designUsagePlan = this.mergeDesignUsagePlanArtifact(designUsagePlanInput);

    const htmlArtifact = findLastArtifact(input.traces, "html");
    const artifactRefs = uniqueStrings(input.traces.flatMap((trace) => trace.result?.artifactRefs ?? []));
    const htmlArtifactInput: {
      artifact?: SubAgentArtifact;
      sourceArtifactRefs: string[];
      lintIssues: WikiLintIssue[];
    } = {
      sourceArtifactRefs: artifactRefs,
      lintIssues
    };
    if (htmlArtifact) htmlArtifactInput.artifact = htmlArtifact;
    const siteArtifact = this.createSiteArtifactFromHtmlArtifact(htmlArtifactInput);

    return {
      contentModel,
      ...(designUsagePlan ? { designUsagePlan } : {}),
      sitePlan,
      ...(siteArtifact ? { siteArtifact } : {}),
      lintIssues
    };
  }

  private mergeContentModelArtifact(input: {
    base: ContentModel;
    artifact?: SubAgentArtifact;
    lintIssues: WikiLintIssue[];
  }): ContentModel {
    if (!input.artifact || !isRecord(input.artifact.data)) return input.base;

    const knownPageIds = new Set(this.state.wiki.pages.map((page) => page.id));
    const knownEntityIds = new Set(this.state.wiki.entities.map((entity) => entity.id));
    const data = input.artifact.data;
    const title = getString(data, "title") || input.base.title;
    const thesis = getString(data, "thesis") || input.base.thesis;
    const audience = getString(data, "audience") || input.base.audience;
    const sourcePageIds = filterKnownIds({
      ids: getStringArray(data, "sourcePageIds"),
      knownIds: knownPageIds,
      fallback: input.base.sourcePageIds,
      lintIssues: input.lintIssues,
      code: "unknown-content-model-page-ref",
      messagePrefix: "Content model referenced an unknown wiki page"
    });
    const sections = getRecordArray(data, "sections")
      .slice(0, 8)
      .map((section, index) =>
        this.sanitizeSectionSpec({
          section,
          index,
          knownPageIds,
          knownEntityIds,
          lintIssues: input.lintIssues
        })
      );

    return {
      id: input.base.id,
      title,
      thesis,
      audience,
      sourcePageIds,
      sections
    };
  }

  private mergeSitePlanArtifact(input: {
    base: SitePlan;
    artifact?: SubAgentArtifact;
    contentModel: ContentModel;
    lintIssues: WikiLintIssue[];
  }): SitePlan {
    if (!input.artifact || !isRecord(input.artifact.data)) return input.base;

    const data = input.artifact.data;
    const knownSectionIds = new Set(input.contentModel.sections.map((section) => section.id));
    const routes = getRecordArray(data, "routes")
      .slice(0, 12)
      .map((route, index) =>
        sanitizeSiteRoute({
          route,
          index,
          knownSectionIds,
          lintIssues: input.lintIssues
        })
      );
    const navigation = getRecordArray(data, "navigation")
      .slice(0, 12)
      .map((item) => sanitizeNavigationItem(item))
      .filter((item): item is SiteNavigationItem => Boolean(item));

    return {
      id: input.base.id,
      contentModelId: input.contentModel.id,
      generatedAt: this.clock.now(),
      routes: routes.length ? routes : input.base.routes,
      navigation: navigation.length ? navigation : input.base.navigation
    };
  }

  private mergeDesignUsagePlanArtifact(input: {
    artifact?: SubAgentArtifact;
    contentModel: ContentModel;
    lintIssues: WikiLintIssue[];
  }): DesignUsagePlan | undefined {
    if (!input.artifact || !isRecord(input.artifact.data)) return undefined;

    const data = input.artifact.data;
    const sectionIds = new Set(input.contentModel.sections.map((section) => section.id));
    const selectedAssets = getRecordArray(data, "selectedAssets")
      .slice(0, 24)
      .map((selection) => {
        const assetId = getString(selection, "assetId");
        const role = getDesignAssetRole(selection.role);
        const targetSectionIds = getStringArray(selection, "targetSectionIds").filter((sectionId) =>
          sectionIds.has(sectionId)
        );
        if (!assetId) return undefined;
        return {
          assetId,
          role,
          targetSectionIds,
          reason: getString(selection, "reason") || "Selected by the builder agent.",
          constraints: getStringArray(selection, "constraints")
        };
      })
      .filter((selection): selection is DesignUsagePlan["selectedAssets"][number] => Boolean(selection));
    const rejectedAssets = getRecordArray(data, "rejectedAssets")
      .slice(0, 24)
      .map((rejection) => {
        const assetId = getString(rejection, "assetId");
        if (!assetId) return undefined;
        return {
          assetId,
          reason: getString(rejection, "reason") || "Rejected by the builder agent."
        };
      })
      .filter((rejection): rejection is DesignUsagePlan["rejectedAssets"][number] => Boolean(rejection));

    if (!selectedAssets.length) {
      input.lintIssues.push(createArtifactLintIssue({
        code: "empty-design-usage-plan",
        message: `Design usage plan ${input.artifact.id} did not select any usable design assets.`
      }));
    }

    return {
      id: input.artifact.id || this.ids.next("design-usage-plan"),
      createdAt: this.clock.now(),
      goal: getString(data, "goal") || "Use design assets to turn wiki-backed content into a public website.",
      selectedAssets,
      rejectedAssets,
      notes: getStringArray(data, "notes")
    };
  }

  private createSiteArtifactFromHtmlArtifact(input: {
    artifact?: SubAgentArtifact;
    sourceArtifactRefs: string[];
    lintIssues: WikiLintIssue[];
  }): SiteArtifact | undefined {
    if (!input.artifact) return undefined;

    const data = input.artifact.data;
    const files = readSiteArtifactFiles(data);
    if (!files.length) {
      input.lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "invalid-site-artifact-html",
        message: `HTML artifact ${input.artifact.id} did not include a usable html string or html file.`
      }));
      return undefined;
    }

    return {
      id: input.artifact.id || this.ids.next("site-artifact"),
      title: input.artifact.title || "Site HTML Artifact",
      format: "html",
      createdAt: this.clock.now(),
      sourceArtifactRefs: uniqueStrings([
        ...input.sourceArtifactRefs,
        input.artifact.ref ?? `html:${input.artifact.id}`
      ]),
      files
    };
  }

  private verifyBuildOutputs(input: {
    intent: BuildIntent;
    traces: SubAgentTrace[];
    contentModel: ContentModel;
    designUsagePlan?: DesignUsagePlan;
    sitePlan: SitePlan;
    siteArtifact?: SiteArtifact;
  }): WikiLintIssue[] {
    if (input.intent.desiredArtifact === "wiki-update") return [];

    const lintIssues: WikiLintIssue[] = [];
    const builderTrace = input.traces.find((trace) => trace.role === "builder-agent");
    const plannerTrace = input.traces.find((trace) => trace.role === "site-planner");
    const compilerTrace = input.traces.find((trace) => trace.role === "site-compiler");
    const contentModelArtifact = findLastArtifact(input.traces, "content-model");
    const designUsagePlanArtifact = findLastArtifact(input.traces, "design-usage-plan");
    const sitePlanArtifact = findLastArtifact(input.traces, "site-plan");
    const htmlArtifact = findLastArtifact(input.traces, "html");

    for (const trace of [builderTrace, plannerTrace, compilerTrace]) {
      if (trace?.status === "failed") {
        lintIssues.push(createArtifactLintIssue({
          severity: "error",
          code: "sub-agent-execution-failed",
          message: `${trace.role} failed before versioning: ${trace.result?.summary ?? "unknown error"}.`
        }));
      }
    }

    if (builderTrace?.status === "completed" && !contentModelArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-content-model-artifact",
        message: "Builder agent completed without a content-model artifact."
      }));
    }
    if (builderTrace?.status === "completed" && !designUsagePlanArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-design-usage-plan-artifact",
        message: "Builder agent completed without a design-usage-plan artifact."
      }));
    }
    if (builderTrace?.status === "completed" && !sitePlanArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-site-plan-artifact",
        message: "Builder agent completed without a site-plan artifact."
      }));
    }
    if (builderTrace?.status === "completed" && !htmlArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-site-artifact",
        message: "Builder agent completed without an html site artifact."
      }));
    }

    if (!builderTrace && plannerTrace?.status === "completed" && !contentModelArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-content-model-artifact",
        message: "Model-backed site planner completed without a content-model artifact."
      }));
    }
    if (!builderTrace && plannerTrace?.status === "completed" && !sitePlanArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-site-plan-artifact",
        message: "Model-backed site planner completed without a site-plan artifact."
      }));
    }
    if (!builderTrace && compilerTrace?.status === "completed" && !htmlArtifact) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-site-artifact",
        message: "Model-backed site builder completed without an html site artifact."
      }));
    }

    if (!input.designUsagePlan) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "missing-design-usage-plan",
        message: "Build version is missing the builder's design usage plan."
      }));
    } else {
      lintIssues.push(...verifyDesignUsagePlan({
        designUsagePlan: input.designUsagePlan,
        contentModel: input.contentModel
      }));
    }

    if (input.contentModel.sourcePageIds.length === 0 && this.state.wiki.pages.length > 0) {
      lintIssues.push(createArtifactLintIssue({
        code: "ungrounded-content-model",
        message: "Content model has no source page refs even though wiki pages are available."
      }));
    }

    for (const section of input.contentModel.sections) {
      const hasGrounding = section.sourcePageIds.length > 0 || section.sourceEntityIds.length > 0;
      const hasGeneratedCopy = section.contentBlocks.some((block) => block.kind === "markdown" && block.markdown.trim());
      if (hasGeneratedCopy && !hasGrounding) {
        lintIssues.push(createArtifactLintIssue({
          code: "ungrounded-section",
          message: `Section ${section.title} contains generated copy without source page or entity refs.`
        }));
      }
    }

    const sectionIds = new Set(input.contentModel.sections.map((section) => section.id));
    for (const route of input.sitePlan.routes) {
      if (route.sectionIds.length === 0 && sectionIds.size > 0) {
        lintIssues.push(createArtifactLintIssue({
          code: "empty-route-sections",
          message: `Route ${route.path} has no accepted section refs.`
        }));
      }
    }

    const routePaths = new Set(input.sitePlan.routes.map((route) => route.path));
    for (const item of input.sitePlan.navigation) {
      if (!item.href.startsWith("#") && !routePaths.has(item.href)) {
        lintIssues.push(createArtifactLintIssue({
          code: "unknown-navigation-route-ref",
          message: `Navigation item ${item.label} points to ${item.href}, which is not a route in the site plan.`
        }));
      }
    }

    if (input.siteArtifact) {
      lintIssues.push(...verifySiteArtifact(input.siteArtifact));
    }

    return lintIssues;
  }

  private sanitizeSectionSpec(input: {
    section: Record<string, unknown>;
    index: number;
    knownPageIds: Set<string>;
    knownEntityIds: Set<string>;
    lintIssues: WikiLintIssue[];
  }): SectionSpec {
    const id = getString(input.section, "id") || this.ids.next("section");
    const title = getString(input.section, "title") || `Section ${input.index + 1}`;
    const purpose = getSectionPurpose(input.section.purpose);
    const sourcePageIds = filterKnownIds({
      ids: getStringArray(input.section, "sourcePageIds"),
      knownIds: input.knownPageIds,
      fallback: [],
      lintIssues: input.lintIssues,
      code: "unknown-section-page-ref",
      messagePrefix: `Section ${title} referenced an unknown wiki page`
    });
    const sourceEntityIds = filterKnownIds({
      ids: getStringArray(input.section, "sourceEntityIds"),
      knownIds: input.knownEntityIds,
      fallback: [],
      lintIssues: input.lintIssues,
      code: "unknown-section-entity-ref",
      messagePrefix: `Section ${title} referenced an unknown entity`
    });
    const contentBlocks = getRecordArray(input.section, "contentBlocks")
      .slice(0, 12)
      .flatMap((block) =>
        sanitizeContentBlock({
          block,
          knownEntityIds: input.knownEntityIds,
          lintIssues: input.lintIssues,
          sectionTitle: title
        })
      );

    return {
      id,
      title,
      purpose,
      sourceEntityIds,
      sourcePageIds,
      designAssetRefs: getStringArray(input.section, "designAssetRefs"),
      componentRefs: getStringArray(input.section, "componentRefs"),
      contentBlocks
    };
  }

  private createPlan(intent: BuildIntent): HarnessPlan {
    return {
      id: this.ids.next("plan"),
      intentId: intent.id,
      createdAt: this.clock.now(),
      workflowSpecId: this.workflowSpec.id,
      workflowPhaseIds: selectWorkflowPhasesForIntent(this.workflowSpec, intent.desiredArtifact).map(
        (phase) => phase.id
      ),
      steps: createWorkflowPlanSteps({
        spec: this.workflowSpec,
        desiredArtifact: intent.desiredArtifact,
        ids: this.ids,
        modelRoutingPolicy: this.state.modelRoutingPolicy,
        status: "completed"
      })
    };
  }

  private selectSystemSkills(intent: BuildIntent): SystemMetaSkill[] {
    return selectActiveSystemSkills(
      this.state.systemSkills,
      intent.desiredArtifact ?? "site",
      intent.prompt
    );
  }

  private createModelRoutingLedger(): ModelRoutingDecision[] {
    return [
      selectModelTier(this.state.modelRoutingPolicy, "commander"),
      selectModelTier(this.state.modelRoutingPolicy, "planner"),
      selectModelTier(this.state.modelRoutingPolicy, "reflection"),
      selectModelTier(this.state.modelRoutingPolicy, "system-skill-promotion"),
      selectModelTier(this.state.modelRoutingPolicy, "coder"),
      selectModelTier(this.state.modelRoutingPolicy, "site-assistant"),
      selectModelTier(this.state.modelRoutingPolicy, "summarizer"),
      selectModelTier(this.state.modelRoutingPolicy, "search")
    ];
  }

  private createReflection(run: HarnessRun, activeSystemSkills: SystemMetaSkill[]): RunReflection {
    return {
      id: this.ids.next("reflection"),
      runId: run.id,
      createdAt: this.clock.now(),
      summary:
        "Initial reflection records the selected system skills and model routing assumptions for future promotion evidence.",
      candidateSystemSkillIds: [],
      findings: [
        {
          id: this.ids.next("finding"),
          severity: "info",
          target: "context",
          message: `${activeSystemSkills.length} active system skills were applied to this run.`
        },
        {
          id: this.ids.next("finding"),
          severity: "info",
          target: "model-routing",
          message:
            "Strong model tiers are reserved for command, planning, reflection, and system skill promotion decisions."
        }
      ]
    };
  }

  private recordSystemSkillEvidence(
    run: HarnessRun,
    activeSystemSkills: SystemMetaSkill[]
  ): void {
    for (const skill of activeSystemSkills) {
      this.state.systemSkills = appendSystemSkillEvidence(this.state.systemSkills, skill.id, {
        id: this.ids.next("skill-evidence"),
        runId: run.id,
        observedAt: this.clock.now(),
        signal: "neutral",
        summary:
          "Skill was applied during a successful harness run. Verification scoring is not yet connected, so the evidence is neutral."
      });
    }
  }
}

const systemClock: HarnessClock = {
  now: () => new Date().toISOString()
};

export const createSequentialIds = (): HarnessIdGenerator => {
  let nextId = 1;
  return {
    next(prefix: string): string {
      const id = `${prefix}_${String(nextId).padStart(4, "0")}`;
      nextId += 1;
      return id;
    }
  };
};

const summarizeWiki = (wiki: WikiSnapshot): string =>
  [
    `${wiki.sources.length} source documents`,
    `${wiki.entities.length} entities`,
    `${wiki.pages.length} pages`,
    `${wiki.relations.length} relations`,
    `${wiki.events.length} events`,
    `${wiki.lintIssues.length} lint issues`
  ].join(", ");

const uniqueStrings = (values: string[]): string[] => [...new Set(values.filter((value) => value.trim()))];

const findLastArtifact = (
  traces: SubAgentTrace[],
  kind: SubAgentArtifact["kind"]
): SubAgentArtifact | undefined => {
  const artifacts = traces.flatMap((trace) => trace.result?.artifacts ?? []);
  return artifacts.filter((artifact) => artifact.kind === kind).at(-1);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (record: Record<string, unknown>, field: string): string => {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
};

const getStringArray = (record: Record<string, unknown>, field: string): string[] => {
  const value = record[field];
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === "string"));
};

const getRecordArray = (record: Record<string, unknown>, field: string): Record<string, unknown>[] => {
  const value = record[field];
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
};

const filterKnownIds = (input: {
  ids: string[];
  knownIds: Set<string>;
  fallback: string[];
  lintIssues: WikiLintIssue[];
  code: string;
  messagePrefix: string;
}): string[] => {
  if (input.ids.length === 0) return input.fallback;
  const accepted = input.ids.filter((id) => input.knownIds.has(id));
  const rejected = input.ids.filter((id) => !input.knownIds.has(id));
  for (const id of rejected) {
    const issueInput: {
      code: string;
      message: string;
      pageId?: string;
    } = {
      code: input.code,
      message: `${input.messagePrefix}: ${id}.`
    };
    if (id.startsWith("page_") || id.includes("_page_")) issueInput.pageId = id;
    input.lintIssues.push(createArtifactLintIssue(issueInput));
  }
  return accepted;
};

const createArtifactLintIssue = (input: {
  severity?: WikiLintIssue["severity"];
  code: string;
  message: string;
  pageId?: string;
  entityId?: string;
  sourceIds?: string[];
}): WikiLintIssue => {
  const issue: WikiLintIssue = {
    id: `lint_${stableHash(`${input.code}:${input.message}`).slice(0, 16)}`,
    severity: input.severity ?? "warning",
    code: input.code,
    message: input.message,
    sourceIds: input.sourceIds ?? [],
    createdAt: new Date().toISOString()
  };
  if (input.pageId) issue.pageId = input.pageId;
  if (input.entityId) issue.entityId = input.entityId;
  return issue;
};

const getSectionPurpose = (value: unknown): SectionSpec["purpose"] => {
  if (
    value === "orient" ||
    value === "explain" ||
    value === "compare" ||
    value === "evidence" ||
    value === "timeline" ||
    value === "call-to-action"
  ) {
    return value;
  }
  return "explain";
};

const getDesignAssetRole = (value: unknown): DesignUsagePlan["selectedAssets"][number]["role"] => {
  if (
    value === "layout" ||
    value === "navigation" ||
    value === "hero" ||
    value === "background" ||
    value === "motion" ||
    value === "section" ||
    value === "card" ||
    value === "call-to-action" ||
    value === "accessibility" ||
    value === "visual-audit" ||
    value === "copywriting" ||
    value === "design-system" ||
    value === "typography" ||
    value === "color"
  ) {
    return value;
  }
  return "section";
};

const sanitizeContentBlock = (input: {
  block: Record<string, unknown>;
  knownEntityIds: Set<string>;
  lintIssues: WikiLintIssue[];
  sectionTitle: string;
}): ContentBlock[] => {
  const kind = input.block.kind;
  if (kind === "markdown") {
    const markdown = getString(input.block, "markdown");
    return markdown ? [{ kind, markdown }] : [];
  }
  if (kind === "entity-list") {
    const entityIds = filterKnownIds({
      ids: getStringArray(input.block, "entityIds"),
      knownIds: input.knownEntityIds,
      fallback: [],
      lintIssues: input.lintIssues,
      code: "unknown-content-block-entity-ref",
      messagePrefix: `Section ${input.sectionTitle} content block referenced an unknown entity`
    });
    return entityIds.length ? [{ kind, entityIds }] : [];
  }
  if (kind === "timeline") {
    const eventIds = getStringArray(input.block, "eventIds");
    return eventIds.length ? [{ kind, eventIds }] : [];
  }
  input.lintIssues.push(createArtifactLintIssue({
    code: "unknown-content-block-kind",
    message: `Section ${input.sectionTitle} used unsupported content block kind: ${String(kind)}.`
  }));
  return [];
};

const sanitizeSiteRoute = (input: {
  route: Record<string, unknown>;
  index: number;
  knownSectionIds: Set<string>;
  lintIssues: WikiLintIssue[];
}): SiteRoute => {
  const path = normalizeRoutePath(getString(input.route, "path") || (input.index === 0 ? "/" : `/page-${input.index + 1}`));
  const title = getString(input.route, "title") || (input.index === 0 ? "Home" : `Page ${input.index + 1}`);
  const sectionIds = filterKnownIds({
    ids: getStringArray(input.route, "sectionIds"),
    knownIds: input.knownSectionIds,
    fallback: [],
    lintIssues: input.lintIssues,
    code: "unknown-route-section-ref",
    messagePrefix: `Route ${path} referenced an unknown section`
  });
  return { path, title, sectionIds };
};

const sanitizeNavigationItem = (item: Record<string, unknown>): SiteNavigationItem | undefined => {
  const label = getString(item, "label");
  const href = getString(item, "href");
  if (!label || !href) return undefined;
  return {
    label,
    href: normalizeRoutePath(href)
  };
};

const normalizeRoutePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("#")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const readSiteArtifactFiles = (data: unknown): SiteArtifactFile[] => {
  if (typeof data === "string") {
    return data.trim() ? [{ path: "index.html", mediaType: "text/html", content: data }] : [];
  }
  if (!isRecord(data)) return [];

  const html = getString(data, "html");
  if (html) {
    return [{ path: "index.html", mediaType: "text/html", content: html }];
  }

  const rawFiles = Array.isArray(data.files) ? data.files.filter(isRecord) : [];
  return rawFiles.flatMap((file, index) => {
    const content = getString(file, "content");
    if (!content) return [];
    const mediaType = getString(file, "mediaType") || "text/html";
    if (mediaType !== "text/html") return [];
    return [
      {
        path: normalizeArtifactFilePath(getString(file, "path") || (index === 0 ? "index.html" : `page-${index + 1}.html`)),
        mediaType: "text/html",
        content
      }
    ];
  });
};

const normalizeArtifactFilePath = (value: string): string => {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed || trimmed === ".") return "index.html";
  if (trimmed.includes("..")) return "index.html";
  return trimmed.endsWith(".html") ? trimmed : `${trimmed}.html`;
};

const verifySiteArtifact = (artifact: SiteArtifact): WikiLintIssue[] => {
  const lintIssues: WikiLintIssue[] = [];
  if (!artifact.files.length) {
    lintIssues.push(createArtifactLintIssue({
      severity: "error",
      code: "empty-site-artifact",
      message: `Site artifact ${artifact.id} contains no files.`
    }));
    return lintIssues;
  }

  for (const file of artifact.files) {
    const lowerContent = file.content.toLowerCase();
    if (!lowerContent.includes("<html") || !lowerContent.includes("</html>")) {
      lintIssues.push(createArtifactLintIssue({
        code: "site-artifact-missing-html-shell",
        message: `Site artifact file ${file.path} does not look like a complete HTML document.`
      }));
    }

    const internalTerm = findInternalUserFacingTerm(file.content);
    if (internalTerm) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "internal-language-in-site-artifact",
        message: `Site artifact file ${file.path} exposes internal system language: ${internalTerm}.`
      }));
    }
  }

  return lintIssues;
};

const verifyDesignUsagePlan = (input: {
  designUsagePlan: DesignUsagePlan;
  contentModel: ContentModel;
}): WikiLintIssue[] => {
  const lintIssues: WikiLintIssue[] = [];
  const sectionIds = new Set(input.contentModel.sections.map((section) => section.id));
  const sectionAssetRefs = new Set(
    input.contentModel.sections.flatMap((section) => [
      ...(section.designAssetRefs ?? []),
      ...(section.componentRefs ?? [])
    ])
  );

  if (input.designUsagePlan.selectedAssets.length === 0) {
    lintIssues.push(createArtifactLintIssue({
      severity: "error",
      code: "design-usage-plan-empty",
      message: `Design usage plan ${input.designUsagePlan.id} selected no assets.`
    }));
  }

  for (const selection of input.designUsagePlan.selectedAssets) {
    if (!selection.assetId.trim()) {
      lintIssues.push(createArtifactLintIssue({
        severity: "error",
        code: "design-usage-plan-empty-asset-id",
        message: `Design usage plan ${input.designUsagePlan.id} contains an empty asset id.`
      }));
    }

    if (selection.targetSectionIds.length === 0) {
      lintIssues.push(createArtifactLintIssue({
        code: "design-asset-without-section-target",
        message: `Design asset ${selection.assetId} is selected without a section target.`
      }));
    }

    for (const sectionId of selection.targetSectionIds) {
      if (!sectionIds.has(sectionId)) {
        lintIssues.push(createArtifactLintIssue({
          severity: "error",
          code: "design-usage-plan-unknown-section",
          message: `Design asset ${selection.assetId} targets unknown section ${sectionId}.`
        }));
      }
    }

    if (!sectionAssetRefs.has(selection.assetId)) {
      lintIssues.push(createArtifactLintIssue({
        code: "design-usage-plan-not-reflected-in-content-model",
        message: `Design asset ${selection.assetId} is selected but no section references it.`
      }));
    }
  }

  return lintIssues;
};

const findInternalUserFacingTerm = (content: string): string | undefined => {
  const lowerContent = content.toLowerCase();
  const terms = [
    "sub-agent",
    "model routing",
    "run-context-manifest",
    "context packet",
    "tool registry",
    "system meta skill",
    "harness runtime",
    "模型路由",
    "上下文包",
    "工具注册表",
    "系统元技能"
  ];
  return terms.find((term) => lowerContent.includes(term.toLowerCase()));
};

const asCommanderPhase = (value: string | undefined): CommanderPhase | undefined => {
  if (!value) return undefined;
  const phases: CommanderPhase[] = [
    "workspace-discovery",
    "knowledge-base-selection",
    "source-linking",
    "ontology-ingest",
    "mutation-plan-review",
    "wiki-maintenance",
    "intent-clarification",
    "site-generation",
    "site-planning",
    "site-building",
    "verification",
    "versioning",
    "reflection"
  ];
  return phases.includes(value as CommanderPhase) ? value as CommanderPhase : undefined;
};

const toObservationStatus = (status: SubAgentTrace["status"]) => {
  if (status === "queued" || status === "running") return "started";
  return status;
};

const createHarnessToolCallRecords = (runId: string, traces: SubAgentTrace[]): ToolCallRecord[] =>
  traces.flatMap((trace) =>
    (trace.result?.toolCalls ?? []).map((call) => ({
      id: `${trace.id}_${call.callId}`,
      runId,
      toolName: call.toolName,
      input: call.input,
      output: call.error ? { error: call.error } : call.output,
      startedAt: call.startedAt,
      finishedAt: call.finishedAt,
      status: call.status
    }))
  );

const durationMs = (startedAt: string | undefined, finishedAt: string | undefined): number | undefined => {
  if (!startedAt || !finishedAt) return undefined;
  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return undefined;
  return Math.max(0, finished - started);
};

const stableHash = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
};
