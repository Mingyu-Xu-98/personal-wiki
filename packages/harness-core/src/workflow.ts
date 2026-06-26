import { selectModelTier, type ModelRole, type ModelRoutingPolicy, type SubAgentRole } from "../../agent-runtime/src/index.ts";
import type { BuildIntent, CommanderPhase, HarnessIdGenerator, HarnessPlanStep } from "./types.ts";

export type WorkflowArtifactKind =
  | "workspaceManifest"
  | "knowledgeBaseSelection"
  | "sourceReferences"
  | "sourceDocuments"
  | "wikiMutationPlan"
  | "planReview"
  | "planHandoff"
  | "wikiSnapshot"
  | "buildIntent"
  | "intentBrief"
  | "buildSpec"
  | "contentModel"
  | "designUsagePlan"
  | "sitePlan"
  | "siteArtifact"
  | "verificationReport"
  | "buildVersion"
  | "runReflection";

export type WorkflowOwner =
  | "harness"
  | "knowledge-layer"
  | "conversation-agent"
  | "builder-agent"
  | "review-agent"
  | "reflection";

export type WorkflowToolName =
  | "readManifest"
  | "listKnowledgeBases"
  | "readKnowledgeBaseSummary"
  | "linkSource"
  | "readSource"
  | "createMutationPlan"
  | "reviewPlan"
  | "handoffPlan"
  | "applyPlan"
  | "readWikiIndex"
  | "searchWiki"
  | "readWikiPage"
  | "searchDesignAssets"
  | "readDesignAsset"
  | "recommendDesignAssets"
  | "searchDesignComponents"
  | "readDesignComponent"
  | "createSitePlan"
  | "compileSite"
  | "writeSiteArtifact"
  | "verifyWiki"
  | "verifySite"
  | "lintWiki"
  | "auditWorkspace"
  | "writeBuildVersion"
  | "publishVersion"
  | "recordReflection"
  | "collectSystemSkillEvidence";

export type WorkflowAgentRole = "conversation-agent" | "builder-agent" | "review-agent";

export type WorkflowPhaseSpec = {
  id: CommanderPhase;
  title: string;
  owner: WorkflowOwner;
  agentRole?: WorkflowAgentRole;
  runtimeRole?: SubAgentRole;
  planStepKind: HarnessPlanStep["kind"];
  modelRole?: ModelRole;
  requiredInputs: WorkflowArtifactKind[];
  allowedTools: WorkflowToolName[];
  requiredOutputs: WorkflowArtifactKind[];
  hardGates: string[];
  canExitWhen: string[];
  requiresHumanConfirmation: boolean;
  next: CommanderPhase[];
};

export type WorkflowSpec = {
  id: string;
  name: string;
  version: string;
  description: string;
  startPhase: CommanderPhase;
  terminalPhases: CommanderPhase[];
  phases: WorkflowPhaseSpec[];
};

export const defaultWorkflowSpec: WorkflowSpec = {
  id: "personal-wiki-site-workflow",
  name: "Personal Wiki To Website Workflow",
  version: "0.2.0",
  description:
    "Canonical three-agent harness workflow for maintaining a personal wiki and compiling it into a versioned website artifact.",
  startPhase: "workspace-discovery",
  terminalPhases: ["reflection"],
  phases: [
    {
      id: "workspace-discovery",
      title: "Discover or create workspace",
      owner: "harness",
      planStepKind: "context",
      modelRole: "commander",
      requiredInputs: [],
      allowedTools: ["readManifest"],
      requiredOutputs: ["workspaceManifest"],
      hardGates: ["workspace exists before source or build operations"],
      canExitWhen: ["workspaceManifest is available"],
      requiresHumanConfirmation: false,
      next: ["knowledge-base-selection", "source-linking"]
    },
    {
      id: "knowledge-base-selection",
      title: "Select isolated knowledge base",
      owner: "conversation-agent",
      agentRole: "conversation-agent",
      runtimeRole: "conversation-agent",
      planStepKind: "context",
      modelRole: "commander",
      requiredInputs: ["workspaceManifest"],
      allowedTools: ["listKnowledgeBases", "readKnowledgeBaseSummary"],
      requiredOutputs: ["knowledgeBaseSelection"],
      hardGates: ["exactly one knowledge base is selected for a site build"],
      canExitWhen: ["knowledgeBaseSelection is present"],
      requiresHumanConfirmation: true,
      next: ["intent-clarification", "source-linking"]
    },
    {
      id: "source-linking",
      title: "Link source documents",
      owner: "knowledge-layer",
      runtimeRole: "wiki-curator",
      planStepKind: "wiki",
      modelRole: "wiki-maintainer",
      requiredInputs: ["workspaceManifest"],
      allowedTools: ["linkSource", "readManifest"],
      requiredOutputs: ["sourceReferences"],
      hardGates: ["raw source files are referenced or uploaded but not mutated"],
      canExitWhen: ["sourceReferences are recorded"],
      requiresHumanConfirmation: false,
      next: ["ontology-ingest"]
    },
    {
      id: "ontology-ingest",
      title: "Extract source documents and ontology candidates",
      owner: "knowledge-layer",
      runtimeRole: "wiki-curator",
      planStepKind: "wiki",
      modelRole: "wiki-maintainer",
      requiredInputs: ["sourceReferences"],
      allowedTools: ["readSource", "createMutationPlan"],
      requiredOutputs: ["sourceDocuments", "wikiMutationPlan"],
      hardGates: ["ontology candidates keep source/page evidence refs"],
      canExitWhen: ["wikiMutationPlan is created"],
      requiresHumanConfirmation: false,
      next: ["mutation-plan-review"]
    },
    {
      id: "mutation-plan-review",
      title: "Review mutation plan before apply",
      owner: "knowledge-layer",
      runtimeRole: "wiki-curator",
      planStepKind: "verify",
      modelRole: "wiki-maintainer",
      requiredInputs: ["wikiMutationPlan"],
      allowedTools: ["reviewPlan", "handoffPlan"],
      requiredOutputs: ["planReview", "planHandoff"],
      hardGates: ["blocked mutation plans cannot be applied"],
      canExitWhen: ["planReview.decision is not blocked"],
      requiresHumanConfirmation: true,
      next: ["wiki-maintenance"]
    },
    {
      id: "wiki-maintenance",
      title: "Apply reviewed wiki mutation",
      owner: "knowledge-layer",
      runtimeRole: "wiki-curator",
      planStepKind: "wiki",
      modelRole: "wiki-maintainer",
      requiredInputs: ["wikiMutationPlan", "planReview", "planHandoff"],
      allowedTools: ["applyPlan"],
      requiredOutputs: ["wikiSnapshot"],
      hardGates: ["only reviewed mutation plans can update durable wiki state"],
      canExitWhen: ["wikiSnapshot contains updated index/log/pages"],
      requiresHumanConfirmation: false,
      next: ["intent-clarification", "reflection"]
    },
    {
      id: "intent-clarification",
      title: "Clarify website intent",
      owner: "conversation-agent",
      agentRole: "conversation-agent",
      runtimeRole: "conversation-agent",
      planStepKind: "context",
      modelRole: "planner",
      requiredInputs: ["knowledgeBaseSelection", "wikiSnapshot"],
      allowedTools: ["readWikiIndex", "searchWiki"],
      requiredOutputs: ["buildIntent", "intentBrief"],
      hardGates: ["site type, audience, and style are known before build"],
      canExitWhen: ["buildIntent is specific enough to plan a site"],
      requiresHumanConfirmation: true,
      next: ["site-generation"]
    },
    {
      id: "site-generation",
      title: "Generate website draft",
      owner: "builder-agent",
      agentRole: "builder-agent",
      runtimeRole: "builder-agent",
      planStepKind: "compile",
      modelRole: "coder",
      requiredInputs: ["buildIntent", "wikiSnapshot"],
      allowedTools: [
        "readWikiIndex",
        "readWikiPage",
        "searchWiki",
        "recommendDesignAssets",
        "searchDesignAssets",
        "readDesignAsset",
        "createSitePlan",
        "compileSite",
        "writeSiteArtifact"
      ],
      requiredOutputs: ["contentModel", "designUsagePlan", "sitePlan", "siteArtifact"],
      hardGates: [
        "site build uses only the selected knowledge base",
        "builder must produce a design usage plan before the draft is accepted",
        "preview appears only after a build artifact exists"
      ],
      canExitWhen: ["contentModel, designUsagePlan, sitePlan, and siteArtifact are available"],
      requiresHumanConfirmation: false,
      next: ["verification"]
    },
    {
      id: "verification",
      title: "Verify source grounding and site constraints",
      owner: "review-agent",
      agentRole: "review-agent",
      runtimeRole: "review-agent",
      planStepKind: "verify",
      modelRole: "reflection",
      requiredInputs: ["siteArtifact", "designUsagePlan", "buildIntent", "wikiSnapshot"],
      allowedTools: ["readDesignAsset", "verifyWiki", "verifySite", "lintWiki", "auditWorkspace"],
      requiredOutputs: ["verificationReport"],
      hardGates: [
        "hard constraint failures block versioning",
        "missing design usage plan blocks publishable versioning",
        "internal implementation language cannot appear in public site HTML"
      ],
      canExitWhen: ["verificationReport.status is pass or accepted-with-notes"],
      requiresHumanConfirmation: false,
      next: ["versioning"]
    },
    {
      id: "versioning",
      title: "Record build version",
      owner: "harness",
      planStepKind: "version",
      requiredInputs: ["siteArtifact", "designUsagePlan", "verificationReport"],
      allowedTools: ["writeBuildVersion", "publishVersion"],
      requiredOutputs: ["buildVersion"],
      hardGates: ["publishing requires explicit user action"],
      canExitWhen: ["buildVersion is recorded"],
      requiresHumanConfirmation: false,
      next: ["reflection"]
    },
    {
      id: "reflection",
      title: "Reflect and collect system skill evidence",
      owner: "reflection",
      planStepKind: "reflect",
      modelRole: "reflection",
      requiredInputs: ["buildVersion"],
      allowedTools: ["recordReflection", "collectSystemSkillEvidence"],
      requiredOutputs: ["runReflection"],
      hardGates: ["system-level lessons are not promoted from one-off user preferences"],
      canExitWhen: ["runReflection is recorded"],
      requiresHumanConfirmation: false,
      next: []
    }
  ]
};

export const getWorkflowPhase = (
  spec: WorkflowSpec,
  phase: CommanderPhase
): WorkflowPhaseSpec | undefined => spec.phases.find((candidate) => candidate.id === phase);

export const listAllowedToolsForPhase = (
  spec: WorkflowSpec,
  phase: CommanderPhase
): WorkflowToolName[] => getWorkflowPhase(spec, phase)?.allowedTools ?? [];

export const getNextWorkflowPhases = (
  spec: WorkflowSpec,
  phase: CommanderPhase
): CommanderPhase[] => getWorkflowPhase(spec, phase)?.next ?? [];

export type WorkflowToolGateResult = {
  phase: CommanderPhase;
  toolName: WorkflowToolName;
  allowed: boolean;
  allowedToolNames: WorkflowToolName[];
  reason: string;
};

export const validateWorkflowToolGate = (input: {
  spec: WorkflowSpec;
  phase: CommanderPhase;
  toolName: WorkflowToolName;
}): WorkflowToolGateResult => {
  const allowedToolNames = listAllowedToolsForPhase(input.spec, input.phase);
  const allowed = allowedToolNames.includes(input.toolName);
  return {
    phase: input.phase,
    toolName: input.toolName,
    allowed,
    allowedToolNames,
    reason: allowed
      ? `${input.toolName} is allowed during ${input.phase}.`
      : `${input.toolName} is not allowed during ${input.phase}.`
  };
};

export const selectWorkflowPhasesForIntent = (
  spec: WorkflowSpec,
  desiredArtifact: BuildIntent["desiredArtifact"] = "site"
): WorkflowPhaseSpec[] => {
  if (desiredArtifact === "wiki-update") {
    return selectPhases(spec, [
      "workspace-discovery",
      "source-linking",
      "ontology-ingest",
      "mutation-plan-review",
      "wiki-maintenance",
      "reflection"
    ]);
  }

  if (desiredArtifact === "brief") {
    return selectPhases(spec, [
      "workspace-discovery",
      "knowledge-base-selection",
      "intent-clarification",
      "verification",
      "versioning",
      "reflection"
    ]);
  }

  return selectPhases(spec, [
    "workspace-discovery",
    "knowledge-base-selection",
    "intent-clarification",
    "site-generation",
    "verification",
    "versioning",
    "reflection"
  ]);
};

export const createWorkflowPlanSteps = (input: {
  spec: WorkflowSpec;
  desiredArtifact?: BuildIntent["desiredArtifact"];
  ids: HarnessIdGenerator;
  modelRoutingPolicy: ModelRoutingPolicy;
  status?: HarnessPlanStep["status"];
}): HarnessPlanStep[] =>
  selectWorkflowPhasesForIntent(input.spec, input.desiredArtifact).map((phase) => {
    const step: HarnessPlanStep = {
      id: input.ids.next("step"),
      title: phase.title,
      kind: phase.planStepKind,
      status: input.status ?? "pending",
      phase: phase.id,
      owner: phase.owner,
      requiredToolNames: phase.allowedTools,
      requiredOutputNames: phase.requiredOutputs,
      requiresHumanConfirmation: phase.requiresHumanConfirmation
    };
    if (phase.modelRole) {
      const routing = selectModelTier(input.modelRoutingPolicy, phase.modelRole);
      step.modelRole = routing.role;
      step.modelTier = routing.tier;
    }
    return step;
  });

const selectPhases = (
  spec: WorkflowSpec,
  phaseIds: CommanderPhase[]
): WorkflowPhaseSpec[] => {
  const phasesById = new Map(spec.phases.map((phase) => [phase.id, phase]));
  return phaseIds.map((phaseId) => {
    const phase = phasesById.get(phaseId);
    if (!phase) throw new Error(`Workflow phase not found: ${phaseId}`);
    return phase;
  });
};
