import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import {
  createKnowledgeChatToolRegistry,
  getKnowledgeBaseContext,
  prepareStudioState,
  recordUsage
} from "../../../lib/server/store";
import { runCreateAgent } from "../../../lib/server/create-agent";
import type { CreateAgentMessage, SiteBrief } from "../../../lib/create-agent-types";

const fallbackBrief: SiteBrief = {
  title: "我的个人网站",
  siteType: "",
  goal: "",
  audience: "",
  memory: "",
  style: "",
  sections: ["关于我", "项目", "写作"]
};

export async function POST(request: Request) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const body = await request.json();
  const message = String(body.message || "");
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  const brief = isBrief(body.brief) ? body.brief : fallbackBrief;
  const messages = Array.isArray(body.messages) ? body.messages.filter(isMessage) : [];
  const knowledgeBaseId = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : undefined;
  const knowledgeBase = getKnowledgeBaseContext(user.id, knowledgeBaseId);
  const toolRegistry = createKnowledgeChatToolRegistry(user.id, knowledgeBase.id);

  const result = await runCreateAgent({ conversationId, message, brief, messages, knowledgeBase, toolRegistry });
  await recordUsage(user.id, {
    kind: "llm",
    quantity: message.length + messages.reduce((sum: number, entry: CreateAgentMessage) => sum + entry.content.length, 0),
    costUnits: result.modelBacked ? 2 : 1,
    refId: result.conversationId,
    metadata: {
      useCase: "create-agent",
      modelBacked: result.modelBacked,
      knowledgeBaseId: knowledgeBase.id
    }
  });
  return NextResponse.json(result);
}

function isBrief(value: unknown): value is SiteBrief {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<SiteBrief>;
  return (
    typeof entry.title === "string" &&
    typeof entry.siteType === "string" &&
    typeof entry.goal === "string" &&
    typeof entry.audience === "string" &&
    typeof entry.memory === "string" &&
    typeof entry.style === "string" &&
    Array.isArray(entry.sections)
  );
}

function isMessage(value: unknown): value is CreateAgentMessage {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CreateAgentMessage>;
  return (entry.role === "user" || entry.role === "assistant") && typeof entry.content === "string";
}
