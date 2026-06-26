"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SiteState = {
  latest: null | {
    id: string;
    summary: string;
    createdAt?: string;
    contentModel?: { title: string; thesis: string; audience: string };
  };
  latestPublication: null | PublishedSiteVersion;
  versions: Array<{ id: string; summary: string; createdAt: string }>;
  publishedVersions: PublishedSiteVersion[];
  runs: Array<{ id: string; state: string; intent: { title: string } }>;
};

type PublishedSiteVersion = {
  id: string;
  versionId: string;
  runId: string;
  versionNumber: number;
  title: string;
  summary: string;
  status: "published";
  createdAt: string;
  publishedAt: string;
  parentVersionId?: string | null;
  changeSummary?: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  deployment?: {
    status: "ready" | "pending" | "failed";
    url: string;
    artifactPath: string;
  };
  version: {
    id: string;
    summary: string;
    createdAt: string;
    contentModel?: { title: string; thesis: string; audience: string };
  };
};

const themeLabels: Record<string, string> = {
  editorial: "Editorial",
  minimalist: "Minimalist",
  portfolio: "Portfolio",
  custom: "Custom"
};

export function SiteWorkspace() {
  const [data, setData] = useState<SiteState | null>(null);

  useEffect(() => {
    fetch("/api/site")
      .then((response) => response.json())
      .then(setData);
  }, []);

  const latest = data?.latest;
  const latestPublication = data?.latestPublication;
  const sites = latest
    ? [
        {
          id: latest.id,
          versionId: latestPublication?.versionId ?? latest.id,
          name: latest.contentModel?.title ?? "我的个人网站",
          status: "published",
          buildStatus: "ready",
          theme: "editorial",
          siteType: latest.contentModel?.audience ?? "个人展示",
          knowledgeBaseName: latestPublication?.knowledgeBaseName ?? "已选知识库",
          summary: latest.summary,
          updatedAt: latestPublication?.publishedAt ?? latest.createdAt ?? new Date().toISOString(),
          versionNumber: latestPublication?.versionNumber ?? data?.versions.length ?? 1,
          url: latestPublication?.deployment?.url
        }
      ]
    : [];
  const versionsById = new Map((data?.publishedVersions ?? []).map((version) => [version.versionId, version]));

  return (
    <div className="relative z-10 min-h-screen pt-14">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">我的网站</h1>
            <p className="mt-1 text-sm text-text-muted">{sites.length} 个网站</p>
          </div>
          <Link
            href="/create"
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建网站
          </Link>
        </div>

        {!data ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-48 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-600">还没有网站</h3>
            <p className="mt-1 text-sm text-gray-500">从知识库出发，生成你的第一个个人网站。</p>
            <Link
              href="/create"
              className="mt-6 inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent/90"
            >
              开始创建
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <div
                key={site.id}
                className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:border-accent/30 hover:shadow-md"
              >
                <div className="relative h-36 overflow-hidden border-b border-gray-100 bg-gray-50">
                  <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                  <div className="flex h-full flex-col justify-end bg-[radial-gradient(circle_at_top_right,#eef2ff,transparent_45%),linear-gradient(135deg,#ffffff,#f8fafc)] p-5">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-accent">Version {site.versionNumber}</p>
                    <h2 className="line-clamp-2 text-xl font-bold leading-tight text-gray-900">{site.name}</h2>
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900 transition-colors group-hover:text-accent">
                      {site.name}
                    </h3>
                    <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      已保存
                    </span>
                  </div>

                  <div className="mb-4 flex items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-accent" />
                      {themeLabels[site.theme] || site.theme}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="truncate">{site.siteType}</span>
                  </div>

                  <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                    知识库：{site.knowledgeBaseName}
                  </p>

                  <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-gray-500">{site.summary}</p>

                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    <Link
                      href={`/create?version=${site.versionId}`}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-accent/90"
                    >
                      继续编辑
                    </Link>
                    <a
                      href={site.url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-all hover:bg-gray-50"
                    >
                      预览
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: "版本", value: data?.versions.length ?? 0 },
            { label: "生成记录", value: data?.runs.length ?? 0 },
            { label: "当前状态", value: latest ? "已保存" : "空" }
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="mt-1 text-xs text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        {data?.publishedVersions?.length ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">版本记录</h2>
              <span className="text-xs text-gray-400">发布后才会进入这里</span>
            </div>
            <div className="divide-y divide-gray-100">
              {[...data.publishedVersions].reverse().map((version) => {
                const parentVersion = version.parentVersionId ? versionsById.get(version.parentVersionId) : null;
                return (
                  <div key={version.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">v{version.versionNumber}</span>
                        <h3 className="text-sm font-semibold text-gray-900">{version.title}</h3>
                        {version.knowledgeBaseName ? <span className="text-xs text-gray-400">知识库：{version.knowledgeBaseName}</span> : null}
                        {parentVersion ? <span className="text-xs text-gray-400">从 v{parentVersion.versionNumber} 修改</span> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {version.changeSummary || version.summary}
                      </p>
                      {parentVersion ? (
                        <p className="mt-1 text-[11px] leading-5 text-gray-400">
                          对比基线：v{parentVersion.versionNumber} · {parentVersion.title}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-gray-400">{new Date(version.publishedAt).toLocaleString()}</span>
                      <Link
                        href={`/create?version=${version.versionId}`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-all hover:bg-gray-50"
                      >
                        编辑此版
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
