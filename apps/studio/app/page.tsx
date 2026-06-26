import Link from "next/link";

const features = [
  {
    title: "从知识库开始",
    desc: "先沉淀个人资料、项目、写作和经历，再把它们组织成网站内容。",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13"
  },
  {
    title: "自动生成网站",
    desc: "输入目标和风格，系统生成个人网站草稿、内容结构和版本记录。",
    icon: "M13 10V3L4 14h7v7l9-11h-7z"
  },
  {
    title: "持续管理版本",
    desc: "每次生成都保留版本，后续可以编辑、预览、发布和迭代。",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
  }
];

function LogoMark() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="56" r="36" fill="#E86C2C" />
      <ellipse cx="60" cy="65" rx="22" ry="18" fill="#FFF3E0" />
      <path d="M26,38 L18,6 L48,30Z" fill="#E86C2C" />
      <path d="M94,38 L102,6 L72,30Z" fill="#E86C2C" />
      <ellipse cx="44" cy="52" rx="5" ry="6" fill="#2D5016" />
      <ellipse cx="76" cy="52" rx="5" ry="6" fill="#2D5016" />
      <ellipse cx="60" cy="64" rx="4" ry="3" fill="#333" />
      <path d="M52,72 Q60,78 68,72" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#eef2ff_0%,#f8fafc_45%,#ffffff_100%)]">
      <div className="wizard-bg">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-black/5 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
              Personal Wiki
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-500 transition-colors hover:text-gray-900">
              登录
            </Link>
            <Link href="/create" className="rounded-lg bg-accent px-4 py-1.5 text-sm text-white transition-colors hover:bg-accent/90">
              开始创建
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 px-6 pb-16 pt-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-white/75 px-4 py-1.5 text-xs font-medium text-accent shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              个人网站从你的知识库开始
            </div>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-gray-900 md:text-5xl lg:text-6xl">
              把你的
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-transparent">
                个人知识
              </span>
              <br />
              编译成网站
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">
              整理资料、抽取主题、生成内容结构，最后得到一个可以持续迭代的个人网站。
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/create"
                className="rounded-xl bg-gradient-to-r from-accent to-fuchsia-500 px-8 py-3.5 text-sm font-medium text-white shadow-lg shadow-accent/25 transition-all hover:opacity-90"
              >
                生成我的网站
              </Link>
              <Link
                href="/knowledge"
                className="rounded-xl border border-gray-200 bg-white/90 px-8 py-3.5 text-sm text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:text-gray-900"
              >
                管理知识库
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
              <div className="flex h-10 items-center gap-2 border-b border-gray-100 bg-gray-50 px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </div>
              <div className="p-8">
                <div className="mb-8 h-56 rounded-2xl bg-[radial-gradient(circle_at_top_right,#ddd6fe,transparent_35%),linear-gradient(135deg,#ffffff,#f1f5f9)] p-8">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">Preview</p>
                  <h2 className="text-3xl font-bold leading-tight text-gray-900">Mingyu 的个人网站</h2>
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-600">
                    AI 产品、知识建模、个人表达和项目作品的清晰展示。
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {["About", "Projects", "Writing"].map((item) => (
                    <div key={item} className="grid h-20 place-items-center rounded-2xl bg-gray-50 text-sm font-medium text-gray-500">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 py-12">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/20 hover:shadow-lg"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-transparent opacity-80" />
              <div className="relative">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 shadow-sm">
                  <svg className="h-6 w-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} />
                  </svg>
                </div>
                <h3 className="mb-2 font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
