"use client";

import { useEffect, useState } from "react";

type KnowledgeState = {
  sources: Array<{ id: string; title: string; uri: string; content: string; createdAt: string }>;
  pages: Array<{ id: string; title: string; kind: string; path: string; body: string }>;
  entities: Array<{ id: string; name: string; kind: string; summary: string }>;
  relations: Array<{ id: string; fromEntityId: string; toEntityId: string; predicate: string; confidence: number }>;
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

export function KnowledgeWorkspace() {
  const [data, setData] = useState<KnowledgeState | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const load = async () => {
    const response = await fetch("/api/knowledge");
    setData(await response.json());
  };

  useEffect(() => {
    load();
  }, []);

  const addSource = async () => {
    if (!title.trim() || !content.trim()) {
      return;
    }
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content })
    });
    setTitle("");
    setContent("");
    await load();
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="grid grid-3">
        <div className="panel panel-pad stat">
          <div className="stat-value">{data?.sources.length ?? "—"}</div>
          <div className="stat-label">资料</div>
        </div>
        <div className="panel panel-pad stat">
          <div className="stat-value">{data?.pages.length ?? "—"}</div>
          <div className="stat-label">页面</div>
        </div>
        <div className="panel panel-pad stat">
          <div className="stat-value">{data?.entities.length ?? "—"}</div>
          <div className="stat-label">主题</div>
        </div>
      </section>

      <section className="split">
        <div className="panel panel-pad">
          <p className="eyebrow">Knowledge</p>
          <h1>知识库</h1>
          <div className="grid">
            <label className="field">
              <span className="label">资料标题</span>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">资料内容</span>
              <textarea className="textarea" value={content} onChange={(event) => setContent(event.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={addSource}>添加资料</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>知识目录</h2>
            <span className="badge">自动整理</span>
          </div>
          <div className="panel-pad list">
            {data?.pages.map((page) => (
              <div className="list-item" key={page.id}>
                <strong>{page.title}</strong>
                <p className="subtle" style={{ margin: "5px 0" }}>
                  {page.path} · {kindLabels[page.kind] ?? page.kind}
                </p>
                <p style={{ margin: 0, fontSize: 13 }}>{page.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-2">
        <div className="panel">
          <div className="panel-header"><h2>主题</h2></div>
          <div className="panel-pad list">
            {data?.entities.map((entity) => (
              <div className="list-item" key={entity.id}>
                <strong>{entity.name}</strong> <span className="badge">{kindLabels[entity.kind] ?? entity.kind}</span>
                <p className="subtle" style={{ margin: "5px 0 0" }}>{entity.summary}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><h2>关联</h2></div>
          <div className="panel-pad list">
            {data?.relations.map((relation) => (
              <div className="list-item" key={relation.id}>
                <strong>{entityLabels[relation.fromEntityId] ?? relation.fromEntityId}</strong>{" "}
                {relationLabels[relation.predicate] ?? relation.predicate}{" "}
                <strong>{entityLabels[relation.toEntityId] ?? relation.toEntityId}</strong>
                <p className="subtle" style={{ margin: "5px 0 0" }}>
                  可信度 {Math.round(relation.confidence * 100)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
