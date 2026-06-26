import { createWikiMutationPlanWithOntologyCurator } from "../packages/engine-core/src/index.ts";

const occurredAt = "2026-05-20T10:00:00.000Z";

const sources = [
  {
    id: "source_alpha",
    title: "alpha-notes.md",
    uri: "file:///tmp/alpha-notes.md",
    mediaType: "text/markdown",
    contentHash: "hash_alpha",
    content:
      "Mingyu builds Personal Wiki Harness with TypeScript. Skills include ontology design, agent orchestration, and product architecture.",
    contentMode: "inline",
    createdAt: occurredAt
  },
  {
    id: "source_beta",
    title: "beta-notes.md",
    uri: "file:///tmp/beta-notes.md",
    mediaType: "text/markdown",
    contentHash: "hash_beta",
    content: "The generated website should compile durable wiki meaning into a shareable artifact.",
    contentMode: "inline",
    createdAt: occurredAt
  }
];

const executor = {
  async execute(trace) {
    return {
      ...trace,
      status: "completed",
      startedAt: occurredAt,
      finishedAt: occurredAt,
      result: {
        id: `${trace.id}_result`,
        role: trace.role,
        status: "completed",
        summary: "Extracted model-backed ontology candidates.",
        decisions: ["Keep model candidates as human-reviewed mutation-plan inputs."],
        artifacts: [
          {
            id: "artifact_model_ontology",
            kind: "ontology-extraction",
            title: "Model ontology extraction",
            summary: "Model-generated ontology candidates.",
            data: {
              items: [
                {
                  kind: "skill",
                  label: "ontology design",
                  summary: "A durable skill implied by the source notes.",
                  confidence: 0.81,
                  evidenceSourceIds: ["source_alpha"],
                  candidateEntity: {
                    kind: "skill",
                    name: "ontology design",
                    aliases: ["knowledge modeling"]
                  }
                },
                {
                  kind: "relation",
                  label: "Mingyu builds Personal Wiki Harness",
                  summary: "The source connects Mingyu to the project.",
                  confidence: 0.72,
                  evidenceSourceIds: ["source_alpha"],
                  candidateRelation: {
                    fromEntityId: "candidate_person_mingyu",
                    toEntityId: "candidate_project_pwh",
                    predicate: "builds"
                  }
                },
                {
                  kind: "topic",
                  label: "invalid orphan topic",
                  summary: "This should be rejected because it cites an unknown source.",
                  confidence: 0.7,
                  evidenceSourceIds: ["missing_source"]
                }
              ],
              openQuestions: ["Confirm whether ontology design should be promoted as a durable skill."]
            }
          }
        ],
        evidenceRefs: ["source:source_alpha"],
        artifactRefs: ["artifact:artifact_model_ontology"],
        mustCarryForwardRefs: [`context-packet:${trace.packet.id}`, "artifact:artifact_model_ontology"],
        discardableContext: ["Full transcript can be discarded after structured candidates are preserved."],
        contextDeltas: [
          {
            action: "keep",
            targetId: "artifact:artifact_model_ontology",
            summary: "Keep the structured ontology artifact.",
            reason: "Mutation-plan review depends on candidate evidence refs."
          }
        ],
        toolCalls: []
      }
    };
  }
};

const result = await createWikiMutationPlanWithOntologyCurator({
  title: "Smoke Wiki",
  sources,
  occurredAt,
  subAgentExecutor: executor,
  parentRunId: "smoke"
});

const extractionOperation = result.mutationPlan.operations.find(
  (operation) => operation.kind === "record-ontology-extraction"
);
const labels = extractionOperation?.ontologyExtraction?.items.map((item) => item.label) ?? [];

if (result.mutationPlan.humanReviewState !== "pending") {
  throw new Error("Expected model-backed mutation plan to be pending human review.");
}
if (result.review.decision !== "needs-human-review") {
  throw new Error("Expected review decision to require human review.");
}
if (!labels.includes("ontology design")) {
  throw new Error("Expected model skill candidate to be preserved.");
}
if (labels.includes("invalid orphan topic")) {
  throw new Error("Expected unknown-source ontology candidate to be rejected.");
}
if (result.rejectedCandidateCount !== 1) {
  throw new Error(`Expected 1 rejected candidate, got ${result.rejectedCandidateCount}.`);
}

console.log(
  JSON.stringify(
    {
      mutationPlanId: result.mutationPlan.id,
      humanReviewState: result.mutationPlan.humanReviewState,
      reviewDecision: result.review.decision,
      ontologyCandidateCount: result.ontologyExtraction.items.length,
      rejectedCandidateCount: result.rejectedCandidateCount,
      reviewQuestions: result.reviewQuestions
    },
    null,
    2
  )
);
