import "server-only";
import { randomUUID } from "node:crypto";
import type { CreateAgentMessage, CreateAgentResponse, KnowledgeBaseSummary, SiteBrief } from "../create-agent-types";
import { completeStudioChat } from "./llm-client.ts";

type CreateAgentSession = {
  id: string;
  brief: SiteBrief;
  messages: CreateAgentMessage[];
  updatedAt: string;
};

type ModelAgentResult = {
  assistant?: string;
  brief?: Partial<SiteBrief>;
  canGenerate?: boolean;
};

type AssistantAgentMessage = {
  id?: string;
  role: "assistant";
  content: string;
};

const sessions = new Map<string, CreateAgentSession>();

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

const mergeUnique = (values: string[], next: string[]) => Array.from(new Set([...values, ...next]));

const clampSections = (sections: string[]) => {
  const cleaned = sections.map((section) => section.trim()).filter(Boolean);
  return cleaned.length ? cleaned.slice(0, 6) : ["关于我", "项目", "写作"];
};

function inferBriefFromText(text: string, current: SiteBrief): SiteBrief {
  const next = { ...current, sections: clampSections(current.sections) };
  const compact = text.toLowerCase();
  const titleMatch = text.match(/(?:网站名|名字|标题|叫)(?:是|为|：|:)?\s*([^\n，。,.]{2,24})/);

  if (titleMatch?.[1]) next.title = titleMatch[1].trim();

  if (includesAny(compact, ["个人主页", "个人网站", "个人品牌", "主页"])) {
    next.siteType = "个人品牌网站";
    next.goal = "用一个清晰的网站集中呈现个人经历、能力和长期表达。";
  }
  if (includesAny(compact, ["项目", "作品", "portfolio", "作品集"])) {
    next.siteType = next.siteType || "作品集网站";
    next.goal = "展示代表性项目和作品，让访问者快速理解能力与成果。";
    next.sections = mergeUnique(next.sections, ["项目"]);
  }
  if (includesAny(compact, ["博客", "写作主页", "文章网站", "内容站"])) {
    next.siteType = "写作与内容网站";
  }
  if (includesAny(compact, ["产品官网", "产品网站", "saas", "工具网站", "应用网站"])) {
    next.siteType = "产品官网";
    next.goal = next.goal || "清楚说明产品价值、使用场景和行动入口。";
  }
  if (includesAny(compact, ["课程", "咨询", "服务", "工作室"])) {
    next.siteType = next.siteType || "服务介绍网站";
    next.goal = next.goal || "介绍服务内容、可信证据和转化入口。";
  }
  if (includesAny(compact, ["写作", "文章", "博客", "思考"])) {
    next.sections = mergeUnique(next.sections, ["写作"]);
  }
  if (includesAny(compact, ["履历", "简历", "经历", "背景"])) {
    next.sections = mergeUnique(next.sections, ["经历"]);
  }

  if (includesAny(compact, ["合作", "伙伴", "客户", "商业", "投资"])) {
    next.audience = "合作伙伴、潜在客户和新的机会";
  }
  if (includesAny(compact, ["潜在用户", "用户", "使用者", "访客"])) {
    next.audience = "潜在用户和公开访问者";
  }
  if (includesAny(compact, ["招聘", "面试", "hr", "雇主", "求职"])) {
    next.audience = "招聘方、面试官和未来团队";
  }
  if (includesAny(compact, ["朋友", "同学", "读者", "公众"])) {
    next.audience = next.audience || "朋友、读者和公开访问者";
  }

  if (includesAny(compact, ["ai", "产品", "知识建模", "工具", "创造"])) {
    next.memory = "让人记住我在 AI 产品、知识建模和创造工具上的能力。";
  }
  if (includesAny(compact, ["可信", "专业", "清晰", "克制"])) {
    next.memory = next.memory || "让人感到清晰、可信、专业。";
  }
  if (includesAny(compact, ["有趣", "个人气质", "表达", "审美"])) {
    next.memory = next.memory || "留下有个人气质和审美判断的印象。";
  }

  if (includesAny(compact, ["极简", "简洁", "minimal"])) next.style = "minimalist";
  if (includesAny(compact, ["杂志", "编辑", "editorial"])) next.style = "editorial";
  if (includesAny(compact, ["作品集", "portfolio"])) next.style = "portfolio";
  if (includesAny(compact, ["大胆", "创意", "creative", "强视觉", "科技感", "未来感"])) next.style = "creative";

  next.sections = clampSections(next.sections);
  return next;
}

function buildReply(brief: SiteBrief, messages: CreateAgentMessage[], knowledgeBase?: KnowledgeBaseSummary) {
  const missing = [
    brief.siteType ? "" : "你想创建哪一类网站，比如个人主页、作品集、博客、产品官网或服务介绍",
    brief.audience ? "" : "这个网站主要面向谁",
    brief.style ? "" : "你希望整体是什么风格，比如极简、杂志感、作品集或更有创意",
    brief.goal ? "" : "这个网站最重要的用途是什么",
    brief.memory ? "" : "希望别人看完记住什么"
  ].filter(Boolean);

  if (missing.length === 0) {
    return `${buildReadyAcknowledgement(brief, messages)} 我会只基于「${knowledgeBase?.name || "已选知识库"}」生成网站草稿。现在信息已经够了，我会直接开始生成。`;
  }

  const hasSeveralTurns = messages.filter((message) => message.role === "user").length > 1;
  const prefix = hasSeveralTurns
    ? "我更新了需求理解。"
    : `我会先只使用「${knowledgeBase?.name || "已选知识库"}」这一个知识库。`;
  return `${prefix} 还想再确认一下：${missing[0]}？`;
}

function buildReadyAcknowledgement(brief: SiteBrief, messages: CreateAgentMessage[]) {
  const latestUserText = messages
    .filter((message) => message.role === "user")
    .at(-1)
    ?.content.trim();
  const compact = latestUserText?.replace(/\s+/g, " ");
  if (!compact) return "收到。";

  if (compact.length <= 36) {
    return `收到，我会把“${compact}”放进这版网站需求里。`;
  }

  const focus = [brief.siteType, brief.audience, styleLabel(brief.style)]
    .filter(Boolean)
    .join("、");
  return focus
    ? `收到，我会按${focus}这几个方向整理成网站草稿。`
    : "收到，我会把这些补充放进这版网站需求里。";
}

function styleLabel(style: SiteBrief["style"]) {
  if (style === "editorial") return "杂志感";
  if (style === "minimalist") return "极简";
  if (style === "portfolio") return "作品集";
  if (style === "creative") return "创意视觉";
  return "";
}

export async function runCreateAgent(input: {
  conversationId?: string;
  message: string;
  brief: SiteBrief;
  messages: CreateAgentMessage[];
  knowledgeBase?: KnowledgeBaseSummary;
}): Promise<CreateAgentResponse> {
  const existing = input.conversationId ? sessions.get(input.conversationId) : undefined;
  const conversationId = existing?.id ?? randomUUID();
  const baseBrief = existing?.brief ?? input.brief;
  const userMessages = input.messages.length ? input.messages : existing?.messages ?? [];
  const localBrief = inferBriefFromText(input.message, baseBrief);
  let brief = localBrief;
  let modelBacked = false;
  let fallbackReason: string | undefined;
  let assistantMessage: AssistantAgentMessage = {
    role: "assistant" as const,
    content: buildReply(localBrief, userMessages, input.knowledgeBase)
  };

  try {
    const modelInput: {
      message: string;
      brief: SiteBrief;
      messages: CreateAgentMessage[];
      knowledgeBase?: KnowledgeBaseSummary;
    } = {
      message: input.message,
      brief: localBrief,
      messages: userMessages
    };
    if (input.knowledgeBase) modelInput.knowledgeBase = input.knowledgeBase;
    const modelResult = await callCreateAgentModel(modelInput);
    if (modelResult) {
      modelBacked = true;
      brief = normalizeBrief(modelResult.brief, localBrief);
      assistantMessage = {
        role: "assistant",
          content: modelResult.assistant?.trim() || buildReply(brief, userMessages, input.knowledgeBase)
      };
    } else {
      fallbackReason = "create-agent route returned no parseable JSON response";
    }
  } catch (error) {
    fallbackReason = error instanceof Error ? error.message : String(error);
    console.warn("[create-agent] model call failed, using local fallback:", fallbackReason);
  }

  const canGenerate = Boolean(brief.siteType && brief.audience && brief.style);
  assistantMessage = normalizeReadyMessage(assistantMessage, canGenerate);
  const messages = [...userMessages, assistantMessage];

  sessions.set(conversationId, {
    id: conversationId,
    brief,
    messages,
    updatedAt: new Date().toISOString()
  });

  return {
    conversationId,
    brief,
    assistantMessage,
    canGenerate,
    modelBacked,
    ...(fallbackReason ? { fallbackReason } : {})
  };
}

function normalizeReadyMessage(
  message: AssistantAgentMessage,
  canGenerate: boolean
): AssistantAgentMessage {
  if (!canGenerate) return message;

  const content = message.content
    .replace(/你可以点击[“"]?生成网站[”"]?按钮?[^。！？!?]*(?:[。！？!?]|$)/g, "我会直接开始生成网站草稿。")
    .replace(/可以点击[“"]?生成网站[”"]?按钮?[^。！？!?]*(?:[。！？!?]|$)/g, "我会直接开始生成网站草稿。")
    .replace(/现在可以点击[^。！？!?]*(?:[。！？!?]|$)/g, "我会直接开始生成网站草稿。")
    .trim();

  if (/开始生成|正在生成|生成网站草稿/.test(content)) {
    return { ...message, content };
  }

  return {
    ...message,
    content: `${content} 我会直接开始生成网站草稿。`
  };
}

async function callCreateAgentModel(input: {
  message: string;
  brief: SiteBrief;
  messages: CreateAgentMessage[];
  knowledgeBase?: KnowledgeBaseSummary;
}): Promise<ModelAgentResult | null> {
  const response = await completeStudioChat("create-agent", {
    responseFormat: "json_object",
    tools: [],
    messages: [
        {
          role: "system",
          content:
            "你是一个面向普通用户的个人网站创建助手。你只帮助用户把想法变成清晰的网站 brief，并给出自然的下一句回复。必须优先确认：网站类型、目标受众、视觉风格。不要暴露系统架构、工具名、模型名、内部实现或 JSON 以外的内容。"
        },
        {
          role: "user",
          content: buildModelPrompt(input)
        }
      ]
  });
  if (!response) return null;
  const content = response.message.content;
  return parseModelJson(content);
}

function buildModelPrompt(input: {
  message: string;
  brief: SiteBrief;
  messages: CreateAgentMessage[];
  knowledgeBase?: KnowledgeBaseSummary;
}) {
  const transcript = input.messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n");

  return [
    "请根据当前用户消息、现有 brief 和最近对话，返回一个 JSON 对象。",
    "",
    "JSON shape:",
    "{",
    '  "assistant": "一句自然的中文回复，继续追问；如果信息已足够，就说明会开始生成",',
    '  "brief": { "title": string, "siteType": string, "goal": string, "audience": string, "memory": string, "style": "editorial|minimalist|portfolio|creative|", "sections": string[] },',
    '  "canGenerate": boolean',
    "}",
    "",
    "规则：",
    "- assistant 里不要说你是总指挥，不要提 agent/harness/model/API。",
    "- 已选知识库是唯一内容上下文，不要建议混用其他知识库。",
    "- 追问顺序：先问网站类型，再问面向谁，再问视觉风格，然后才问用途或记忆点。",
    "- 如果信息不够，最多问一个关键问题。",
    "- 只有网站类型、受众、风格都明确后，才告诉用户会开始生成网站；不要要求用户点击生成按钮。",
    "- brief 要保留已有信息，只补充或修正用户明确表达的内容。",
    "",
    `已选知识库：${input.knowledgeBase?.name || "未提供"}`,
    `知识库说明：${input.knowledgeBase?.description || ""}`,
    "知识库 Wiki 索引：",
    input.knowledgeBase?.wikiIndex?.slice(0, 2400) || "",
    "",
    `当前用户消息：${input.message}`,
    "",
    `现有 brief：${JSON.stringify(input.brief)}`,
    "",
    "最近对话：",
    transcript
  ].join("\n");
}

function parseModelJson(content: string): ModelAgentResult | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  const parsed = JSON.parse(candidate) as ModelAgentResult;
  return parsed && typeof parsed === "object" ? parsed : null;
}

function normalizeBrief(input: ModelAgentResult["brief"], fallback: SiteBrief): SiteBrief {
  if (!input || typeof input !== "object") {
    return fallback;
  }

    return {
      title: typeof input.title === "string" && input.title.trim() ? input.title.trim() : fallback.title,
      siteType: typeof input.siteType === "string" ? input.siteType.trim() : fallback.siteType,
      goal: typeof input.goal === "string" ? input.goal.trim() : fallback.goal,
    audience: typeof input.audience === "string" ? input.audience.trim() : fallback.audience,
    memory: typeof input.memory === "string" ? input.memory.trim() : fallback.memory,
    style: normalizeStyle(input.style, fallback.style),
    sections: Array.isArray(input.sections) ? clampSections(input.sections.map(String)) : fallback.sections
  };
}

function normalizeStyle(input: unknown, fallback: SiteBrief["style"]): SiteBrief["style"] {
  return input === "editorial" || input === "minimalist" || input === "portfolio" || input === "creative" || input === ""
    ? input
    : fallback;
}
