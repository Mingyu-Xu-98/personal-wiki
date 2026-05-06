import {
  defaultModelRoutingPolicy,
  selectModelTier,
  type ModelRoutingDecision,
  type ModelRoutingPolicy
} from "../../agent-runtime/src/index.ts";
import {
  appendSystemSkillEvidence,
  createInitialSystemSkillLibrary,
  selectActiveSystemSkills,
  type SystemMetaSkill,
  type SystemSkillLibrary
} from "../../meta-skill-core/src/index.ts";
import { createEmptyContentModel, type SitePlan } from "../../site-compiler/src/index.ts";
import { emptyWikiSnapshot, type WikiSnapshot } from "../../wiki-core/src/index.ts";
import type {
  BuildIntent,
  BuildVersion,
  ContextLedger,
  HarnessClock,
  HarnessIdGenerator,
  HarnessPlan,
  HarnessRun,
  HarnessRuntimeState,
  RunReflection
} from "./types.ts";

export type HarnessOrchestratorOptions = {
  wiki?: WikiSnapshot;
  systemSkills?: SystemSkillLibrary;
  modelRoutingPolicy?: ModelRoutingPolicy;
  clock?: HarnessClock;
  ids?: HarnessIdGenerator;
};

export class HarnessOrchestrator {
  private readonly clock: HarnessClock;
  private readonly ids: HarnessIdGenerator;
  private readonly state: HarnessRuntimeState;

  constructor(options: HarnessOrchestratorOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.ids = options.ids ?? createSequentialIds();
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
      toolCalls: []
    };

    this.state.runs.push(run);

    try {
      run.state = "planning";
      run.contextLedger = this.createContextLedger(intent);
      run.plan = this.createPlan(intent);
      const activeSystemSkills = this.selectSystemSkills(intent);

      run.state = "executing";
      const contentModel = createEmptyContentModel(this.ids.next("content"), intent.title);
      contentModel.thesis = intent.prompt;
      contentModel.audience = intent.audience ?? "self";
      contentModel.sourcePageIds = run.contextLedger.selectedPageIds;

      const sitePlan: SitePlan = {
        id: this.ids.next("site-plan"),
        contentModelId: contentModel.id,
        generatedAt: this.clock.now(),
        routes: [
          {
            path: "/",
            title: intent.title,
            sectionIds: []
          }
        ],
        navigation: [
          {
            label: "Home",
            href: "/"
          }
        ]
      };

      run.state = "verifying";
      run.state = "reflecting";
      run.reflection = this.createReflection(run, activeSystemSkills);
      this.state.reflections.push(run.reflection);
      this.recordSystemSkillEvidence(run, activeSystemSkills);

      const version: BuildVersion = {
        id: this.ids.next("version"),
        runId: run.id,
        createdAt: this.clock.now(),
        summary: `Created initial build version for "${intent.title}".`,
        contentModel,
        sitePlan,
        lintIssues: [],
        appliedSystemSkillIds: activeSystemSkills.map((skill) => skill.id)
      };

      run.state = "versioned";
      run.buildVersion = version;
      this.state.versions.push(version);

      return structuredClone(run);
    } catch (error) {
      run.state = "failed";
      run.error = error instanceof Error ? error.message : String(error);
      return structuredClone(run);
    }
  }

  private createContextLedger(intent: BuildIntent): ContextLedger {
    const intentKind = intent.desiredArtifact ?? "site";
    const activeSystemSkills = this.selectSystemSkills(intent);
    const modelRouting = this.createModelRoutingLedger();

    return {
      id: this.ids.next("ledger"),
      intentId: intent.id,
      createdAt: this.clock.now(),
      wikiSnapshotSummary: summarizeWiki(this.state.wiki),
      selectedPageIds: this.state.wiki.pages.slice(0, 12).map((page) => page.id),
      selectedSourceIds: this.state.wiki.sources.slice(0, 12).map((source) => source.id),
      selectedSystemSkillIds: activeSystemSkills.map((skill) => skill.id),
      modelRouting,
      notes: [
        `Selected ${activeSystemSkills.length} system meta skills for ${intentKind} intent.`,
        "Commander, planning, reflection, and system skill promotion use the strong tier by default.",
        "Bounded code, summarization, retrieval, and website assistant calls can use cheaper tiers when verification is available.",
        "Initial runtime uses deterministic context selection.",
        "Future versions can replace this with model-guided context assembly."
      ]
    };
  }

  private createPlan(intent: BuildIntent): HarnessPlan {
    return {
      id: this.ids.next("plan"),
      intentId: intent.id,
      createdAt: this.clock.now(),
      steps: [
        {
          id: this.ids.next("step"),
          title: "Assemble wiki context",
          kind: "context",
          status: "completed",
          modelRole: "commander",
          modelTier: selectModelTier(this.state.modelRoutingPolicy, "commander").tier
        },
        {
          id: this.ids.next("step"),
          title: "Draft content model",
          kind: "compile",
          status: "completed",
          modelRole: "planner",
          modelTier: selectModelTier(this.state.modelRoutingPolicy, "planner").tier
        },
        {
          id: this.ids.next("step"),
          title: "Verify against intent",
          kind: "verify",
          status: "completed",
          modelRole: "reflection",
          modelTier: selectModelTier(this.state.modelRoutingPolicy, "reflection").tier
        },
        {
          id: this.ids.next("step"),
          title: "Reflect on run quality",
          kind: "reflect",
          status: "completed",
          modelRole: "reflection",
          modelTier: selectModelTier(this.state.modelRoutingPolicy, "reflection").tier
        },
        {
          id: this.ids.next("step"),
          title: "Collect system skill evidence",
          kind: "meta-skill",
          status: "completed",
          modelRole: "system-skill-promotion",
          modelTier: selectModelTier(this.state.modelRoutingPolicy, "system-skill-promotion").tier
        },
        {
          id: this.ids.next("step"),
          title: "Record build version",
          kind: "version",
          status: "completed"
        }
      ]
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
