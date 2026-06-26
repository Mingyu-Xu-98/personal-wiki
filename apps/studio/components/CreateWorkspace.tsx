"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GeneratedSitePreview } from "./GeneratedSitePreview";
import type { CreateAgentResponse, KnowledgeBaseSummary, SiteBrief } from "../lib/create-agent-types";

type Run = {
  id: string;
  state: string;
  intent: { title: string; prompt: string; knowledgeBaseId?: string; knowledgeBaseName?: string };
  toolCalls?: Array<{ id: string; toolName: string; status: "completed" | "failed" }>;
  observabilityEvents?: HarnessObservationEvent[];
  buildVersion?: {
    id: string;
    summary: string;
    createdAt?: string;
    parentVersionId?: string;
    changeSummary?: string;
    contentModel?: {
      title: string;
      thesis: string;
      audience: string;
      sections?: Array<{
        id: string;
        title: string;
        purpose?: string;
        contentBlocks?: Array<{ kind: "markdown" | "entity-list" | "timeline"; markdown?: string }>;
      }>;
    };
    siteArtifact?: {
      files?: Array<{ path: string; mediaType: string; content: string }>;
    };
    lintIssues?: Array<{ severity: string; code: string; message: string }>;
  };
};

type HarnessObservationEvent = {
  id: string;
  runId: string;
  intentId: string;
  createdAt: string;
  target:
    | "run"
    | "phase"
    | "agent"
    | "model"
    | "tool"
    | "mcp"
    | "skill"
    | "artifact"
    | "verification"
    | "version"
    | "reflection";
  type: string;
  status?: "started" | "completed" | "failed" | "blocked" | "skipped";
  phase?: string;
  agentRole?: string;
  traceId?: string;
  toolName?: string;
  modelRole?: string;
  modelTier?: string;
  artifactRefs?: string[];
  durationMs?: number;
  message: string;
  inputSummary?: string;
  outputSummary?: string;
  data?: Record<string, unknown>;
};

type PublishedSiteVersion = {
  versionId: string;
  runId: string;
  versionNumber: number;
  title: string;
  summary: string;
  parentVersionId?: string | null;
  changeSummary?: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  version: NonNullable<Run["buildVersion"]>;
};

type SiteState = {
  latest: Run["buildVersion"] | null;
  latestPublication: PublishedSiteVersion | null;
  publishedVersions: PublishedSiteVersion[];
};

type BuildJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  queuePosition: number;
  runId?: string;
  versionId?: string;
  error?: string;
};

type BuildLogEvent = {
  id: string;
  phase: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
  data?: Record<string, unknown>;
};

type BuildJobResponse = {
  job?: BuildJob;
  run?: Run | null;
  logs?: BuildLogEvent[];
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type StartBuildOptions = {
  briefOverride?: SiteBrief;
  messagesOverride?: ChatMessage[];
  selectedBaseOverride?: KnowledgeBaseSummary | null;
};

type StyleId = Exclude<SiteBrief["style"], "">;
type BuildStage = "idle" | "building" | "draft" | "published";
type Suggestion = {
  label: string;
  prompt: string;
};

const initialBrief: SiteBrief = {
  title: "我的个人网站",
  siteType: "",
  goal: "",
  audience: "",
  memory: "",
  style: "",
  sections: ["关于我", "项目", "写作"]
};

const styleLabels: Record<StyleId, string> = {
  editorial: "杂志感",
  minimalist: "极简",
  portfolio: "作品集",
  creative: "创意"
};

const styleTone: Record<string, string> = {
  editorial: "from-stone-950 via-zinc-900 to-stone-800",
  minimalist: "from-slate-50 via-white to-zinc-100",
  portfolio: "from-indigo-950 via-slate-900 to-slate-800",
  creative: "from-fuchsia-950 via-violet-900 to-indigo-900"
};

const phaseLabels: Record<string, string> = {
  queued: "排队",
  knowledge: "知识库",
  planning: "规划",
  agent: "生成",
  compile: "页面",
  verify: "检查",
  version: "版本",
  publish: "保存",
  failed: "失败"
};

const roleLabels: Record<string, string> = {
  context_analyst: "上下文整理",
  site_planner: "网站规划",
  site_builder: "页面生成",
  verifier: "质量检查",
  reflector: "复盘",
  "conversation-agent": "需求确认",
  "builder-agent": "网站生成",
  "review-agent": "质量检查",
  "site-planner": "网站规划",
  "site-compiler": "页面生成",
  "wiki-curator": "知识整理"
};

const observationTypeLabels: Record<string, string> = {
  "run.started": "开始生成",
  "run.completed": "生成完成",
  "run.failed": "生成失败",
  "phase.started": "进入步骤",
  "phase.completed": "步骤完成",
  "phase.failed": "步骤失败",
  "agent.dispatched": "分配任务",
  "agent.started": "开始处理",
  "agent.completed": "处理完成",
  "agent.failed": "处理失败",
  "model.routing.selected": "选择模型",
  "tool.completed": "工具完成",
  "tool.failed": "工具失败",
  "mcp.synced": "同步工具资产",
  "skill.selected": "选择设计资产",
  "artifact.created": "生成产物",
  "verification.completed": "检查完成",
  "verification.failed": "检查未通过",
  "version.created": "创建版本",
  "reflection.created": "记录复盘"
};

const observationTargetLabels: Record<HarnessObservationEvent["target"], string> = {
  run: "整体",
  phase: "步骤",
  agent: "处理",
  model: "模型",
  tool: "工具",
  mcp: "外部工具",
  skill: "设计资产",
  artifact: "产物",
  verification: "检查",
  version: "版本",
  reflection: "复盘"
};

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

const observationDotClass = (event: HarnessObservationEvent) => {
  if (event.status === "failed" || event.status === "blocked" || event.type.endsWith(".failed")) return "bg-red-500";
  if (event.status === "started" || event.type.endsWith(".started")) return "bg-accent";
  if (event.target === "skill") return "bg-violet-500";
  if (event.target === "tool") return "bg-blue-500";
  if (event.target === "verification") return "bg-emerald-500";
  return "bg-gray-400";
};

const observationSummary = (event: HarnessObservationEvent) => {
  const parts: string[] = [];
  if (event.agentRole) parts.push(roleLabels[event.agentRole] ?? event.agentRole);
  if (event.toolName) parts.push(event.toolName);
  if (event.modelTier) parts.push(`${event.modelTier} 模型`);
  if (event.artifactRefs?.length) parts.push(`${event.artifactRefs.length} 个引用`);
  if (typeof event.durationMs === "number") parts.push(`${Math.round(event.durationMs)}ms`);
  return parts.join(" · ");
};

const logDetail = (event: BuildLogEvent) => {
  const parts: string[] = [];
  const role = typeof event.data?.role === "string" ? event.data.role : "";
  const tools = stringList(event.data?.toolCalls);
  const artifacts = stringList(event.data?.artifactRefs);
  const files = stringList(event.data?.files);
  const sections = stringList(event.data?.sections);
  if (role) parts.push(roleLabels[role] ?? role);
  if (tools.length) parts.push(`工具：${tools.join("、")}`);
  if (artifacts.length) parts.push(`产物：${artifacts.join("、")}`);
  if (sections.length) parts.push(`栏目：${sections.join("、")}`);
  if (files.length) parts.push(`文件：${files.join("、")}`);
  return parts.join(" · ");
};

const makeId = () => Math.random().toString(36).slice(2);

const latestAssistantMessage = (messages: ChatMessage[]) =>
  [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";

const createContextualSuggestions = (
  brief: SiteBrief,
  messages: ChatMessage[],
  selectedBase: KnowledgeBaseSummary | null,
  run: Run | null,
  busy: boolean
): Suggestion[] => {
  if (busy) return [];
  if (!selectedBase) return [];
  const assistantText = latestAssistantMessage(messages);
  if (!assistantText || run) {
    return run && /改|修改|继续|调整/.test(assistantText)
      ? [
          { label: "更有个人感", prompt: "把这个网站改得更有个人表达和可信度，减少模板感。" },
          { label: "突出项目", prompt: "请把项目和成果放到更重要的位置，并强化每个项目的证明材料。" },
          { label: "更简洁", prompt: "整体改得更简洁，减少装饰，让信息更容易扫描。" }
        ]
      : [];
  }
  if (!brief.siteType) {
    return [
      { label: "个人主页", prompt: "我想做一个个人主页，用来介绍我是谁、我在做什么、适合谁来联系我。" },
      { label: "作品集", prompt: "我想做一个作品集网站，重点展示项目经历、能力和可验证成果。" },
      { label: "写作主页", prompt: "我想做一个写作主页，面向读者展示长期思考和文章入口。" },
      { label: "产品官网", prompt: "我想做一个产品官网，面向潜在用户介绍产品价值和使用场景。" }
    ];
  }
  if (!brief.audience || /受众|面向谁|给谁看/.test(assistantText)) {
    return [
      { label: "潜在合作方", prompt: "主要面向潜在合作方，希望他们快速理解我的方向、能力和可信度。" },
      { label: "招聘方", prompt: "主要面向招聘方，希望突出项目、能力和真实成果。" },
      { label: "读者", prompt: "主要面向读者，希望他们能理解我的长期兴趣和思考脉络。" },
      { label: "潜在用户", prompt: "主要面向潜在用户，希望他们清楚知道这个网站提供什么价值。" }
    ];
  }
  if (!brief.style || /风格|视觉|感觉|调性/.test(assistantText)) {
    return [
      { label: "极简可信", prompt: "视觉风格希望极简、克制、可信，不要太花。" },
      { label: "杂志感", prompt: "视觉风格希望像安静的杂志，有阅读感和内容质感。" },
      { label: "作品集感", prompt: "视觉风格希望更像高质量作品集，重点突出项目和证明。" },
      { label: "清晰科技感", prompt: "视觉风格希望清晰、有科技感，但不要像模板官网。" }
    ];
  }
  if (!brief.goal || /目标|目的|希望.*达成/.test(assistantText)) {
    return [
      { label: "建立信任", prompt: "这个网站的核心目标是建立信任，让访问者愿意继续了解我。" },
      { label: "获得联系", prompt: "这个网站的核心目标是让合适的人主动联系我。" },
      { label: "展示作品", prompt: "这个网站的核心目标是展示作品和成果。" }
    ];
  }
  return [];
};

function compilePrompt(brief: SiteBrief, messages: ChatMessage[], knowledgeBase: KnowledgeBaseSummary | null) {
  const transcript = messages.map((message) => `${message.role === "user" ? "用户" : "AI"}：${message.content}`).join("\n");
  return [
    "根据已选知识库和用户对话生成个人网站草稿。用户界面保持简单自然，不暴露任何系统内部实现概念。",
    "只能使用已选知识库作为内容上下文，不要混用其他知识库。",
    "",
    `已选知识库：${knowledgeBase?.name || "未选择"}`,
    `知识库说明：${knowledgeBase?.description || ""}`,
    `知识库规模：${knowledgeBase ? `${knowledgeBase.fileCount} 份资料 · ${knowledgeBase.totalChars} 字符` : "未读取"}`,
    "知识库内容请通过构建工具读取，不要把索引或原始资料直接当作网站正文。",
    "",
    `网站类型：${brief.siteType || "根据对话补全"}`,
    `网站名称：${brief.title}`,
    `目标：${brief.goal || "根据对话补全"}`,
    `受众：${brief.audience || "根据对话补全"}`,
    `核心印象：${brief.memory || "根据对话补全"}`,
    `视觉风格：${brief.style ? styleLabels[brief.style] : "根据对话补全"}`,
    `栏目：${brief.sections.join("、")}`,
    "",
    "对话记录：",
    transcript
  ].join("\n");
}

function ObservationTimeline({ events, toolCount, runId }: { events: HarnessObservationEvent[]; toolCount: number; runId?: string | undefined }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;

  const visibleEvents = open ? events : events.slice(-6);
  const failedCount = events.filter((event) => event.status === "failed" || event.status === "blocked").length;
  const skillCount = events.filter((event) => event.target === "skill").length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-900">生成记录</p>
          <p className="mt-1 text-[10px] leading-4 text-gray-400">
            {events.length} 个步骤 · {toolCount} 次工具调用 · {skillCount} 个设计资产
            {failedCount ? ` · ${failedCount} 个阻塞项` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {runId ? (
            <a
              href={`/api/runs/${encodeURIComponent(runId)}/trace`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-medium text-gray-500 transition-all hover:border-accent/30 hover:text-accent"
            >
              Trace JSON
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-medium text-gray-500 transition-all hover:border-accent/30 hover:text-accent"
          >
            {open ? "收起" : "查看详情"}
          </button>
        </div>
      </div>

      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {visibleEvents.map((event) => {
          const meta = observationSummary(event);
          return (
            <div key={event.id} className="flex gap-3 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-5">
              <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${observationDotClass(event)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-100">
                    {observationTargetLabels[event.target]}
                  </span>
                  <span className="text-[10px] font-medium text-gray-500">
                    {observationTypeLabels[event.type] ?? event.type}
                  </span>
                  <span className="text-[10px] text-gray-400">{new Date(event.createdAt).toLocaleTimeString()}</span>
                </div>
                <p className="mt-1 break-words text-gray-700">{event.message}</p>
                {meta ? <p className="mt-0.5 break-words text-[10px] leading-4 text-gray-400">{meta}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewSite({
  brief,
  run,
  stage,
  publishing,
  onContinue,
  onPublish,
  knowledgeBaseName
}: {
  brief: SiteBrief;
  run: Run | null;
  stage: BuildStage;
  publishing: boolean;
  onContinue: () => void;
  onPublish: () => void;
  knowledgeBaseName?: string;
}) {
  if (stage === "idle") {
    return null;
  }

  if (stage === "building") {
    return (
      <div className="flex h-full min-h-[640px] flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl shadow-black/5">
        <div className="relative mb-6 h-16 w-16">
          <div className="absolute inset-0 rounded-2xl bg-accent/10 animate-ping" />
          <div className="absolute inset-2 rounded-xl bg-accent/10" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
          </div>
        </div>
        <h2 className="text-base font-semibold text-gray-900">正在构建网站预览</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
          正在整理对话、知识库内容和页面结构。构建成功后，预览会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[640px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/10">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-gray-200 bg-gray-50 px-4">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-1 text-[10px] font-mono text-gray-400">
          preview.personal.wiki/{run?.id || "draft"}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stage === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {stage === "published" ? "已保存" : "草稿"}
        </span>
      </div>

      <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-gray-400">{stage === "published" ? "已保存版本" : "草稿版本"}</p>
            <h3 className="mt-1 truncate text-sm font-semibold text-gray-900">
              {stage === "published" ? "已保存到我的网站" : "这是一个未发布草稿"}
            </h3>
            <p className="mt-1 truncate text-xs text-gray-500">
              {stage === "published" ? "可从“我的网站”继续编辑这个版本。" : "继续修改，或发布并保存到“我的网站”。"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onContinue}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              继续修改
            </button>
            {stage === "published" ? (
              <Link
                href="/dashboard"
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700"
              >
                查看我的网站
              </Link>
            ) : (
              <button
                onClick={onPublish}
                disabled={publishing}
                className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-gray-900/10 transition-all hover:bg-gray-800 disabled:opacity-50"
              >
                {publishing ? "保存中..." : "发布并保存"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <GeneratedSitePreview brief={brief} run={run} knowledgeBaseName={knowledgeBaseName ?? ""} />
      </div>
    </div>
  );
}

function KnowledgeBasePicker({
  bases,
  selectedBase,
  loading,
  onSelect,
  onClear
}: {
  bases: KnowledgeBaseSummary[];
  selectedBase: KnowledgeBaseSummary | null;
  loading: boolean;
  onSelect: (baseId: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredBases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bases;
    return bases.filter((base) =>
      [base.name, base.description, base.wikiIndex]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [bases, query]);

  return (
    <div className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 text-left text-sm shadow-sm transition-all hover:border-accent/30"
      >
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-gray-900">
            {selectedBase ? selectedBase.name : loading ? "加载知识库..." : "选择知识库"}
          </span>
          <span className="block truncate text-[10px] text-gray-400">
            {selectedBase ? `${selectedBase.fileCount} 份资料` : `${bases.length} 个知识库可用`}
          </span>
        </span>
        <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-black/10">
          <div className="border-b border-gray-100 p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索知识库"
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-accent/40 focus:bg-white focus:ring-2 focus:ring-accent/10"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-14 animate-pulse rounded-xl bg-gray-100" />
                ))}
              </div>
            ) : filteredBases.length ? (
              filteredBases.map((base) => (
                <button
                  key={base.id}
                  type="button"
                  onClick={() => {
                    onSelect(base.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full rounded-xl px-3 py-3 text-left transition-all ${
                    selectedBase?.id === base.id ? "bg-accent/10 text-accent" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{base.name}</span>
                    <span className="shrink-0 text-[10px] text-gray-400">{base.fileCount} 份资料</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-gray-400">{base.description || base.wikiIndex}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-gray-400">没有匹配的知识库</div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
            <Link href="/knowledge" className="text-xs font-medium text-accent">
              管理知识库
            </Link>
            {selectedBase ? (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="text-xs text-gray-400 transition-colors hover:text-gray-700"
              >
                取消选择
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CreateWorkspace() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [brief, setBrief] = useState<SiteBrief>(initialBrief);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(true);
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null);
  const [baseRunId, setBaseRunId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [buildJob, setBuildJob] = useState<BuildJob | null>(null);
  const [buildLogs, setBuildLogs] = useState<BuildLogEvent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      content: "先选择一个知识库。我会只使用这个知识库里的 Wiki 内容来创建网站，不会混用其他知识库。"
    }
  ]);

  const selectedBase = useMemo(
    () => knowledgeBases.find((base) => base.id === selectedBaseId) ?? null,
    [knowledgeBases, selectedBaseId]
  );

  const canGenerate = useMemo(() => {
    return Boolean(selectedBase && brief.siteType && brief.audience && brief.style);
  }, [brief.audience, brief.siteType, brief.style, selectedBase]);
  const buildInProgress = loading || buildJob?.status === "queued" || buildJob?.status === "running";
  const buildStage: BuildStage = buildInProgress ? "building" : run ? (published ? "published" : "draft") : "idle";
  const shouldShowPreview = buildStage !== "idle";
  const previewVisible = shouldShowPreview && previewOpen;
  const observationEvents = useMemo(() => run?.observabilityEvents ?? [], [run]);
  const toolCallCount = run?.toolCalls?.length || observationEvents.filter((event) => event.target === "tool").length;
  const contextualSuggestions = useMemo(
    () => createContextualSuggestions(brief, messages, selectedBase, run, buildInProgress || chatLoading),
    [brief, buildInProgress, chatLoading, messages, selectedBase, run]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/knowledge")
      .then((response) => response.json())
      .then((data: { bases?: KnowledgeBaseSummary[] }) => {
        if (cancelled) return;
        setKnowledgeBases(data.bases ?? []);
      })
      .finally(() => {
        if (!cancelled) setKnowledgeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectKnowledgeBase = (baseId: string) => {
    const base = knowledgeBases.find((item) => item.id === baseId);
    setSelectedBaseId(baseId);
    setConversationId(null);
    setBrief(initialBrief);
    setRun(null);
    setBuildJob(null);
    setBuildLogs([]);
    setPublished(false);
    setPreviewOpen(true);
    setBaseRunId(null);
    setBaseVersionId(null);
    setMessages([
      {
        id: makeId(),
        role: "assistant",
        content: `已选择「${base?.name || "这个知识库"}」。接下来先确认：你想创建哪一类网站？比如个人主页、作品集、博客、产品官网或服务介绍。`
      }
    ]);
  };

  const clearKnowledgeBase = () => {
    setSelectedBaseId(null);
    setConversationId(null);
    setBrief(initialBrief);
    setRun(null);
    setBuildJob(null);
    setBuildLogs([]);
    setPublished(false);
    setPreviewOpen(true);
    setBaseRunId(null);
    setBaseVersionId(null);
    setMessages([
      {
        id: makeId(),
        role: "assistant",
        content: "请选择一个知识库开始。我会只使用所选知识库里的 Wiki 内容来创建网站。"
      }
    ]);
  };

  useEffect(() => {
    const versionId = new URLSearchParams(window.location.search).get("version");
    if (!versionId) return;

    let cancelled = false;
    fetch("/api/site")
      .then((response) => response.json())
      .then((data: SiteState) => {
        if (cancelled) return;
        const publication = data.publishedVersions?.find((item) => item.versionId === versionId);
        if (!publication) return;

        const contentModel = publication.version.contentModel;
        if (publication.knowledgeBaseId) setSelectedBaseId(publication.knowledgeBaseId);
        setBaseVersionId(publication.versionId);
        setBaseRunId(publication.runId);
        setBrief({
          title: contentModel?.title ?? publication.title,
          siteType: "已保存网站",
          goal: contentModel?.thesis ?? publication.summary,
          audience: contentModel?.audience ?? "",
          memory: publication.changeSummary ?? "",
          style: "minimalist",
          sections: ["关于我", "项目", "写作"]
        });
        setRun({
          id: publication.runId,
          state: "versioned",
          intent: {
            title: contentModel?.title ?? publication.title,
            prompt: contentModel?.thesis ?? publication.summary
          },
          buildVersion: publication.version
        });
        setPublished(true);
        setPreviewOpen(true);
        setMessages([
          {
            id: makeId(),
            role: "assistant",
            content: `已载入第 ${publication.versionNumber} 版。你可以直接告诉我想改什么，我会基于这个版本生成新的草稿。`
          }
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            content: "没有载入到这个版本。你也可以直接描述想创建或修改的网站。"
          }
        ]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!buildJob || (buildJob.status !== "queued" && buildJob.status !== "running")) return;

    let cancelled = false;
    const poll = async () => {
      const response = await fetch(`/api/runs?jobId=${encodeURIComponent(buildJob.id)}`);
      const data = (await response.json()) as BuildJobResponse;
      if (cancelled) return;
      if (data.logs) setBuildLogs(data.logs);
      if (data.job) setBuildJob(data.job);

      if (data.job?.status === "completed" && data.run) {
        setRun(data.run);
        setBaseRunId(data.run.id);
        setBaseVersionId(data.run.buildVersion?.id ?? null);
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            content: "网站草稿已生成，右侧已经出现预览。你可以继续说想怎么改，也可以发布并保存到“我的网站”。"
          }
        ]);
      }

      if (data.job?.status === "failed") {
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: "assistant",
            content: `生成失败：${data.job?.error || "构建任务没有完成。"}`
          }
        ]);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [buildJob?.id, buildJob?.status]);

  const startBuild = async (options: StartBuildOptions = {}) => {
    const activeBrief = options.briefOverride ?? brief;
    const activeMessages = options.messagesOverride ?? messages;
    const activeBase = options.selectedBaseOverride ?? selectedBase;
    const readyToGenerate = Boolean(activeBase && activeBrief.siteType && activeBrief.audience && activeBrief.style);

    if (!readyToGenerate || buildInProgress || !activeBase) return;

    setLoading(true);
    setPublished(false);
    setPreviewOpen(true);
    const prompt = compilePrompt(activeBrief, activeMessages, activeBase);
    const latestUserMessage = activeMessages.filter((message) => message.role === "user").at(-1)?.content;
    const revisionBaseRunId = run?.id ?? baseRunId;
    const revisionBaseVersionId = run?.buildVersion?.id ?? baseVersionId;

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeBrief.title,
          prompt,
          audience: activeBrief.audience || "个人网站访问者",
          desiredArtifact: "site",
          knowledgeBaseId: activeBase.id,
          knowledgeBaseName: activeBase.name,
          baseRunId: revisionBaseRunId ?? undefined,
          baseVersionId: revisionBaseVersionId ?? undefined,
          revisionReason: run ? latestUserMessage ?? "继续修改网站" : undefined,
          constraints: [
            "User-facing UI must stay simple and non-technical.",
            "Keep internal build implementation hidden from the user interface.",
            `Use only the selected knowledge base: ${activeBase.name}.`,
            "Generate a polished personal website draft from the conversation and knowledge base."
          ]
        })
      });
      const data = (await response.json()) as BuildJobResponse;
      if (!response.ok) {
        throw new Error(data.error || "生成失败");
      }
      setBuildJob(data.job ?? null);
      setBuildLogs(data.logs ?? []);
      if (data.run) {
        setRun(data.run);
        setBaseRunId(data.run.id);
        setBaseVersionId(data.run.buildVersion?.id ?? null);
      }
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: data.run
            ? "网站草稿已生成，右侧已经出现预览。你可以继续说想怎么改，也可以发布并保存到“我的网站”。"
            : "我已经开始生成网站。完成后右侧会自动出现预览。"
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: error instanceof Error ? `生成失败：${error.message}` : "生成失败，请再试一次。"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || buildInProgress || chatLoading) return;
    if (!selectedBase) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: "请先选择一个知识库。每次创建都会绑定一个独立知识库，避免不同资料互相混在一起。"
        }
      ]);
      return;
    }

    const userMessage: ChatMessage = { id: makeId(), role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setChatLoading(true);

    try {
      const response = await fetch("/api/create-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          brief,
          messages: nextMessages,
          knowledgeBaseId: selectedBase.id
        })
      });
      const data = (await response.json()) as CreateAgentResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "AI 回复失败");
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        content: data.assistantMessage.content
      };
      const committedMessages = [...nextMessages, assistantMessage];
      setConversationId(data.conversationId);
      setBrief(data.brief);
      setMessages(committedMessages);

      if (data.canGenerate) {
        void startBuild({
          briefOverride: data.brief,
          messagesOverride: committedMessages,
          selectedBaseOverride: selectedBase
        });
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: error instanceof Error ? `刚才没有连上服务端，请再试一次。${error.message}` : "刚才没有连上服务端，请再试一次。"
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const submit = () => {
    void startBuild();
  };

  const continueEditing = () => {
    setMessages((current) => [
      ...current,
      {
        id: makeId(),
        role: "assistant",
        content: "可以，直接告诉我你想改哪里：比如整体风格、栏目顺序、首页重点、文案语气或展示内容。"
      }
    ]);
  };

  const publishSite = async () => {
    if (!run || publishing) return;

    setPublishing(true);
    try {
      const response = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id })
      });
      const data = (await response.json()) as {
        error?: string;
        publication?: PublishedSiteVersion;
        version?: NonNullable<Run["buildVersion"]>;
      };
      if (!response.ok) {
        throw new Error(data.error || "保存失败");
      }
      setBaseRunId(data.publication?.runId ?? run.id);
      setBaseVersionId(data.publication?.versionId ?? data.version?.id ?? run.buildVersion?.id ?? null);
      setPublished(true);
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: "已发布并保存到“我的网站”。你可以进入“我的网站”继续管理。"
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "assistant",
          content: error instanceof Error ? `保存失败：${error.message}` : "保存失败，请再试一次。"
        }
      ]);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="relative z-10 h-screen overflow-hidden pt-14">
      <div className={`flex h-[calc(100vh-56px)] min-h-0 flex-col overflow-hidden bg-white/55 ${previewVisible ? "lg:flex-row" : ""}`}>
        <section
          className={`flex min-h-0 flex-1 flex-col bg-white ${
            previewVisible ? "lg:border-r lg:border-gray-200" : ""
          }`}
        >
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-900">创建网站</h1>
              <p className="text-xs text-gray-400">
                {selectedBase ? "通过对话确认需求，完成后再生成预览" : "先选择一个知识库，再开始对话"}
              </p>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <KnowledgeBasePicker
                bases={knowledgeBases}
                selectedBase={selectedBase}
                loading={knowledgeLoading}
                onSelect={selectKnowledgeBase}
                onClear={clearKnowledgeBase}
              />
              {shouldShowPreview ? (
                <button
                  type="button"
                  onClick={() => setPreviewOpen((current) => !current)}
                  className="hidden h-10 shrink-0 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 shadow-sm transition-all hover:border-accent/30 hover:text-accent lg:inline-flex"
                  aria-pressed={previewOpen}
                >
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${previewOpen ? "" : "rotate-180"}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {previewOpen ? "收起预览" : "打开预览"}
                </button>
              ) : null}
              {published ? (
                <Link href="/dashboard" className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:inline-flex">
                  查看我的网站
                </Link>
              ) : null}
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className={`mx-auto space-y-6 ${previewVisible ? "max-w-3xl" : "max-w-4xl"}`}>
              {selectedBase ? (
                <div className="rounded-2xl border border-accent/15 bg-accent/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-accent">已绑定知识库</p>
                      <h2 className="mt-1 text-sm font-semibold text-gray-900">{selectedBase.name}</h2>
                      <p className="mt-1 text-xs leading-5 text-gray-500">{selectedBase.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[10px] font-medium text-gray-500">
                      {selectedBase.fileCount} 份资料
                    </span>
                  </div>
                </div>
              ) : null}

              {messages.map((message) => (
                <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      message.role === "assistant" ? "bg-accent/10 text-accent" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    )}
                  </div>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                      message.role === "user"
                        ? "rounded-tr-md bg-accent text-white shadow-lg shadow-accent/15"
                        : "rounded-tl-md bg-gray-50 text-gray-800"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: "0.15s" }} />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" style={{ animationDelay: "0.3s" }} />
                    </span>
                  </div>
                </div>
              )}

              {buildLogs.length > 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-gray-900">生成进度</p>
                      <p className="text-[10px] text-gray-400">
                        {buildJob?.status === "queued"
                          ? `排队中 · 第 ${buildJob.queuePosition} 位`
                          : buildJob?.status === "running"
                            ? "正在生成"
                            : buildJob?.status === "completed"
                              ? "已完成"
                              : buildJob?.status === "failed"
                                ? "失败"
                                : "已记录"}
                      </p>
                    </div>
                    <span className={`h-2 w-2 rounded-full ${buildInProgress ? "animate-pulse bg-accent" : "bg-gray-300"}`} />
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {buildLogs.slice(-8).map((event) => {
                      const detail = logDetail(event);
                      return (
                      <div key={event.id} className="flex gap-3 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-5">
                        <span
                          className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                            event.level === "error" ? "bg-red-500" : event.level === "warn" ? "bg-amber-500" : "bg-accent"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-100">
                              {phaseLabels[event.phase] ?? event.phase}
                            </span>
                            <span className="text-[10px] text-gray-400">{new Date(event.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <p className="mt-1 text-gray-700">{event.message}</p>
                          {detail ? <p className="mt-0.5 break-words text-[10px] leading-4 text-gray-400">{detail}</p> : null}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              ) : null}

              <ObservationTimeline events={observationEvents} toolCount={toolCallCount} runId={run?.id} />

              {contextualSuggestions.length ? (
                <div className="flex flex-wrap gap-2">
                  {contextualSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    onClick={() => sendMessage(suggestion.prompt)}
                    disabled={!selectedBase || chatLoading || buildInProgress}
                    className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 shadow-sm transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
                  >
                    {suggestion.label}
                  </button>
                ))}
                </div>
              ) : null}
            </div>
          </div>

          <footer className="shrink-0 border-t border-gray-100 bg-white px-5 py-4">
            <div className={`mx-auto flex items-end gap-3 ${previewVisible ? "max-w-3xl" : "max-w-4xl"}`}>
              <div className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm transition-all focus-within:border-accent/30 focus-within:bg-white focus-within:ring-2 focus-within:ring-accent/10">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  placeholder={selectedBase ? (run ? "描述你想修改的内容..." : "描述你想创建的网站类型、受众和风格...") : "先选择一个知识库..."}
                  className="max-h-36 min-h-10 w-full resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                />
              </div>
              <button
                onClick={() => sendMessage(input)}
                disabled={!selectedBase || !input.trim() || buildInProgress || chatLoading}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 disabled:opacity-25"
                aria-label="发送"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
              <button
                onClick={submit}
                disabled={!canGenerate || buildInProgress}
                className="hidden h-11 shrink-0 items-center justify-center rounded-2xl bg-gray-900 px-5 text-sm font-medium text-white shadow-lg shadow-gray-900/10 transition-all hover:bg-gray-800 disabled:opacity-30 sm:flex"
              >
                {buildInProgress ? "生成中" : run ? "生成修改版" : "生成网站"}
              </button>
            </div>
            <button
              onClick={submit}
              disabled={!canGenerate || buildInProgress}
              className={`mx-auto mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-gray-900 text-sm font-medium text-white shadow-lg shadow-gray-900/10 transition-all hover:bg-gray-800 disabled:opacity-30 sm:hidden ${
                previewVisible ? "max-w-3xl" : "max-w-4xl"
              }`}
            >
              {buildInProgress ? "生成中" : run ? "生成修改版" : "生成网站"}
            </button>
          </footer>
        </section>

        {previewVisible ? (
          <aside className="hidden h-full min-h-0 w-full bg-gray-100/80 p-3 lg:block lg:w-[46%]">
            <PreviewSite
              brief={brief}
              run={run}
              stage={buildStage}
              publishing={publishing}
              onContinue={continueEditing}
              onPublish={publishSite}
              knowledgeBaseName={selectedBase?.name ?? ""}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
