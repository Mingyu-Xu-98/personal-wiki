"use client";

import { useEffect, useState } from "react";

type SiteState = {
  latest: null | {
    id: string;
    summary: string;
    contentModel?: { title: string; thesis: string; audience: string };
  };
  versions: Array<{ id: string; summary: string; createdAt: string }>;
  runs: Array<{ id: string; state: string; intent: { title: string } }>;
};

export function SiteWorkspace() {
  const [data, setData] = useState<SiteState | null>(null);

  useEffect(() => {
    fetch("/api/site")
      .then((response) => response.json())
      .then(setData);
  }, []);

  const latest = data?.latest;

  return (
    <div className="grid">
      <section className="page-header">
        <div>
          <p className="eyebrow">My Site</p>
          <h1>我的网站</h1>
        </div>
        <a className="btn btn-primary" href="/create">
          创建新版本
        </a>
      </section>

      <section className="dashboard-grid">
        <div className="site-card panel">
          <div className="site-thumb">
            <div className="site-thumb-top" />
            <div className="site-thumb-body">
              <h2>{latest?.contentModel?.title ?? "尚未生成网站"}</h2>
              <p>{latest?.contentModel?.thesis ?? "从创建页面生成后，这里会出现网站预览。"}</p>
            </div>
          </div>
          <div className="site-card-body">
            <div>
              <h2>{latest?.contentModel?.title ?? "我的个人网站"}</h2>
              <p className="subtle">
                {latest ? "草稿" : "未生成"} · {latest?.contentModel?.audience ?? "个人展示"}
              </p>
            </div>
            <div className="site-actions">
              <button className="btn btn-primary" disabled={!latest}>
                预览
              </button>
              <button className="btn" disabled={!latest}>
                发布
              </button>
            </div>
          </div>
        </div>

        <aside className="grid">
          <section className="panel panel-pad stat">
            <div className="stat-value">{data?.versions.length ?? 0}</div>
            <div className="stat-label">版本</div>
          </section>
          <section className="panel panel-pad stat">
            <div className="stat-value">{data?.runs.length ?? 0}</div>
            <div className="stat-label">生成记录</div>
          </section>
        </aside>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>版本记录</h2>
          {latest ? <span className="badge badge-green">最新草稿</span> : <span className="badge badge-amber">空</span>}
        </div>
        <div className="panel-pad list">
          {data?.versions.length ? (
            data.versions.map((version) => (
              <div className="list-item version-row" key={version.id}>
                <div>
                  <strong>{version.summary}</strong>
                  <p className="subtle" style={{ margin: "5px 0 0" }}>
                    {version.id}
                  </p>
                </div>
                <button className="btn">查看</button>
              </div>
            ))
          ) : (
            <p className="subtle">还没有版本。</p>
          )}
        </div>
      </section>
    </div>
  );
}
