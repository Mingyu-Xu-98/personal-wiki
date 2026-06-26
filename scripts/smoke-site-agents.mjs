import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";

const stateDir = await mkdtemp("/private/tmp/pwh-site-agents-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "state.json");
process.env.PWH_SITE_AGENTS_ENABLED = "true";
process.env.PWH_LLM_BASE_URL = "https://example.invalid/v1";
process.env.PWH_LLM_API_KEY = "test-key";
process.env.PWH_SITE_PLANNER_MODEL = "planner-test-model";
process.env.PWH_SITE_BUILDER_MODEL = "builder-test-model";
delete process.env.PWH_WIKI_CURATOR_ENABLED;

const fetchCalls = [];

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  const userMessage = [...body.messages].reverse().find((message) => message.role === "user");
  const packet = JSON.parse(userMessage.content);
  fetchCalls.push({
    role: packet.role,
    model: body.model,
    packet
  });

  const hasToolResult = body.messages.some((message) => message.role === "tool");
  if (packet.role === "builder-agent" && !hasToolResult) {
    return jsonResponse({
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "call_recommend_design",
                type: "function",
                function: {
                  name: "recommendDesignAssets",
                  arguments: JSON.stringify({
                    siteType: "technical personal site",
                    audience: "founders",
                    style: "calm editorial"
                  })
                }
              },
              {
                id: "call_read_index",
                type: "function",
                function: {
                  name: "readWikiIndex",
                  arguments: "{}"
                }
              },
              {
                id: "call_read_design",
                type: "function",
                function: {
                  name: "readDesignAsset",
                  arguments: JSON.stringify({ assetId: "hero-identity-thesis" })
                }
              },
              {
                id: "call_compile_site",
                type: "function",
                function: {
                  name: "compileSite",
                  arguments: JSON.stringify({ title: "Model Planned Site" })
                }
              }
            ]
          }
        }
      ]
    });
  }

  if (packet.role === "site-planner" && !hasToolResult) {
    return jsonResponse({
      choices: [
        {
          message: {
            content: "",
            tool_calls: []
          }
        }
      ]
    });
  }

  if (packet.role === "site-compiler" && !hasToolResult) {
    return jsonResponse({
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "call_compile_site",
                type: "function",
                function: {
                  name: "compileSite",
                  arguments: JSON.stringify({ title: "Model Planned Site" })
                }
              }
            ]
          }
        }
      ]
    });
  }

  const content =
    packet.role === "builder-agent"
      ? JSON.stringify(createBuilderAgentOutput(body, packet, packet.goal.includes("Bad Internal Site")))
      : packet.role === "site-planner"
        ? JSON.stringify(createPlannerOutput(body, packet))
        : JSON.stringify(createBuilderOutput(packet, packet.goal.includes("Bad Internal Site")));
  return jsonResponse({
    choices: [
      {
        message: {
          content
        }
      }
    ]
  });
};

const {
  addSource,
  createKnowledgeBase,
  createRun
} = await import("../apps/studio/lib/server/store.ts");

const userId = `site_agents_smoke_${Date.now()}`;
const base = createKnowledgeBase(userId, {
  name: "Model Site Agent Wiki",
  description: "Verifies model-backed site planner and builder handoffs."
});

await addSource({
  userId,
  baseId: base.id,
  title: "Model Site Agent Notes",
  content:
    "The website should explain a personal wiki product for founders, with a calm editorial voice and clear evidence from the knowledge base."
});

const run = await createRun(userId, {
  title: "Model Planned Site",
  prompt: "Create a concise public website from this knowledge base.",
  audience: "founders",
  desiredArtifact: "site",
  knowledgeBaseId: base.id,
  knowledgeBaseName: base.name,
  constraints: ["Use only the selected knowledge base."]
});

assert.equal(run.state, "versioned");
assert.equal(run.buildVersion?.contentModel?.title, "Model Planned Site");
assert.equal(run.buildVersion?.contentModel?.sections.at(0)?.id, "section_intro");
assert.equal(run.buildVersion?.sitePlan?.routes.at(0)?.sectionIds.at(0), "section_intro");
assert.equal(run.buildVersion?.siteArtifact?.files.at(0)?.path, "index.html");
assert.match(run.buildVersion?.siteArtifact?.files.at(0)?.content ?? "", /Model Planned Site/);
assert.equal(run.buildVersion?.lintIssues.some((issue) => issue.severity === "error"), false);

const modelRoles = fetchCalls.map((call) => call.role);
assert.deepEqual([...new Set(modelRoles)], ["builder-agent"]);
assert.ok(fetchCalls.some((call) => call.model === "builder-test-model"));

const harnessRoles = [...new Set(run.subAgentTraces?.map((trace) => trace.role) ?? [])];
assert.deepEqual(harnessRoles, ["conversation-agent", "builder-agent", "review-agent"]);
assert.ok(run.buildVersion?.designUsagePlan?.selectedAssets.some((asset) => asset.assetId === "hero-identity-thesis"));

const builderTrace = run.subAgentTraces?.find((trace) => trace.role === "builder-agent");
assert.equal(builderTrace?.status, "completed");
assert.ok(builderTrace?.result?.toolCalls.some((call) => call.toolName === "readWikiIndex"));
assert.ok(builderTrace?.result?.toolCalls.some((call) => call.toolName === "recommendDesignAssets"));
assert.ok(builderTrace?.result?.toolCalls.some((call) => call.toolName === "readDesignAsset"));
assert.ok(run.toolCalls.some((call) => call.toolName === "readWikiIndex"));
assert.ok(run.observabilityEvents?.some((event) => event.type === "agent.completed" && event.agentRole === "builder-agent"));
assert.ok(run.observabilityEvents?.some((event) => event.type === "tool.completed" && event.toolName === "recommendDesignAssets"));
assert.ok(run.observabilityEvents?.some((event) => event.type === "skill.selected"));
assert.ok(run.observabilityEvents?.some((event) => event.type === "verification.completed"));

const badUserId = `site_agents_bad_${Date.now()}`;
const badBase = createKnowledgeBase(badUserId, {
  name: "Bad Internal Wiki",
  description: "Verifies that internal system language blocks versioning."
});

await addSource({
  userId: badUserId,
  baseId: badBase.id,
  title: "Bad Internal Notes",
  content: "This wiki should generate a public website without exposing implementation details."
});

const blockedRun = await createRun(badUserId, {
  title: "Bad Internal Site",
  prompt: "Create a public website and ensure internal system language is not exposed.",
  audience: "public visitors",
  desiredArtifact: "site",
  knowledgeBaseId: badBase.id,
  knowledgeBaseName: badBase.name,
  constraints: ["Do not expose internal system language."]
});

assert.equal(blockedRun.state, "failed");
assert.match(blockedRun.error ?? "", /Build verification blocked versioning/);

console.log(
  JSON.stringify(
    {
      stateDir,
      runId: run.id,
      contentModelTitle: run.buildVersion?.contentModel?.title,
      modelRoles,
      builderToolCalls: builderTrace?.result?.toolCalls.map((call) => call.toolName) ?? [],
      observabilityEvents: run.observabilityEvents?.length ?? 0
    },
    null,
    2
  )
);

function createBuilderAgentOutput(body, packet, includeInternalLanguage = false) {
  const plannerOutput = createPlannerOutput(body, packet);
  const contentModel = plannerOutput.artifacts.find((artifact) => artifact.kind === "content-model")?.data;
  const sectionIds = contentModel?.sections?.map((section) => section.id) ?? [];
  return {
    summary: "Built a compact public site from the selected wiki and selected design assets.",
    decisions: [
      "Use one Builder Agent to plan content, choose design assets, create route structure, and compile HTML.",
      "Keep selected design assets as stable refs for future patch builds."
    ],
    artifacts: [
      ...plannerOutput.artifacts.slice(0, 1),
      {
        id: "model_design_usage_plan",
        kind: "design-usage-plan",
        title: "Model Design Usage Plan",
        summary: "Design asset choices generated by the fake model-backed builder.",
        data: {
          goal: "Use concrete design assets while preserving wiki-grounded content.",
          selectedAssets: [
            {
              assetId: "hero-identity-thesis",
              role: "hero",
              targetSectionIds: sectionIds,
              reason: "The first draft needs a clear identity-led hero section.",
              constraints: ["Keep copy grounded in wiki pages.", "Avoid internal harness language."]
            }
          ],
          rejectedAssets: [],
          notes: ["Magic UI style assets are represented as stable design refs."]
        }
      },
      ...plannerOutput.artifacts.slice(1),
      {
        id: "model_html",
        kind: "html",
        title: "Model HTML Draft",
        summary: "HTML artifact generated by the fake model-backed builder.",
        data: {
          html: includeInternalLanguage
            ? "<!doctype html><html><body><main><h1>Bad Internal Site</h1><p>model routing leaked.</p></main></body></html>"
            : "<!doctype html><html><body><main><h1>Model Planned Site</h1></main></body></html>"
        }
      }
    ],
    evidenceRefs: plannerOutput.evidenceRefs,
    artifactRefs: [
      "content-model:model_content",
      "design-usage-plan:model_design_usage_plan",
      "site-plan:model_site_plan",
      "html:model_html"
    ],
    mustCarryForwardRefs: packet.requiredCarryForwardRefs,
    discardableContext: [],
    contextDeltas: [
      {
        action: "keep",
        targetId: "design-usage-plan:model_design_usage_plan",
        summary: "Keep the selected design asset refs.",
        reason: "Patch builds need to preserve or intentionally revise design choices."
      }
    ]
  };
}

function createPlannerOutput(body, packet) {
  const readIndexMessage = body.messages.find((message) => message.role === "tool" && message.name === "readWikiIndex");
  const toolEnvelope = readIndexMessage ? JSON.parse(readIndexMessage.content) : {};
  const pages = toolEnvelope.output?.wikiSummary?.pages ?? [];
  const sourcePageIds = pages
    .filter((page) => page.kind !== "index")
    .slice(0, 2)
    .map((page) => page.id);

  return {
    summary: "Planned a compact public site from the selected wiki.",
    decisions: ["Use a single-page editorial structure for the first generated draft."],
    artifacts: [
      {
        id: "model_content",
        kind: "content-model",
        title: "Model Planned Content",
        summary: "Content model generated by the fake model-backed planner.",
        data: {
          title: "Model Planned Site",
          thesis: "A personal wiki can become a clear public website without losing evidence.",
          audience: "founders",
          sourcePageIds,
          sections: [
            {
              id: "section_intro",
              title: "Why This Exists",
              purpose: "orient",
              sourceEntityIds: [],
              sourcePageIds,
              designAssetRefs: ["layout-single-page-editorial", "hero-identity-thesis"],
              componentRefs: ["layout-single-page-editorial", "hero-identity-thesis"],
              contentBlocks: [
                {
                  kind: "markdown",
                  markdown: "A personal wiki gives the site a durable source of meaning."
                }
              ]
            }
          ]
        }
      },
      {
        id: "model_site_plan",
        kind: "site-plan",
        title: "Model Planned Site Plan",
        summary: "Single route plan generated by the fake model-backed planner.",
        data: {
          routes: [
            {
              path: "/",
              title: "Model Planned Site",
              sectionIds: ["section_intro"]
            }
          ],
          navigation: [
            {
              label: "Home",
              href: "/"
            }
          ]
        }
      }
    ],
    evidenceRefs: sourcePageIds.map((pageId) => `wiki-page:${pageId}`),
    artifactRefs: ["content-model:model_content", "site-plan:model_site_plan"],
    mustCarryForwardRefs: packet.requiredCarryForwardRefs,
    discardableContext: [],
    contextDeltas: [
      {
        action: "keep",
        targetId: "content-model:model_content",
        summary: "Keep the structured content model.",
        reason: "The site builder needs it as a source artifact."
      }
    ]
  };
}

function createBuilderOutput(packet, includeInternalLanguage = false) {
  return {
    summary: "Compiled a draft HTML artifact from prior site planning artifacts.",
    decisions: ["Keep internal harness language out of the user-facing draft."],
    artifacts: [
      {
        id: "model_html",
        kind: "html",
        title: "Model HTML Draft",
        summary: "HTML artifact generated by the fake model-backed builder.",
        data: {
          html: includeInternalLanguage
            ? "<!doctype html><html><body><main><h1>Bad Internal Site</h1><p>model routing leaked.</p></main></body></html>"
            : "<!doctype html><html><body><main><h1>Model Planned Site</h1></main></body></html>"
        }
      }
    ],
    evidenceRefs: [],
    artifactRefs: ["html:model_html"],
    mustCarryForwardRefs: packet.requiredCarryForwardRefs,
    discardableContext: [],
    contextDeltas: []
  };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
