"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(mode === "login" ? "admin@personal.wiki" : "");
  const [password, setPassword] = useState(mode === "login" ? "admin123" : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "Request failed.");
      return;
    }
    router.push("/create");
  };

  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <p className="eyebrow">Personal Wiki</p>
        <h1>{mode === "login" ? "登录个人网站平台" : "创建账号"}</h1>
        <p className="subtle">
          {mode === "login"
            ? "默认管理员账号已预填，便于本地测试。"
            : "注册后可以整理知识库并生成个人网站。"}
        </p>
        <form className="grid" onSubmit={submit}>
          {mode === "register" && (
            <label className="field">
              <span className="label">Name</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          {error && <div className="badge badge-amber">{error}</div>}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </form>
        <p className="subtle" style={{ marginTop: 18 }}>
          {mode === "login" ? (
            <>
              没有账号？ <Link href="/register">注册</Link>
            </>
          ) : (
            <>
              已有账号？ <Link href="/login">登录</Link>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
