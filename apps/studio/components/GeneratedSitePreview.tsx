import type { SiteBrief } from "../lib/create-agent-types";

type ContentBlock = {
  kind: "markdown" | "entity-list" | "timeline";
  markdown?: string;
  entityIds?: string[];
  eventIds?: string[];
};

type ContentSection = {
  id: string;
  title: string;
  purpose?: string;
  sourcePageIds?: string[];
  sourceEntityIds?: string[];
  contentBlocks?: ContentBlock[];
};

type GeneratedRun = {
  id: string;
  buildVersion?: {
    id: string;
    contentModel?: {
      title: string;
      thesis: string;
      audience: string;
      sections?: ContentSection[];
    };
    siteArtifact?: {
      files?: Array<{
        path: string;
        mediaType: string;
        content: string;
      }>;
    };
    lintIssues?: Array<{
      severity: string;
      code: string;
      message: string;
    }>;
  };
};

type GeneratedSitePreviewProps = {
  brief: SiteBrief;
  run: GeneratedRun | null;
  knowledgeBaseName?: string;
};

type VisualPreset = {
  page: string;
  header: string;
  eyebrow: string;
  title: string;
  body: string;
  nav: string;
  button: string;
  secondaryButton: string;
  panel: string;
  card: string;
  media: string;
  stat: string;
};

const visualPresets: Record<string, VisualPreset> = {
  editorial: {
    page: "bg-[#f8f2e8] text-[#161411]",
    header: "border-[#d9cdbb]",
    eyebrow: "text-[#9b5f2e]",
    title: "font-serif text-[#17120e]",
    body: "text-[#5e554a]",
    nav: "text-[#6b5e4f]",
    button: "bg-[#17120e] text-white",
    secondaryButton: "border-[#cdbda9] text-[#4b4035]",
    panel: "bg-[#fffaf2] border-[#e1d4c2]",
    card: "bg-[#fffaf2] border-[#e1d4c2]",
    media: "bg-[linear-gradient(135deg,#1f1a16,#7a4b2a_48%,#e8c890)]",
    stat: "bg-[#eadfce] text-[#473a30]"
  },
  minimalist: {
    page: "bg-white text-[#111827]",
    header: "border-gray-200",
    eyebrow: "text-gray-500",
    title: "text-gray-950",
    body: "text-gray-500",
    nav: "text-gray-500",
    button: "bg-gray-950 text-white",
    secondaryButton: "border-gray-200 text-gray-700",
    panel: "bg-gray-50 border-gray-200",
    card: "bg-white border-gray-200",
    media: "bg-[linear-gradient(135deg,#f8fafc,#e5e7eb_52%,#111827)]",
    stat: "bg-gray-100 text-gray-700"
  },
  portfolio: {
    page: "bg-[#09111f] text-white",
    header: "border-white/10",
    eyebrow: "text-cyan-300",
    title: "text-white",
    body: "text-slate-300",
    nav: "text-slate-300",
    button: "bg-cyan-300 text-slate-950",
    secondaryButton: "border-white/15 text-white",
    panel: "bg-white/8 border-white/10",
    card: "bg-white/7 border-white/10",
    media: "bg-[radial-gradient(circle_at_28%_22%,#22d3ee,transparent_24%),linear-gradient(135deg,#312e81,#0f172a_58%,#14b8a6)]",
    stat: "bg-white/10 text-cyan-100"
  },
  creative: {
    page: "bg-[#120817] text-white",
    header: "border-white/10",
    eyebrow: "text-amber-300",
    title: "text-white",
    body: "text-fuchsia-100/75",
    nav: "text-fuchsia-100/70",
    button: "bg-amber-300 text-[#120817]",
    secondaryButton: "border-fuchsia-200/20 text-white",
    panel: "bg-white/8 border-fuchsia-200/15",
    card: "bg-white/8 border-fuchsia-200/15",
    media: "bg-[radial-gradient(circle_at_70%_20%,#facc15,transparent_20%),radial-gradient(circle_at_30%_70%,#22d3ee,transparent_24%),linear-gradient(135deg,#701a75,#312e81_55%,#0f172a)]",
    stat: "bg-white/10 text-amber-100"
  }
};

export function GeneratedSitePreview({ brief, run, knowledgeBaseName }: GeneratedSitePreviewProps) {
  const html = run?.buildVersion?.siteArtifact?.files?.find((file) => file.mediaType === "text/html")?.content;
  if (html) {
    return (
      <iframe
        title="生成网站预览"
        sandbox=""
        srcDoc={html}
        className="h-[720px] w-full border-0 bg-white"
      />
    );
  }

  const contentModel = run?.buildVersion?.contentModel;
  const title = contentModel?.title || brief.title || "我的个人网站";
  const thesis = contentModel?.thesis || brief.goal || brief.memory || "把个人经历、项目和观点整理成一个清晰的网站。";
  const audience = contentModel?.audience || brief.audience || "公开访问者";
  const sections = normalizeSections(contentModel?.sections, brief);
  const fallbackPreset = visualPresets.minimalist as VisualPreset;
  const preset = visualPresets[brief.style || "minimalist"] ?? fallbackPreset;
  const stats = [
    { label: "资料来源", value: knowledgeBaseName || "个人 Wiki" },
    { label: "页面结构", value: `${sections.length} 个模块` },
    { label: "受众", value: audience }
  ];

  return (
    <article className={`min-h-[720px] ${preset.page}`}>
      <header className={`flex items-center justify-between border-b px-7 py-5 ${preset.header}`}>
        <strong className="max-w-[48%] truncate text-sm">{title}</strong>
        <nav className={`hidden gap-4 text-xs md:flex ${preset.nav}`}>
          {sections.slice(0, 4).map((section) => (
            <span key={section.id}>{section.title}</span>
          ))}
        </nav>
      </header>

      <section className="grid gap-8 px-7 py-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div>
          <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.22em] ${preset.eyebrow}`}>
            {brief.siteType || "Personal Site"} · {audience}
          </p>
          <h1 className={`max-w-2xl text-5xl font-bold leading-[0.96] tracking-normal md:text-6xl ${preset.title}`}>
            {title}
          </h1>
          <p className={`mt-6 max-w-xl text-base leading-8 ${preset.body}`}>{thesis}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className={`rounded-full px-5 py-2 text-sm font-semibold ${preset.button}`}>开始了解</span>
            <span className={`rounded-full border px-5 py-2 text-sm font-semibold ${preset.secondaryButton}`}>查看内容</span>
          </div>
        </div>
        <div className={`min-h-72 overflow-hidden rounded-[2rem] border p-4 ${preset.panel}`}>
          <div className={`h-56 rounded-[1.4rem] ${preset.media}`} />
          <div className="grid grid-cols-3 gap-2 pt-4">
            {stats.map((stat) => (
              <div key={stat.label} className={`rounded-xl px-3 py-3 ${preset.stat}`}>
                <p className="text-[10px] opacity-70">{stat.label}</p>
                <p className="mt-1 truncate text-xs font-semibold">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 px-7 pb-10 md:grid-cols-3">
        {sections.slice(0, 3).map((section, index) => (
          <div key={section.id} className={`rounded-2xl border p-5 ${preset.card}`}>
            <p className={`mb-5 text-xs font-semibold ${preset.eyebrow}`}>{String(index + 1).padStart(2, "0")}</p>
            <h2 className="text-xl font-semibold leading-tight">{section.title}</h2>
            <p className={`mt-4 text-sm leading-7 ${preset.body}`}>{section.summary}</p>
          </div>
        ))}
      </section>

      <section className={`mx-7 mb-10 rounded-[1.75rem] border p-7 ${preset.panel}`}>
        <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.2em] ${preset.eyebrow}`}>What this site says</p>
        <div className="grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
          <h2 className="text-3xl font-bold leading-tight">{brief.memory || "让访问者快速理解你是谁、在做什么、为什么可信。"}</h2>
          <p className={`text-sm leading-8 ${preset.body}`}>
            这个草稿会从已选知识库提取内容线索，组织成首页叙事、主题模块和行动入口。后续修改会基于当前版本继续生成，而不是覆盖历史。
          </p>
        </div>
      </section>
    </article>
  );
}

const normalizeSections = (sections: ContentSection[] | undefined, brief: SiteBrief) => {
  const source = sections?.length
    ? sections
    : brief.sections.map((title, index) => ({
        id: `brief-section-${index + 1}`,
        title,
        contentBlocks: []
      }));

  return source.slice(0, 6).map((section, index) => ({
    id: section.id || `section-${index + 1}`,
    title: section.title || `模块 ${index + 1}`,
    summary: readSectionSummary(section, brief, index)
  }));
};

const readSectionSummary = (section: ContentSection, brief: SiteBrief, index: number) => {
  const markdown = section.contentBlocks?.find((block) => block.kind === "markdown" && block.markdown)?.markdown;
  if (markdown) return trim(markdown, 128);
  if (index === 0) return trim(brief.goal || brief.memory || "介绍核心背景、能力和访问者最需要理解的信息。", 128);
  if (index === 1) return "展示项目、作品或关键经历，让访问者快速建立信任。";
  if (index === 2) return "沉淀写作、观点、方法论或长期更新的内容入口。";
  return "补充更细的内容结构，让网站可以继续扩展。";
};

const trim = (value: string, max: number) => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
};
