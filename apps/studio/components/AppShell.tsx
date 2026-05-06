"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((response) => response.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
        setUser(data.user);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const nav = [
    { href: "/create", label: "创建" },
    { href: "/knowledge", label: "知识库" },
    { href: "/site", label: "我的网站" }
  ];

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav-inner">
          <Link href="/create" className="brand">
            <span className="brand-mark">W</span>
            <span>Personal Wiki</span>
          </Link>
          <nav className="nav-links">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname.startsWith(item.href) ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
            {user?.role === "admin" && (
              <Link href="/admin" className={`nav-link ${pathname.startsWith("/admin") ? "active" : ""}`}>
                后台
              </Link>
            )}
          </nav>
          <div className="nav-actions">
            {user && <span className="badge">{user.name}</span>}
            <button className="btn" onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
