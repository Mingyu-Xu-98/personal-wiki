"use client";

import { useEffect, useMemo, useState } from "react";

type KnowledgeState = {
  bases: Array<{ id: string; name: string; description: string; wikiIndex: string; fileCount: number; totalChars: number; updatedAt: string }>;
  activeBase: { id: string; name: string; description: string; wikiIndex: string; fileCount: number; totalChars: number; updatedAt: string };
  sources: Array<{
    id: string;
    title: string;
    uri: string;
    mediaType?: string;
    content: string;
    contentMode?: "inline" | "referenced" | "excerpt" | "metadata-only";
    byteSize?: number;
    createdAt: string;
    metadata?: Record<string, unknown>;
  }>;
  pages: Array<{ id: string; title: string; kind: string; path: string; body: string }>;
  entities: Array<{ id: string; name: string; kind: string; summary: string }>;
  relations: Array<{ id: string; fromEntityId: string; toEntityId: string; predicate: string; confidence: number }>;
  lintIssues?: Array<{ id: string; severity: "info" | "warning" | "error"; code: string; message: string }>;
  pendingMutationReviews: PendingMutationReview[];
};

type PendingMutationReview = {
  id: string;
  planId: string;
  sourceTitle: string;
  sourceContent: string;
  modelBacked: boolean;
  rejectedCandidateCount: number;
  createdAt: string;
  updatedAt: string;
  decision: string;
  candidateCount: number;
  reviewReasons: string[];
  openQuestions: string[];
  ontologyCandidates: Array<{
    id: string;
    kind: string;
    label: string;
    confidence: number;
    summary: string;
  }>;
};

const entityLabels: Record<string, string> = {
  entity_profile: "个人简介",
  entity_projects: "项目经历"
};

const kindLabels: Record<string, string> = {
  concept: "主题",
  person: "人物",
  project: "项目",
  organization: "组织",
  place: "地点",
  event: "事件",
  index: "目录"
};

const relationLabels: Record<string, string> = {
  supports: "支撑",
  references: "引用",
  relates_to: "关联"
};

const formatBytes = (value?: number) => {
  if (!value) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const contentModeLabels: Record<string, string> = {
  inline: "全文",
  excerpt: "摘录",
  referenced: "引用",
  "metadata-only": "索引"
};

export function KnowledgeWorkspace() {
  const [data, setData] = useState<KnowledgeState | null>(null);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateBase, setShowCreateBase] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [reviewActionId, setReviewActionId] = useState<string | null>(null);
  const [editingReview, setEditingReview] = useState<PendingMutationReview | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const load = async (baseId = selectedBaseId) => {
    const url = baseId ? `/api/knowledge?baseId=${encodeURIComponent(baseId)}` : "/api/knowledge";
    const response = await fetch(url);
    const next = (await response.json()) as KnowledgeState;
    setData(next);
    setSelectedBaseId(next.activeBase?.id ?? null);
  };

  useEffect(() => {
    void load(null);
  }, []);

  const selectBase = async (baseId: string) => {
    setSelectedBaseId(baseId);
    await load(baseId);
  };

  const addSource = async () => {
    if (!data?.activeBase || !title.trim() || !content.trim()) {
      return;
    }
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseId: data.activeBase.id, title, content })
    });
    setTitle("");
    setContent("");
    setShowCreate(false);
    await load();
  };

  const uploadFile = async (file: File) => {
    if (!data?.activeBase || uploading) return;
    setUploading(true);
    setUploadError("");
    const form = new FormData();
    form.append("baseId", data.activeBase.id);
    form.append("file", file);
    const response = await fetch("/api/knowledge", {
      method: "POST",
      body: form
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setUploadError(result.error || "上传失败，请换一个文件再试。");
      setUploading(false);
      return;
    }
    setSelectedFile(null);
    setShowCreate(false);
    setUploading(false);
    await load();
  };

  const dropUploadFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const submitMutationReview = async (review: PendingMutationReview, action: "approve" | "reject") => {
    if (!data?.activeBase) return;
    setReviewActionId(review.id);
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "mutation-review",
        action,
        baseId: data.activeBase.id,
        reviewId: review.id
      })
    });
    setReviewActionId(null);
    await load();
  };

  const openEditReview = (review: PendingMutationReview) => {
    setEditingReview(review);
    setEditTitle(review.sourceTitle);
    setEditContent(review.sourceContent);
  };

  const amendReview = async () => {
    if (!data?.activeBase || !editingReview || !editTitle.trim() || !editContent.trim()) return;
    setReviewActionId(editingReview.id);
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "mutation-review",
        action: "amend",
        baseId: data.activeBase.id,
        reviewId: editingReview.id,
        title: editTitle,
        content: editContent
      })
    });
    setReviewActionId(null);
    setEditingReview(null);
    await load();
  };

  const createBase = async () => {
    if (!baseName.trim()) return;
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "base", name: baseName, description: baseDescription })
    });
    const result = (await response.json()) as { base?: { id: string } };
    setBaseName("");
    setBaseDescription("");
    setShowCreateBase(false);
    if (result.base?.id) {
      await selectBase(result.base.id);
    } else {
      await load();
    }
  };

  const filteredPages = useMemo(() => {
    const pages = data?.pages ?? [];
    if (!search.trim()) return pages;
    const needle = search.toLowerCase();
    return pages.filter((page) => `${page.title} ${page.body}`.toLowerCase().includes(needle));
  }, [data?.pages, search]);

  return (
    <div className="relative z-10 min-h-screen bg-[#f8f9fc] pt-14">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">知识库</h1>
            <p className="mt-1 text-sm text-gray-500">
              {data?.activeBase?.name ?? "选择一个知识库"} · {(data?.sources.length ?? 0).toLocaleString()} 份资料 · {(data?.pages.length ?? 0).toLocaleString()} 个知识页面
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/create"
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              去创建网站
            </a>
            <button
              onClick={() => setShowCreateBase(true)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              新建知识库
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent/20 transition-all hover:bg-accent/90"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              添加资料
            </button>
            <input
              type="text"
              placeholder="搜索..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-48 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {data?.bases.map((base) => (
            <button
              key={base.id}
              onClick={() => void selectBase(base.id)}
              className={`rounded-2xl border p-5 text-left transition-all ${
                data.activeBase.id === base.id
                  ? "border-accent/30 bg-accent/5 shadow-sm shadow-accent/10"
                  : "border-gray-200 bg-white hover:border-accent/20"
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900">{base.name}</h2>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] text-gray-500 ring-1 ring-gray-200">
                  {base.fileCount} 份资料
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-gray-500">{base.description}</p>
              <p className="mt-3 text-[10px] text-gray-400">{base.totalChars.toLocaleString()} 字符 · Wiki index</p>
            </button>
          ))}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: "资料", value: data?.sources.length ?? "—", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13" },
            { label: "页面", value: data?.pages.length ?? "—", icon: "M4 6h16M4 12h16M4 18h7" },
            { label: "主题", value: data?.entities.length ?? "—", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707" }
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <svg className="mb-3 h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
              </svg>
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              <div className="mt-1 text-xs text-gray-400">{card.label}</div>
            </div>
          ))}
        </div>

        {data?.lintIssues?.length ? (
          <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">知识库检查</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                {data.lintIssues.length} 项
              </span>
            </div>
            <div className="space-y-2">
              {data.lintIssues.slice(0, 6).map((issue) => (
                <div key={issue.id} className="flex gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-5">
                  <span
                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                      issue.severity === "error" ? "bg-red-500" : issue.severity === "warning" ? "bg-amber-500" : "bg-gray-400"
                    }`}
                  />
                  <div>
                    <p className="text-gray-700">{issue.message}</p>
                    <p className="text-[10px] text-gray-400">{issue.code}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {data?.pendingMutationReviews?.length ? (
          <section className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-amber-950">待确认资料</h2>
                <p className="mt-1 text-sm text-amber-800">这些资料已经分析完成，确认后才会写入当前知识库。</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                {data.pendingMutationReviews.length} 个待处理
              </span>
            </div>
            <div className="space-y-3">
              {data.pendingMutationReviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-amber-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{review.sourceTitle}</h3>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          {review.modelBacked ? "AI 分析" : "规则分析"}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          {review.candidateCount} 个候选
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{review.sourceContent}</p>
                      {review.ontologyCandidates.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {review.ontologyCandidates.slice(0, 8).map((candidate) => (
                            <span key={candidate.id} className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600 ring-1 ring-gray-100">
                              {kindLabels[candidate.kind] ?? candidate.kind} · {candidate.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {[...review.reviewReasons, ...review.openQuestions].slice(0, 3).map((note) => (
                        <p key={note} className="mt-2 text-xs leading-5 text-amber-700">{note}</p>
                      ))}
                      {review.rejectedCandidateCount > 0 ? (
                        <p className="mt-2 text-xs text-gray-500">已自动过滤 {review.rejectedCandidateCount} 个缺少有效来源的候选。</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        onClick={() => void submitMutationReview(review, "approve")}
                        disabled={reviewActionId === review.id}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {reviewActionId === review.id ? "处理中..." : "确认入库"}
                      </button>
                      <button
                        onClick={() => openEditReview(review)}
                        disabled={reviewActionId === review.id}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 disabled:opacity-60"
                      >
                        编辑资料
                      </button>
                      <button
                        onClick={() => void submitMutationReview(review, "reject")}
                        disabled={reviewActionId === review.id}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60"
                      >
                        拒绝
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(data?.sources.length ?? 0) === 0 ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              void dropUploadFile(event.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed p-16 text-center transition-all ${
              dragOver ? "border-accent bg-accent/5" : "border-gray-200 bg-white"
            }`}
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-700">还没有资料</h3>
            <p className="mt-1 text-sm text-gray-500">添加简介、项目、文章，或拖入 Markdown、文本、CSV、JSON 文件。</p>
            {uploadError ? <p className="mt-3 text-sm text-red-500">{uploadError}</p> : null}
            <button
              onClick={() => setShowCreate(true)}
              disabled={uploading}
              className="mt-6 rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent/90"
            >
              {uploading ? "上传中..." : "添加第一份资料"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500">知识页面</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredPages.map((page) => (
                  <div
                    key={page.id}
                    className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-gray-800 group-hover:text-accent">{page.title}</h3>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                        {kindLabels[page.kind] ?? page.kind}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-xs leading-relaxed text-gray-500">{page.body}</p>
                    <div className="mt-3 text-[10px] text-gray-400">{page.path}</div>
                  </div>
                ))}
              </div>

              <h2 className="mb-3 mt-8 text-sm font-medium uppercase tracking-wider text-gray-500">资料</h2>
              <div className="space-y-3">
                {data?.sources.map((source) => (
                  <div key={source.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">{source.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{source.content}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                          <span>{source.mediaType ?? "text/plain"}</span>
                          {formatBytes(source.byteSize) ? <span>{formatBytes(source.byteSize)}</span> : null}
                          <span className="truncate">{source.uri}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                          已收录
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">
                          {contentModeLabels[source.contentMode ?? "inline"] ?? "资料"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Wiki Index</h2>
                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">index.wiki</span>
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[11px] leading-5 text-gray-600">
                  {data?.activeBase.wikiIndex}
                </pre>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">主题</h2>
                <div className="mt-4 space-y-3">
                  {data?.entities.map((entity) => (
                    <div key={entity.id} className="rounded-xl bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{entity.name}</span>
                        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] text-gray-500">
                          {kindLabels[entity.kind] ?? entity.kind}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{entity.summary}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-gray-900">关联</h2>
                <div className="mt-4 space-y-3">
                  {data?.relations.map((relation) => (
                    <div key={relation.id} className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                      <strong className="text-gray-800">{entityLabels[relation.fromEntityId] ?? relation.fromEntityId}</strong>{" "}
                      {relationLabels[relation.predicate] ?? relation.predicate}{" "}
                      <strong className="text-gray-800">{entityLabels[relation.toEntityId] ?? relation.toEntityId}</strong>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(relation.confidence * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        )}

        {showCreateBase && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">新建知识库</h2>
                  <p className="mt-1 text-sm text-gray-500">每个知识库都是独立 Wiki，创建网站时只能选择其中一个。</p>
                </div>
                <button onClick={() => setShowCreateBase(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">名称</label>
                  <input
                    value={baseName}
                    onChange={(event) => setBaseName(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                    placeholder="例如：个人品牌 Wiki"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">说明</label>
                  <textarea
                    value={baseDescription}
                    onChange={(event) => setBaseDescription(event.target.value)}
                    className="min-h-24 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                    placeholder="这个知识库适合用来创建什么类型的网站？"
                  />
                </div>
                <button
                  onClick={createBase}
                  className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90"
                >
                  创建知识库
                </button>
              </div>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">添加资料</h2>
                  <p className="mt-1 text-sm text-gray-500">保存到「{data?.activeBase.name}」的 Wiki，其他知识库不会读取这份资料。</p>
                </div>
                <button onClick={() => setShowCreate(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">标题</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                    placeholder="例如：个人简介"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">内容</label>
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    className="min-h-40 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                    placeholder="粘贴你的经历、项目、文章片段或任何可用于建站的资料。"
                  />
                </div>
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                  <label className="mb-2 block text-xs text-gray-500">上传文件</label>
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.json,.yaml,.yml,.pdf,.docx,.pptx,.rtf,text/*,application/json,application/pdf"
                    onChange={(event) => {
                      setSelectedFile(event.target.files?.[0] ?? null);
                      setUploadError("");
                    }}
                    className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-100"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-xs text-gray-500">
                      {selectedFile ? selectedFile.name : "支持 Markdown、文本、CSV、JSON、YAML、PDF、DOCX、PPTX"}
                    </p>
                    <button
                      onClick={() => selectedFile && void uploadFile(selectedFile)}
                      disabled={!selectedFile || uploading}
                      className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploading ? "上传中..." : "上传"}
                    </button>
                  </div>
                  {uploadError ? <p className="mt-2 text-xs text-red-500">{uploadError}</p> : null}
                </div>
                <button
                  onClick={addSource}
                  disabled={!title.trim() || !content.trim()}
                  className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90"
                >
                  保存资料
                </button>
              </div>
            </div>
          </div>
        )}

        {editingReview && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-6 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">编辑资料</h2>
                  <p className="mt-1 text-sm text-gray-500">保存后会重新分析候选内容，仍需确认后才会入库。</p>
                </div>
                <button onClick={() => setEditingReview(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">标题</label>
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">内容</label>
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    className="min-h-48 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                  />
                </div>
                <button
                  onClick={() => void amendReview()}
                  disabled={reviewActionId === editingReview.id}
                  className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 disabled:opacity-60"
                >
                  {reviewActionId === editingReview.id ? "重新分析中..." : "保存并重新分析"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
