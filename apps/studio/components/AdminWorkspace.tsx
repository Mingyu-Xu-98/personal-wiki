"use client";

import { useEffect, useState } from "react";

type AdminState = {
  stats: Record<string, number>;
  users: Array<{ id: string; name: string; email: string; role: string; createdAt: string }>;
  skills: Array<{ id: string; title: string; status: string; risk: string; evidence: unknown[] }>;
  modelRouting: Array<{ role: string; tier: string; reason: string }>;
};

const statLabels: Record<string, string> = {
  projects: "项目",
  sources: "资料",
  wikiPages: "知识页面",
  entities: "主题",
  runs: "生成记录",
  buildVersions: "网站版本",
  systemSkills: "平台能力",
  reflections: "复盘记录"
};

const roleLabels: Record<string, string> = {
  commander: "总控",
  planner: "规划",
  executor: "执行",
  verifier: "检查",
  summarizer: "总结",
  siteAssistant: "站内助手"
};

const tierLabels: Record<string, string> = {
  strong: "强模型",
  standard: "标准模型",
  economy: "低成本模型"
};

export function AdminWorkspace() {
  const [data, setData] = useState<AdminState | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((response) => response.json())
      .then(setData);
  }, []);

  const stats = data?.stats ?? {};

  return (
    <div className="grid">
      <section className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>后台管理</h1>
          <p className="subtle">管理用户、平台能力、模型策略、运行统计和构建状态。</p>
        </div>
      </section>
      <section className="grid grid-3">
        {Object.entries(stats).map(([key, value]) => (
          <div className="panel panel-pad stat" key={key}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{statLabels[key] ?? key}</div>
          </div>
        ))}
      </section>
      <section className="grid grid-2">
        <div className="panel">
          <div className="panel-header"><h2>用户</h2></div>
          <div className="panel-pad">
            <table className="table">
              <thead><tr><th>名称</th><th>邮箱</th><th>角色</th></tr></thead>
              <tbody>
                {data?.users.map((user) => (
                  <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h2>模型策略</h2></div>
          <div className="panel-pad list">
            {data?.modelRouting.map((route) => (
              <div className="list-item" key={route.role}>
                <strong>{roleLabels[route.role] ?? route.role}</strong>{" "}
                <span className="badge badge-blue">{tierLabels[route.tier] ?? route.tier}</span>
                <p className="subtle" style={{ margin: "5px 0 0" }}>{route.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>平台能力</h2></div>
        <div className="panel-pad list">
          {data?.skills.map((skill) => (
            <div className="list-item" key={skill.id}>
              <strong>{skill.title}</strong>
              <span className="badge" style={{ marginLeft: 8 }}>{skill.status}</span>
              <span className="badge" style={{ marginLeft: 8 }}>{skill.risk}</span>
              <p className="subtle" style={{ margin: "5px 0 0" }}>沉淀样本：{skill.evidence.length}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
