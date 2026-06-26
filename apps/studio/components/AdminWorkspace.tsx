"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AdminState = {
  stats: Record<string, number>;
  users: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>;
  skills: Array<{ id: string; title: string; status: string; risk: string; evidence: unknown[] }>;
  modelRouting: Array<{ role: string; tier: string; reason: string }>;
  modelRuntime: {
    createAgentModel: string;
    wikiCuratorEnabled: boolean;
    wikiCuratorModel: string;
    siteAgentsEnabled: boolean;
    builderAgentModel: string;
    siteBuilderModel: string;
    providers: Array<{ id: string; label: string; configured: boolean; baseUrlConfigured: boolean }>;
    routes: Array<{
      useCase: string;
      label: string;
      tier: string;
      providerId: string;
      model: string;
      enabled: boolean;
      capabilities: string[];
      reason: string;
      providerConfigured: boolean;
      baseUrlConfigured: boolean;
    }>;
  };
};

const statCards = [
  {
    key: "users",
    label: "用户",
    href: "#users",
    icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    color: "from-blue-500/20 to-cyan-500/20"
  },
  {
    key: "buildVersions",
    label: "网站版本",
    href: "/dashboard",
    icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zm12 0a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
    color: "from-violet-500/20 to-purple-500/20"
  },
  {
    key: "systemSkills",
    label: "平台能力",
    href: "#skills",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
    color: "from-yellow-500/20 to-amber-500/20"
  },
  {
    key: "runs",
    label: "生成记录",
    href: "#",
    icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064",
    color: "from-green-500/20 to-emerald-500/20"
  },
  {
    key: "entities",
    label: "知识主题",
    href: "/knowledge",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253",
    color: "from-pink-500/20 to-rose-500/20"
  }
];

const roleLabels: Record<string, string> = {
  commander: "总控",
  planner: "规划",
  reflection: "反思",
  "system-skill-promotion": "平台能力沉淀",
  coder: "代码/构建",
  "wiki-maintainer": "知识库维护",
  "site-assistant": "站内助手",
  summarizer: "总结",
  search: "检索"
};

const tierLabels: Record<string, string> = {
  strong: "强模型",
  balanced: "均衡模型",
  small: "低成本模型",
  embedding: "检索模型"
};

export function AdminWorkspace() {
  const [data, setData] = useState<AdminState | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((response) => response.json())
      .then(setData);
  }, []);

  return (
    <div className="relative z-10 min-h-screen pt-14">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">管理后台</h1>
        <p className="mb-8 text-sm text-text-muted">管理用户、平台能力、模型策略和运行统计。</p>

        <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {statCards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className={`group rounded-2xl border border-gray-200 bg-gradient-to-br p-4 transition-all hover:border-gray-200 ${card.color}`}
            >
              <svg className="mb-3 h-5 w-5 text-gray-500 transition-colors group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
              </svg>
              <div className="text-2xl font-bold text-gray-900">{data?.stats[card.key] ?? "—"}</div>
              <div className="mt-1 text-[10px] text-gray-400">{card.label}</div>
            </Link>
          ))}
        </div>

        <h2 className="mb-4 text-sm font-semibold text-gray-500">快捷操作</h2>
        <div className="mb-10 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: "查看用户", desc: "查看注册用户和角色", href: "#users" },
            { label: "模型策略", desc: "查看不同任务的模型分级", href: "#models" },
            { label: "平台能力", desc: "查看测试中沉淀的能力", href: "#skills" }
          ].map((item) => (
            <a key={item.href} href={item.href} className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-accent/20">
              <h3 className="text-sm font-medium transition-colors group-hover:text-accent">{item.label}</h3>
              <p className="mt-1 text-[10px] text-gray-400">{item.desc}</p>
            </a>
          ))}
        </div>

        <section id="users" className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">用户</h2>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="py-2 pr-4 font-medium">名称</th>
                  <th className="py-2 pr-4 font-medium">邮箱</th>
                  <th className="py-2 pr-4 font-medium">角色</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-50">
                    <td className="py-3 pr-4 text-gray-800">{user.name}</td>
                    <td className="py-3 pr-4 text-gray-500">{user.email}</td>
                    <td className="py-3 pr-4">
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">{user.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section id="models" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">模型策略</h2>
            {data?.modelRuntime ? (
              <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong className="text-sm text-gray-900">当前运行配置</strong>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${data.modelRuntime.siteAgentsEnabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    站点模型 {data.modelRuntime.siteAgentsEnabled ? "已启用" : "未启用"}
                  </span>
                </div>
                <div className="grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                  <div>对话：{data.modelRuntime.createAgentModel}</div>
                  <div>知识整理：{data.modelRuntime.wikiCuratorEnabled ? data.modelRuntime.wikiCuratorModel : "确定性流程"}</div>
                  <div>建站助手：{data.modelRuntime.siteAgentsEnabled ? data.modelRuntime.builderAgentModel : "确定性流程"}</div>
                  <div>质量检查：确定性校验</div>
                </div>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                  {data.modelRuntime.providers.map((provider) => (
                    <div key={provider.id} className="rounded-lg bg-gray-50 px-3 py-2 text-gray-500">
                      {provider.label}：{provider.configured ? "已配置" : provider.baseUrlConfigured ? "缺少密钥" : "未配置"}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-3">
              {data?.modelRouting.map((route) => (
                <div key={route.role} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm text-gray-900">{roleLabels[route.role] ?? route.role}</strong>
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {tierLabels[route.tier] ?? route.tier}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{route.reason}</p>
                </div>
              ))}
            </div>
            {data?.modelRuntime?.routes?.length ? (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <h3 className="mb-3 text-xs font-semibold text-gray-400">用例路由</h3>
                <div className="space-y-2">
                  {data.modelRuntime.routes.map((route) => (
                    <div key={route.useCase} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <span className="font-medium text-gray-700">{route.label}</span>
                      <span className="text-gray-500">{route.providerId} · {route.model || "未配置"}</span>
                      <span className={`rounded-md px-2 py-0.5 ${route.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {route.enabled ? "可用" : "关闭"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section id="skills" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">平台能力</h2>
            <div className="space-y-3">
              {data?.skills.map((skill) => (
                <div key={skill.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-gray-900">{skill.title}</strong>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-500">{skill.status}</span>
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs text-gray-500">{skill.risk}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">沉淀样本：{skill.evidence.length}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
