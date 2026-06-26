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

function LogoMark() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="56" r="36" fill="#E86C2C" />
      <ellipse cx="60" cy="65" rx="22" ry="18" fill="#FFF3E0" />
      <path d="M26,38 L18,6 L48,30Z" fill="#E86C2C" />
      <path d="M94,38 L102,6 L72,30Z" fill="#E86C2C" />
      <ellipse cx="44" cy="52" rx="5" ry="6" fill="#2D5016" />
      <circle cx="45.5" cy="50.5" r="1.5" fill="#fff" />
      <ellipse cx="76" cy="52" rx="5" ry="6" fill="#2D5016" />
      <circle cx="77.5" cy="50.5" r="1.5" fill="#fff" />
      <ellipse cx="60" cy="64" rx="4" ry="3" fill="#333" />
      <path d="M52,72 Q60,78 68,72" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((response) => response.json())
      .then((data) => {
        if (!data.user) {
          router.push(`/login?next=${encodeURIComponent(pathname || "/create")}`);
          return;
        }
        setUser(data.user);
        setCheckingSession(false);
      })
      .catch(() => router.push(`/login?next=${encodeURIComponent(pathname || "/create")}`));
  }, [pathname, router]);

  const navItems = [
    { href: "/create", label: "创建" },
    { href: "/knowledge", label: "知识库" },
    { href: "/dashboard", label: "我的网站" },
    ...(user?.role === "admin" ? [{ href: "/admin", label: "后台" }] : [])
  ];

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const linkClass = (href: string) =>
    `relative text-sm transition-colors ${
      pathname === href || (href === "/dashboard" && pathname === "/site")
        ? "text-gray-900"
      : "text-gray-500 hover:text-gray-900"
    }`;

  if (checkingSession) {
    return (
      <div className="relative grid min-h-screen place-items-center bg-bg">
        <div className="wizard-bg">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
        </div>
        <div className="relative z-10 h-8 w-8 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <div className="wizard-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-black/5 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/create" className="flex items-center gap-2">
            <LogoMark />
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
              Personal Wiki
            </span>
          </Link>

          <div className="hidden items-center gap-5 md:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                {item.label}
                <span
                  className={`absolute -bottom-1 left-0 h-0.5 rounded-full bg-accent transition-all ${
                    pathname === item.href || (item.href === "/dashboard" && pathname === "/site") ? "w-full" : "w-0"
                  }`}
                />
              </Link>
            ))}
            {user && (
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-medium text-white">
                  {user.name?.[0] || user.email?.[0] || "U"}
                </div>
                <button onClick={logout} className="text-xs text-gray-400 transition-colors hover:text-gray-600">
                  退出
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 md:hidden"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 7h16M4 12h16M4 17h16"}
              />
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="space-y-3 border-t border-black/5 bg-white/95 px-6 py-4 shadow-lg backdrop-blur-xl md:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`block text-sm ${pathname === item.href ? "font-medium text-accent" : "text-gray-600"}`}
              >
                {item.label}
              </Link>
            ))}
            <button onClick={logout} className="block text-sm text-gray-500">
              退出
            </button>
          </div>
        )}
      </nav>

      {children}
    </div>
  );
}
