"use client";

import { useState } from "react";

type Run = {
  id: string;
  state: string;
  intent: { title: string; prompt: string };
  buildVersion?: {
    id: string;
    summary: string;
    contentModel?: { title: string; thesis: string; audience: string };
  };
};

export function CreateWorkspace() {
  const [title, setTitle] = useState("我的个人网站");
  const [prompt, setPrompt] = useState(
    "我希望网站呈现我的经历、项目、研究兴趣和个人表达，整体感觉清晰、可信、有个人气质。"
  );
  const [audience, setAudience] = useState("合作伙伴、朋友、未来机会");
  const [style, setStyle] = useState("calm");
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<Run | null>(null);

  const submit = async () => {
    setLoading(true);
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        prompt: `${prompt}\n\n视觉风格: ${style}`,
        audience,
        desiredArtifact: "site",
        constraints: [
          "Use the user's knowledge base as the main content source.",
          "Create a polished personal website draft.",
          "Hide internal orchestration details from the user interface."
        ]
      })
    });
    const data = await response.json();
    setRun(data.run);
    setLoading(false);
  };

  return (
    <div className="studio-create">
      <section className="create-main panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Create</p>
            <h1>创建个人网站</h1>
          </div>
          {run && <span className="badge badge-green">草稿已生成</span>}
        </div>
        <div className="panel-pad grid">
          <div className="builder-step">
            <span className="step-dot">1</span>
            <div className="grid">
              <label className="field">
                <span className="label">网站名称</span>
                <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="field">
                <span className="label">你想呈现什么</span>
                <textarea className="textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </label>
            </div>
          </div>
          <div className="builder-step">
            <span className="step-dot">2</span>
            <div className="grid grid-2">
            <label className="field">
              <span className="label">受众</span>
              <input className="input" value={audience} onChange={(event) => setAudience(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">风格</span>
              <select className="select" value={style} onChange={(event) => setStyle(event.target.value)}>
                <option value="calm">清晰克制</option>
                <option value="editorial">杂志编辑感</option>
                <option value="portfolio">作品集</option>
                <option value="minimal">极简</option>
              </select>
            </label>
            </div>
          </div>
          <div className="builder-step">
            <span className="step-dot">3</span>
            <div className="knowledge-pick">
              <div>
                <strong>默认知识库</strong>
                <p className="subtle" style={{ margin: "4px 0 0" }}>个人简介 · 项目经历 · 写作主题</p>
              </div>
              <a className="btn" href="/knowledge">管理知识库</a>
            </div>
          </div>
          <div className="builder-actions">
            <button className="btn btn-primary" onClick={submit} disabled={loading}>
              {loading ? "正在生成..." : "生成网站"}
            </button>
            {run?.buildVersion && <a className="btn" href="/site">查看我的网站</a>}
          </div>
        </div>
      </section>

      <aside className="create-side">
        <section className="panel site-card-preview">
          <div className="preview-browser">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-hero">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{run?.buildVersion?.contentModel?.title ?? title}</h2>
              <p>{run?.buildVersion?.contentModel?.thesis ?? prompt}</p>
            </div>
          </div>
          <div className="preview-sections">
            <span>About</span>
            <span>Projects</span>
            <span>Writing</span>
          </div>
        </section>
        <section className="panel panel-pad">
          <h2>生成状态</h2>
          <div className="status-row">
            <span className={`status-dot ${run ? "ready" : loading ? "working" : ""}`} />
            <div>
              <strong>{loading ? "正在生成草稿" : run ? "草稿已准备好" : "等待开始"}</strong>
              <p className="subtle" style={{ margin: "3px 0 0" }}>
                {run ? "可以在“我的网站”中查看和管理版本。" : "填写信息后即可生成。"}
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
