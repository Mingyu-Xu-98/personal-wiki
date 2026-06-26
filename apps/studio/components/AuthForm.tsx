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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordStrength = password.length >= 10 ? 3 : password.length >= 8 ? 2 : password.length >= 6 ? 1 : 0;
  const passwordLabel = passwordStrength === 3 ? "强" : passwordStrength === 2 ? "中" : passwordStrength === 1 ? "基础" : "过短";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const text = await response.text();
    let data: { error?: string } = { error: "服务暂时没有返回内容，请检查本地服务日志。" };
    if (text) {
      try {
        data = JSON.parse(text) as { error?: string };
      } catch {
        data = { error: text.slice(0, 180) || "请求失败。" };
      }
    }
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "请求失败。");
      return;
    }
    const next = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") ? next : "/create");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50">
      <div className="wizard-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-sm px-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">
              {mode === "login" ? "欢迎回到" : "创建"}
              <span className="text-accent">Personal Wiki</span>
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {mode === "login" ? "登录后继续创建和管理你的个人网站。" : "注册后整理知识库并生成个人网站。"}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">
                {error}
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                  placeholder="你的名字"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs text-gray-500">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-gray-500">密码</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                placeholder="••••••"
              />
              {mode === "register" && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full ${
                          passwordStrength >= level
                            ? level === 1
                              ? "bg-amber-400"
                              : level === 2
                                ? "bg-sky-500"
                                : "bg-emerald-500"
                            : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">密码强度：{passwordLabel}</p>
                </div>
              )}
            </div>

            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
                  placeholder="再次输入密码"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 disabled:opacity-50"
            >
              <span className="inline-flex items-center justify-center gap-2">
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
              </span>
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-400">
            {mode === "login" ? (
              <>
                没有账号？{" "}
                <Link href="/register" className="text-accent hover:text-accent/80">
                  注册
                </Link>
              </>
            ) : (
              <>
                已有账号？{" "}
                <Link href="/login" className="text-accent hover:text-accent/80">
                  登录
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
