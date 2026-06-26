import {
  createContextPacket,
  trimContextPacketToBudget,
  type ContextBudget,
  type ContextPacket,
  type ContextPacketInput,
  type ContextRetentionPolicy,
  type SubAgentRole,
  type SubAgentTrace
} from "../../agent-runtime/src/index.ts";
import type { SystemMetaSkill } from "../../meta-skill-core/src/index.ts";
import type { WikiSnapshot } from "../../wiki-core/src/index.ts";
import type {
  BuildIntent,
  CommanderDecision,
  ContextLedger,
  HarnessClock,
  HarnessIdGenerator
} from "./types.ts";
import {
  defaultWorkflowSpec,
  selectWorkflowPhasesForIntent,
  type WorkflowPhaseSpec,
  type WorkflowSpec
} from "./workflow.ts";

export type CommanderDispatchInput = {
  runId: string;
  intent: BuildIntent;
  contextLedger: ContextLedger;
  wiki: WikiSnapshot;
  systemSkills: SystemMetaSkill[];
};

export type CommanderDispatch = {
  decisions: CommanderDecision[];
  subAgentTraces: SubAgentTrace[];
  preservedReferenceIds: string[];
};

export type CommanderOptions = {
  workflowSpec?: WorkflowSpec;
  clock: HarnessClock;
  ids: HarnessIdGenerator;
};

export class Commander {
  private readonly workflowSpec: WorkflowSpec;
  private readonly clock: HarnessClock;
  private readonly ids: HarnessIdGenerator;

  constructor(options: CommanderOptions) {
    this.workflowSpec = options.workflowSpec ?? defaultWorkflowSpec;
    this.clock = options.clock;
    this.ids = options.ids;
  }

  createDispatch(input: CommanderDispatchInput): CommanderDispatch {
    const phases = selectWorkflowPhasesForIntent(this.workflowSpec, input.intent.desiredArtifact);
    const subAgentTraces: SubAgentTrace[] = [];
    const decisions: CommanderDecision[] = [];
    const preservedReferenceIds = new Set<string>([
      ...input.contextLedger.runContextManifest.requiredCarryForwardRefs,
      ...(input.contextLedger.selectedPageIds ?? []).map((pageId) => `page:${pageId}`),
      ...(input.contextLedger.selectedSourceIds ?? []).map((sourceId) => `source:${sourceId}`),
      ...(input.contextLedger.selectedSystemSkillIds ?? []).map((skillId) => `system-skill:${skillId}`)
    ]);

    for (const phase of phases) {
      const role = phase.runtimeRole;
      const packet = role !== undefined ? this.createPacket(phase, role, input) : undefined;
      const nextPhase = phase.next.find((candidate) => phases.some((selected) => selected.id === candidate));

      if (packet) {
        subAgentTraces.push(this.createTrace(input.runId, packet.role, phase, packet));
        preservedReferenceIds.add(`context-packet:${packet.id}`);
      }

      const decision: CommanderDecision = {
        id: this.ids.next("decision"),
        phase: phase.id,
        createdAt: this.clock.now(),
        summary: createDecisionSummary(phase, role),
        requiredToolNames: phase.allowedTools,
        hardConstraintIds: [
          ...phase.hardGates.map((_, index) => `${phase.id}:hard-gate:${index + 1}`),
          ...(input.intent.hardConstraints ?? []).map((constraint) => constraint.id)
        ],
        softConstraintIds: (input.intent.softConstraints ?? []).map((constraint) => constraint.id),
        contextPacketIds: packet ? [packet.id] : [],
        requiresHumanConfirmation: phase.requiresHumanConfirmation
      };
      if (nextPhase) decision.nextPhase = nextPhase;
      decisions.push(decision);
    }

    return {
      decisions,
      subAgentTraces,
      preservedReferenceIds: [...preservedReferenceIds].sort()
    };
  }

  private createPacket(
    phase: WorkflowPhaseSpec,
    role: SubAgentRole,
    input: CommanderDispatchInput
  ): ContextPacket {
    const packet = createContextPacket({
      id: this.ids.next("packet"),
      role,
      createdAt: this.clock.now(),
      workflowPhaseId: phase.id,
      goal: `${phase.title}: ${input.intent.title}`,
      instructions: createPhaseInstructions(phase, input.intent),
      inputs: createPacketInputs(phase, input),
      budget: budgetForRole(role),
      allowedToolNames: phase.allowedTools,
      requiredOutputNames: phase.requiredOutputs,
      requiredCarryForwardRefs: input.contextLedger.runContextManifest.requiredCarryForwardRefs,
      outputContract: createOutputContract(phase),
      retentionPolicy: retentionPolicyForPhase(phase)
    });

    return trimContextPacketToBudget(packet);
  }

  private createTrace(
    runId: string,
    role: SubAgentRole,
    phase: WorkflowPhaseSpec,
    packet: ContextPacket
  ): SubAgentTrace {
    const startedAt = this.clock.now();
    const finishedAt = this.clock.now();
    return {
      id: this.ids.next("sub-agent-trace"),
      parentRunId: runId,
      role,
      status: "queued",
      packet,
      startedAt,
      finishedAt
    };
  }
}

const createDecisionSummary = (
  phase: WorkflowPhaseSpec,
  role: SubAgentRole | undefined
): string =>
  role
    ? `${phase.owner} handles ${phase.id} with runtime role ${role} and ${phase.allowedTools.length} allowed tool${phase.allowedTools.length === 1 ? "" : "s"}.`
    : `${phase.owner} handles ${phase.id} directly with ${phase.allowedTools.length} allowed tool${phase.allowedTools.length === 1 ? "" : "s"}.`;

const createPhaseInstructions = (
  phase: WorkflowPhaseSpec,
  intent: BuildIntent
): string[] => [
  `Work only inside workflow phase ${phase.id}.`,
  `Allowed tools: ${phase.allowedTools.join(", ") || "none"}.`,
  `Required outputs: ${phase.requiredOutputs.join(", ") || "none"}.`,
  `Hard gates: ${phase.hardGates.join(" | ") || "none"}.`,
  `User intent: ${intent.prompt}`,
  "Return structure, artifact refs, evidence refs, and carry-forward refs. Do not rely on hidden transcript memory."
];

const createPacketInputs = (
  phase: WorkflowPhaseSpec,
  input: CommanderDispatchInput
): ContextPacketInput[] => {
  const indexPage = input.wiki.pages.find((page) => page.kind === "index" || page.path.endsWith("index.wiki"));
  const selectedPages = input.wiki.pages
    .filter((page) => page.kind !== "index" && page.kind !== "log")
    .slice(0, 5);
  const selectedSources = input.wiki.sources.slice(0, 5);
  const inputs: ContextPacketInput[] = [
    ...createSharedContextInputs(input),
    {
      kind: "intent",
      id: input.intent.id,
      title: input.intent.title,
      summary: input.intent.prompt
    }
  ];

  if (indexPage) {
    const indexInput: ContextPacketInput = {
      kind: "wiki-index",
      id: indexPage.id,
      title: indexPage.title,
      summary: `Wiki index for ${input.contextLedger.wikiSnapshotSummary}.`,
      uri: indexPage.path
    };
    if (phase.requiredInputs.includes("wikiSnapshot")) indexInput.content = indexPage.body;
    inputs.push(indexInput);
  }

  for (const page of selectedPages) {
    inputs.push({
      kind: "wiki-page",
      id: page.id,
      title: page.title,
      summary: page.body.slice(0, 240),
      uri: page.path
    });
  }

  for (const source of selectedSources) {
    inputs.push({
      kind: "source-excerpt",
      id: source.id,
      title: source.title,
      summary: source.content ? source.content.slice(0, 240) : `Source reference: ${source.uri}`,
      uri: source.uri
    });
  }

  for (const skill of input.systemSkills.slice(0, 5)) {
    inputs.push({
      kind: "system-skill",
      id: skill.id,
      title: skill.title,
      summary: skill.summary
    });
  }

  return inputs;
};

const createSharedContextInputs = (input: CommanderDispatchInput): ContextPacketInput[] => {
  const manifest = input.contextLedger.runContextManifest;
  const registryByKind = new Map(manifest.registryRefs.map((ref) => [ref.kind, ref]));
  const designSystem = registryByKind.get("design-system");
  const componentRegistry = registryByKind.get("component-registry");
  const toolRegistry = registryByKind.get("tool-registry");
  const styleGuide = registryByKind.get("style-guide");

  const sharedInputs: ContextPacketInput[] = [
    {
      kind: "run-context-manifest",
      id: manifest.id,
      title: "Run Context Manifest",
      summary:
        "Authoritative manifest for this run: selected knowledge base, wiki/source snapshot ids, registries, and required carry-forward refs.",
      content: JSON.stringify(manifest)
    }
  ];

  if (designSystem) {
    sharedInputs.push({
      kind: "design-system",
      id: designSystem.id,
      title: designSystem.title,
      summary: designSystem.summary,
      content: JSON.stringify({
        ref: designSystem,
        tokens: {
          colors: ["accent", "gray", "white", "emerald", "amber"],
          typography: ["page-title", "section-title", "body", "caption"],
          layout: ["app-shell", "split-create-preview", "version-card", "workspace-panel"]
        }
      })
    });
  }

  if (componentRegistry) {
    sharedInputs.push({
      kind: "component-registry",
      id: componentRegistry.id,
      title: componentRegistry.title,
      summary: componentRegistry.summary,
      content: JSON.stringify({
        ref: componentRegistry,
        designAssets: [
          "layout-single-page-editorial",
          "hero-identity-thesis",
          "section-evidence-led",
          "card-project-proof",
          "magic-grid-background",
          "magic-blur-fade",
          "magic-vertical-marquee",
          "skill-accessible-motion",
          "tool-responsive-visual-audit"
        ],
        assetProtocol:
          "Treat UI components, MCP registry items, design skills, templates, and verifier tools as design assets with stable ids and constraints."
      })
    });
  }

  if (toolRegistry) {
    sharedInputs.push({
      kind: "tool-registry",
      id: toolRegistry.id,
      title: toolRegistry.title,
      summary: toolRegistry.summary,
      content: JSON.stringify({
        ref: toolRegistry,
        phaseAllowedTools: input.contextLedger.commanderDecisionIds ?? [],
        sharedTools: [
          "readWikiIndex",
          "searchWiki",
          "readWikiPage",
          "readEntity",
          "readSource",
          "recommendDesignAssets",
          "searchDesignAssets",
          "readDesignAsset",
          "searchDesignComponents",
          "readDesignComponent",
          "createSitePlan",
          "compileSite",
          "writeSiteArtifact"
        ],
        carryForwardRule:
          "When a sub-agent uses a source/page/entity/design-asset/artifact, preserve its id in artifactRefs or mustCarryForwardRefs."
      })
    });
  }

  if (styleGuide) {
    sharedInputs.push({
      kind: "style-guide",
      id: styleGuide.id,
      title: styleGuide.title,
      summary: styleGuide.summary,
      content: JSON.stringify({
        ref: styleGuide,
        rules: [
          "User-facing UI avoids internal terms such as harness, agent topology, or model routing.",
          "Preview appears only after a build draft exists.",
          "Knowledge base boundaries are explicit and never mixed.",
          "Version history shows parent version and revision summary."
        ]
      })
    });
  }

  return sharedInputs;
};

const createOutputContract = (phase: WorkflowPhaseSpec): string[] => [
  ...phase.requiredOutputs.map((output) => `Produce ${output}.`),
  ...(phase.requiredOutputs.includes("designUsagePlan")
    ? [
        "Explain how UI components, MCP registry items, design skills, templates, or verifier tools were considered.",
        "Return selected design assets as stable refs; a future patch build must be able to re-read them."
      ]
    : []),
  "Return summary.",
  "Return decisions.",
  "Return artifactRefs.",
  "Return evidenceRefs.",
  "Return mustCarryForwardRefs.",
  "Return discardableContext."
];

const retentionPolicyForPhase = (phase: WorkflowPhaseSpec): ContextRetentionPolicy => {
  if (phase.owner === "builder-agent") return "artifact-only";
  if (phase.requiresHumanConfirmation) return "bounded-transcript";
  if (phase.owner === "review-agent") return "bounded-transcript";
  return "summary-only";
};

const budgetForRole = (role: SubAgentRole): ContextBudget => {
  if (role === "conversation-agent") return { maxInputChars: 12_000, maxOutputChars: 4_000, maxToolCalls: 6 };
  if (role === "builder-agent") return { maxInputChars: 20_000, maxOutputChars: 12_000, maxToolCalls: 18 };
  if (role === "review-agent") return { maxInputChars: 14_000, maxOutputChars: 5_000, maxToolCalls: 10 };
  if (role === "wiki-curator") return { maxInputChars: 18_000, maxOutputChars: 6_000, maxToolCalls: 12 };
  if (role === "site-compiler") return { maxInputChars: 14_000, maxOutputChars: 8_000, maxToolCalls: 16 };
  if (role === "verifier") return { maxInputChars: 12_000, maxOutputChars: 5_000, maxToolCalls: 10 };
  if (role === "reflection") return { maxInputChars: 10_000, maxOutputChars: 4_000, maxToolCalls: 6 };
  return { maxInputChars: 12_000, maxOutputChars: 5_000, maxToolCalls: 8 };
};
