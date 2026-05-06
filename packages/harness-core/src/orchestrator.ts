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
  HarnessRuntimeState
} from "./types.ts";

export type HarnessOrchestratorOptions = {
  wiki?: WikiSnapshot;
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
    this.state = {
      wiki: options.wiki ?? emptyWikiSnapshot(),
      runs: [],
      versions: []
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
      const version: BuildVersion = {
        id: this.ids.next("version"),
        runId: run.id,
        createdAt: this.clock.now(),
        summary: `Created initial build version for "${intent.title}".`,
        contentModel,
        sitePlan,
        lintIssues: []
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
    return {
      id: this.ids.next("ledger"),
      intentId: intent.id,
      createdAt: this.clock.now(),
      wikiSnapshotSummary: summarizeWiki(this.state.wiki),
      selectedPageIds: this.state.wiki.pages.slice(0, 12).map((page) => page.id),
      selectedSourceIds: this.state.wiki.sources.slice(0, 12).map((source) => source.id),
      notes: [
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
          status: "completed"
        },
        {
          id: this.ids.next("step"),
          title: "Draft content model",
          kind: "compile",
          status: "completed"
        },
        {
          id: this.ids.next("step"),
          title: "Verify against intent",
          kind: "verify",
          status: "completed"
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
