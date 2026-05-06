export type SystemMetaSkillId = string;

export type MetaSkillScope = "system";

export type SystemMetaSkillStatus = "candidate" | "active" | "deprecated";

export type SystemMetaSkillRisk = "low" | "medium" | "high";

export type SkillTrigger = {
  intentKinds: string[];
  keywords: string[];
  toolNames: string[];
};

export type ProcedureStep = {
  id: string;
  instruction: string;
  required: boolean;
};

export type SkillEvidence = {
  id: string;
  runId: string;
  observedAt: string;
  signal: "helped" | "hurt" | "neutral";
  summary: string;
};

export type SkillEvaluation = {
  id: string;
  evaluatedAt: string;
  score: number;
  notes: string;
};

export type SystemMetaSkill = {
  id: SystemMetaSkillId;
  scope: MetaSkillScope;
  status: SystemMetaSkillStatus;
  title: string;
  summary: string;
  trigger: SkillTrigger;
  procedure: ProcedureStep[];
  risk: SystemMetaSkillRisk;
  evidence: SkillEvidence[];
  evaluations: SkillEvaluation[];
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type CandidateSystemMetaSkill = Omit<SystemMetaSkill, "scope" | "status" | "version"> & {
  source: "run-reflection" | "manual-design" | "lint-pattern";
};

export type SystemSkillPromotionPolicy = {
  minimumHelpfulEvidence: number;
  minimumEvaluationScore: number;
  requiresHumanApproval: boolean;
};

export type SystemSkillLibrary = {
  skills: SystemMetaSkill[];
  promotionPolicy: SystemSkillPromotionPolicy;
};

export const defaultSystemSkillPromotionPolicy: SystemSkillPromotionPolicy = {
  minimumHelpfulEvidence: 3,
  minimumEvaluationScore: 0.8,
  requiresHumanApproval: true
};

export const createInitialSystemSkillLibrary = (createdAt: string): SystemSkillLibrary => ({
  promotionPolicy: defaultSystemSkillPromotionPolicy,
  skills: [
    {
      id: "system-skill_personal-wiki-compilation",
      scope: "system",
      status: "active",
      title: "Compile from wiki meaning, not raw chat",
      summary:
        "Treat raw sources as immutable evidence, the maintained wiki as the source of meaning, and the website as a compiled artifact.",
      trigger: {
        intentKinds: ["site", "page", "brief", "wiki-update"],
        keywords: ["wiki", "site", "compile", "source"],
        toolNames: []
      },
      procedure: [
        {
          id: "step_read_wiki_first",
          instruction: "Read or summarize the wiki layer before drafting site structure.",
          required: true
        },
        {
          id: "step_preserve_sources",
          instruction: "Use raw sources as evidence and never rewrite source content during compilation.",
          required: true
        },
        {
          id: "step_version_output",
          instruction: "Record compiled artifacts as build versions tied to the originating harness run.",
          required: true
        }
      ],
      risk: "medium",
      evidence: [],
      evaluations: [],
      createdAt,
      updatedAt: createdAt,
      version: 1
    },
    {
      id: "system-skill_model-tier-routing",
      scope: "system",
      status: "active",
      title: "Route strong models to command decisions",
      summary:
        "Use stronger models for orchestration, planning, promotion, and high-risk reflection; use lower-cost models for bounded code, summarization, search, and in-site AI calls.",
      trigger: {
        intentKinds: ["site", "page", "brief", "wiki-update"],
        keywords: ["model", "routing", "cost", "agent", "tool"],
        toolNames: []
      },
      procedure: [
        {
          id: "step_strong_commander",
          instruction: "Route commander, planner, and system-skill promotion decisions to the strong tier.",
          required: true
        },
        {
          id: "step_small_bounded",
          instruction: "Route bounded implementation, summarization, retrieval, and website assistant calls to cheaper tiers when risk is low.",
          required: true
        },
        {
          id: "step_record_decision",
          instruction: "Record every non-default model routing decision in the run ledger.",
          required: true
        }
      ],
      risk: "low",
      evidence: [],
      evaluations: [],
      createdAt,
      updatedAt: createdAt,
      version: 1
    }
  ]
});

export const selectActiveSystemSkills = (
  library: SystemSkillLibrary,
  intentKind: string,
  prompt: string
): SystemMetaSkill[] => {
  const normalizedPrompt = prompt.toLowerCase();
  return library.skills.filter((skill) => {
    if (skill.status !== "active") {
      return false;
    }

    const matchesIntent = skill.trigger.intentKinds.includes(intentKind);
    const matchesKeyword = skill.trigger.keywords.some((keyword) =>
      normalizedPrompt.includes(keyword.toLowerCase())
    );
    return matchesIntent || matchesKeyword;
  });
};

export const appendSystemSkillEvidence = (
  library: SystemSkillLibrary,
  skillId: SystemMetaSkillId,
  evidence: SkillEvidence
): SystemSkillLibrary => ({
  ...library,
  skills: library.skills.map((skill) =>
    skill.id === skillId
      ? {
          ...skill,
          evidence: [...skill.evidence, evidence],
          updatedAt: evidence.observedAt
        }
      : skill
  )
});
