import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BuildIntent, HarnessRun } from "@personal-wiki-harness/harness-core";

export type BuildJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type BuildJob = {
  id: string;
  userId: string;
  kind: "site-build";
  status: BuildJobStatus;
  intent: Omit<BuildIntent, "id" | "createdAt">;
  createdAt: string;
  updatedAt: string;
  attempt: number;
  queuePosition: number;
  startedAt?: string;
  finishedAt?: string;
  runId?: string;
  versionId?: string;
  error?: string;
};

export type BuildLogLevel = "info" | "warn" | "error";

export type BuildLogEvent = {
  id: string;
  userId: string;
  jobId: string;
  runId?: string;
  phase:
    | "queued"
    | "quota"
    | "knowledge"
    | "planning"
    | "agent"
    | "compile"
    | "verify"
    | "version"
    | "publish"
    | "failed";
  level: BuildLogLevel;
  message: string;
  createdAt: string;
  data?: Record<string, unknown>;
};

export type UsageKind = "build" | "llm" | "storage" | "publish";

export type UsageRecord = {
  id: string;
  userId: string;
  kind: UsageKind;
  quantity: number;
  costUnits: number;
  model?: string;
  refId?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type UserQuotaLimits = {
  buildsPerDay: number;
  sourceChars: number;
  costUnitsPerDay: number;
  publishedSites: number;
};

export type UserQuotaSnapshot = {
  userId: string;
  plan: "alpha";
  day: string;
  limits: UserQuotaLimits;
  usage: {
    buildsToday: number;
    sourceChars: number;
    costUnitsToday: number;
    publishedSites: number;
  };
};

export type DeploymentRecord = {
  id: string;
  provider: "local-artifact" | "vercel" | "cloudflare-pages" | "s3-cdn";
  status: "ready" | "pending" | "failed";
  url: string;
  artifactPath: string;
  createdAt: string;
  error?: string;
};

export type SiteDesignAssetKind =
  | "component"
  | "pattern"
  | "template"
  | "design-token"
  | "style-guide"
  | "skill"
  | "tool"
  | "mcp-tool";

export type SiteDesignAssetRole =
  | "layout"
  | "navigation"
  | "hero"
  | "background"
  | "motion"
  | "section"
  | "card"
  | "call-to-action"
  | "accessibility"
  | "visual-audit"
  | "copywriting"
  | "design-system"
  | "typography"
  | "color";

export type SiteDesignAssetProvider =
  | "studio"
  | "magic-ui"
  | "shadcn"
  | "figma"
  | "21st-dev"
  | "custom";

export type SiteDesignAsset = {
  id: string;
  name: string;
  kind: SiteDesignAssetKind;
  role: SiteDesignAssetRole;
  description: string;
  capabilities: string[];
  recommendedFor: string[];
  avoidWhen: string[];
  constraints: string[];
  examples?: string[];
  installHints?: string[];
  source: {
    kind: "local-registry" | "mcp-registry" | "skill-registry" | "tool-registry";
    provider: SiteDesignAssetProvider;
    serverName?: string;
    registryItemName?: string;
    skillId?: string;
    toolName?: string;
  };
};

export type SiteDesignComponent = SiteDesignAsset & {
  kind: "component" | "pattern" | "template";
};

export const alphaQuotaLimits: UserQuotaLimits = {
  buildsPerDay: Number(process.env.PWH_QUOTA_BUILDS_PER_DAY || 20),
  sourceChars: Number(process.env.PWH_QUOTA_SOURCE_CHARS || 2_000_000),
  costUnitsPerDay: Number(process.env.PWH_QUOTA_COST_UNITS_PER_DAY || 1_000),
  publishedSites: Number(process.env.PWH_QUOTA_PUBLISHED_SITES || 20)
};

const DESIGN_ASSET_KINDS = new Set<SiteDesignAssetKind>([
  "component",
  "pattern",
  "template",
  "design-token",
  "style-guide",
  "skill",
  "tool",
  "mcp-tool"
]);

const DESIGN_ASSET_ROLES = new Set<SiteDesignAssetRole>([
  "layout",
  "navigation",
  "hero",
  "background",
  "motion",
  "section",
  "card",
  "call-to-action",
  "accessibility",
  "visual-audit",
  "copywriting",
  "design-system",
  "typography",
  "color"
]);

const DESIGN_ASSET_PROVIDERS = new Set<SiteDesignAssetProvider>([
  "studio",
  "magic-ui",
  "shadcn",
  "figma",
  "21st-dev",
  "custom"
]);

export const staticSiteDesignAssetRegistry: SiteDesignAsset[] = [
  {
    id: "layout-single-page-editorial",
    name: "Single Page Editorial",
    kind: "template",
    role: "layout",
    description: "A polished one-page editorial website for personal public expression.",
    capabilities: ["page layout", "narrative flow", "public identity"],
    recommendedFor: ["personal profile", "public expression", "portfolio"],
    avoidWhen: ["multi-tenant dashboard", "dense admin workspace"],
    constraints: ["Use a real hero section", "Keep navigation concise", "Do not expose internal harness language"],
    examples: ["personal homepage", "research profile", "founder portfolio"],
    source: { kind: "local-registry", provider: "studio" }
  },
  {
    id: "hero-identity-thesis",
    name: "Identity Thesis Hero",
    kind: "component",
    role: "hero",
    description: "Large identity-focused hero with audience, thesis, and site signal.",
    capabilities: ["first viewport positioning", "identity framing", "audience promise"],
    recommendedFor: ["personal homepage", "founder profile", "research landing page"],
    avoidWhen: ["anonymous documentation", "pure utility page"],
    constraints: ["The title must be the site/person/product name", "Use content grounded in the selected wiki"],
    source: { kind: "local-registry", provider: "studio" }
  },
  {
    id: "section-evidence-led",
    name: "Evidence Led Section",
    kind: "pattern",
    role: "section",
    description: "A section that turns wiki pages/entities into public-facing proof points.",
    capabilities: ["source-grounded sections", "claim support", "case evidence"],
    recommendedFor: ["case study", "research summary", "project proof"],
    avoidWhen: ["purely decorative page"],
    constraints: ["Preserve source refs in content model", "Prefer specific claims over generic filler"],
    source: { kind: "local-registry", provider: "studio" }
  },
  {
    id: "card-project-proof",
    name: "Project Proof Card",
    kind: "component",
    role: "card",
    description: "Compact project or capability card for portfolio-style pages.",
    capabilities: ["project summary", "scannable proof", "capability grouping"],
    recommendedFor: ["portfolio", "capability overview", "project list"],
    avoidWhen: ["single narrative essay"],
    constraints: ["Keep text scannable", "Avoid nested card layouts"],
    source: { kind: "local-registry", provider: "studio" }
  },
  {
    id: "magic-grid-background",
    name: "Magic UI Grid Background",
    kind: "component",
    role: "background",
    description: "A restrained grid background for technical, portfolio, or product pages.",
    capabilities: ["background texture", "technical visual tone", "hero depth"],
    recommendedFor: ["technical personal site", "AI product page", "research system overview"],
    avoidWhen: ["already visually dense page", "image-led landing page"],
    constraints: ["Use as a supporting surface, not the main content", "Keep contrast readable on mobile"],
    installHints: ["Use Magic UI MCP getRegistryItem before implementing the exact component source."],
    source: {
      kind: "mcp-registry",
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      registryItemName: "grid background"
    }
  },
  {
    id: "magic-blur-fade",
    name: "Magic UI Blur Fade",
    kind: "component",
    role: "motion",
    description: "A subtle text or section entrance animation for polished but quiet reveals.",
    capabilities: ["entrance motion", "progressive reveal", "premium feel"],
    recommendedFor: ["hero headline", "section intro", "launch page"],
    avoidWhen: ["long knowledge article", "accessibility-sensitive dense reading"],
    constraints: ["Motion must remain decorative", "Content must be readable without animation"],
    installHints: ["Use Magic UI MCP getRegistryItem before implementing the exact component source."],
    source: {
      kind: "mcp-registry",
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      registryItemName: "blur fade"
    }
  },
  {
    id: "magic-vertical-marquee",
    name: "Magic UI Vertical Marquee",
    kind: "component",
    role: "section",
    description: "A scrolling list pattern for logos, quotes, highlights, or repeated proof points.",
    capabilities: ["repeated proof points", "logo wall", "ambient highlights"],
    recommendedFor: ["testimonial wall", "project highlights", "tool/logo strip"],
    avoidWhen: ["few items", "primary long-form content"],
    constraints: ["Use only with enough repeated items", "Pause or reduce motion when accessibility settings require it"],
    installHints: ["Use Magic UI MCP getRegistryItem before implementing the exact component source."],
    source: {
      kind: "mcp-registry",
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      registryItemName: "vertical marquee"
    }
  },
  {
    id: "skill-accessible-motion",
    name: "Accessible Motion Skill",
    kind: "skill",
    role: "accessibility",
    description: "A reusable design skill for reducing, pausing, or replacing decorative motion.",
    capabilities: ["motion fallback", "reduced motion policy", "accessibility review"],
    recommendedFor: ["animated landing page", "Magic UI motion component", "marquee or reveal effect"],
    avoidWhen: ["static document export"],
    constraints: ["Respect reduced-motion preference", "Never hide required content behind animation"],
    examples: ["Add prefers-reduced-motion CSS around animated components."],
    source: {
      kind: "skill-registry",
      provider: "studio",
      skillId: "accessible-motion-v1"
    }
  },
  {
    id: "tool-responsive-visual-audit",
    name: "Responsive Visual Audit Tool",
    kind: "tool",
    role: "visual-audit",
    description: "A verifier-side design tool contract for checking layout, text fit, and viewport behavior.",
    capabilities: ["responsive QA", "text overflow detection", "preview validation"],
    recommendedFor: ["every generated public site", "mobile-heavy site", "animation-heavy site"],
    avoidWhen: ["non-visual JSON export"],
    constraints: ["Run after HTML artifact exists", "Report concrete failing viewport or selector when possible"],
    source: {
      kind: "tool-registry",
      provider: "studio",
      toolName: "verifySite"
    }
  }
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const getDesignAssetCacheRoot = () => {
  if (process.env.PWH_DESIGN_ASSET_CACHE_PATH) return process.env.PWH_DESIGN_ASSET_CACHE_PATH;
  const defaultRoot = path.join(process.cwd(), ".pwh-studio", "design-assets");
  const candidates = [
    defaultRoot,
    path.join(process.cwd(), "..", "..", ".pwh-studio", "design-assets")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? defaultRoot;
};

const normalizeCachedDesignAsset = (value: unknown): SiteDesignAsset | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const description = stringValue(value.description);
  if (!id || !name || !description) return null;

  const kindValue = stringValue(value.kind);
  const roleValue = stringValue(value.role);
  const sourceValue = isRecord(value.source) ? value.source : {};
  const providerValue = stringValue(sourceValue.provider);
  const sourceKindValue = stringValue(sourceValue.kind);
  const provider = providerValue && DESIGN_ASSET_PROVIDERS.has(providerValue as SiteDesignAssetProvider)
    ? (providerValue as SiteDesignAssetProvider)
    : "custom";
  const source: SiteDesignAsset["source"] = {
    kind:
      sourceKindValue === "mcp-registry" ||
      sourceKindValue === "skill-registry" ||
      sourceKindValue === "tool-registry" ||
      sourceKindValue === "local-registry"
        ? sourceKindValue
        : "local-registry",
    provider
  };
  const serverName = stringValue(sourceValue.serverName);
  const registryItemName = stringValue(sourceValue.registryItemName);
  const skillId = stringValue(sourceValue.skillId);
  const toolName = stringValue(sourceValue.toolName);
  if (serverName) source.serverName = serverName;
  if (registryItemName) source.registryItemName = registryItemName;
  if (skillId) source.skillId = skillId;
  if (toolName) source.toolName = toolName;

  return {
    id,
    name,
    kind: kindValue && DESIGN_ASSET_KINDS.has(kindValue as SiteDesignAssetKind) ? (kindValue as SiteDesignAssetKind) : "component",
    role: roleValue && DESIGN_ASSET_ROLES.has(roleValue as SiteDesignAssetRole) ? (roleValue as SiteDesignAssetRole) : "section",
    description,
    capabilities: stringArray(value.capabilities),
    recommendedFor: stringArray(value.recommendedFor),
    avoidWhen: stringArray(value.avoidWhen),
    constraints: stringArray(value.constraints),
    examples: stringArray(value.examples),
    installHints: stringArray(value.installHints),
    source
  };
};

export const loadExternalSiteDesignAssets = (): SiteDesignAsset[] => {
  const root = getDesignAssetCacheRoot();
  if (!existsSync(root)) return [];
  const assets: SiteDesignAsset[] = [];
  for (const fileName of readdirSync(root)) {
    if (!fileName.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(path.join(root, fileName), "utf8"));
      const candidates = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.assets) ? parsed.assets : [];
      for (const candidate of candidates) {
        const asset = normalizeCachedDesignAsset(candidate);
        if (asset) assets.push(asset);
      }
    } catch {
      // Ignore malformed design asset cache files; the verifier can surface missing refs later.
    }
  }
  return assets;
};

export const getSiteDesignAssetRegistry = (): SiteDesignAsset[] => {
  const byId = new Map<string, SiteDesignAsset>();
  for (const asset of staticSiteDesignAssetRegistry) byId.set(asset.id, asset);
  for (const asset of loadExternalSiteDesignAssets()) byId.set(asset.id, asset);
  return [...byId.values()];
};

const designAssetMatches = (asset: SiteDesignAsset, query: string) => {
  if (!query) return true;
  const haystack = [
    asset.id,
    asset.name,
    asset.kind,
    asset.role,
    asset.description,
    ...asset.capabilities,
    ...asset.recommendedFor,
    ...asset.avoidWhen,
    ...asset.constraints,
    ...(asset.examples ?? []),
    ...(asset.installHints ?? []),
    asset.source.provider,
    asset.source.serverName ?? "",
    asset.source.registryItemName ?? "",
    asset.source.skillId ?? "",
    asset.source.toolName ?? ""
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
};

export const searchSiteDesignAssets = (input: {
  query?: string;
  kind?: SiteDesignAssetKind;
  role?: SiteDesignAssetRole;
  provider?: SiteDesignAssetProvider;
  limit?: number;
}) => {
  const query = input.query?.trim().toLowerCase() ?? "";
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  return getSiteDesignAssetRegistry()
    .filter((asset) => {
      if (input.kind && asset.kind !== input.kind) return false;
      if (input.role && asset.role !== input.role) return false;
      if (input.provider && asset.source.provider !== input.provider) return false;
      return designAssetMatches(asset, query);
    })
    .slice(0, limit);
};

export const readSiteDesignAsset = (idOrName: string) => {
  const needle = idOrName.trim().toLowerCase();
  return (
    getSiteDesignAssetRegistry().find(
      (asset) =>
        asset.id.toLowerCase() === needle ||
        asset.name.toLowerCase() === needle ||
        asset.source.registryItemName?.toLowerCase() === needle ||
        asset.source.skillId?.toLowerCase() === needle ||
        asset.source.toolName?.toLowerCase() === needle
    ) ?? null
  );
};

const isSiteDesignComponent = (asset: SiteDesignAsset): asset is SiteDesignComponent =>
  asset.kind === "component" || asset.kind === "pattern" || asset.kind === "template";

export const siteDesignAssetRegistry: SiteDesignAsset[] = staticSiteDesignAssetRegistry;

export const getSiteDesignComponentRegistry = () => getSiteDesignAssetRegistry().filter(isSiteDesignComponent);

export const siteDesignComponentRegistry: SiteDesignComponent[] = staticSiteDesignAssetRegistry.filter(isSiteDesignComponent);

export const searchSiteDesignComponents = (input: {
  query?: string;
  role?: SiteDesignComponent["role"];
  limit?: number;
}) => {
  const searchInput: Parameters<typeof searchSiteDesignAssets>[0] = {};
  if (input.query) searchInput.query = input.query;
  if (input.role) searchInput.role = input.role;
  if (input.limit !== undefined) searchInput.limit = input.limit;
  return searchSiteDesignAssets(searchInput).filter(isSiteDesignComponent);
};

export const readSiteDesignComponent = (idOrName: string) => {
  const asset = readSiteDesignAsset(idOrName);
  return asset && isSiteDesignComponent(asset) ? asset : null;
};

export const recommendSiteDesignAssets = (input: {
  siteType?: string;
  audience?: string;
  style?: string;
  limit?: number;
}) => {
  const terms = [input.siteType, input.audience, input.style].filter(Boolean).join(" ").toLowerCase();
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  return getSiteDesignAssetRegistry()
    .map((asset) => {
      const positive = [...asset.recommendedFor, ...asset.capabilities, asset.role, asset.kind].join(" ").toLowerCase();
      const negative = asset.avoidWhen.join(" ").toLowerCase();
      const score =
        (terms && positive.includes(terms) ? 4 : 0) +
        terms
          .split(/\s+/)
          .filter((term) => term && positive.includes(term)).length -
        terms
          .split(/\s+/)
          .filter((term) => term && negative.includes(term)).length;
      return { asset, score };
    })
    .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id))
    .slice(0, limit)
    .map(({ asset, score }) => ({ ...asset, recommendationScore: score }));
};

export const productionReadinessChecklist = [
  "database-schema-defined",
  "repository-interface-ready",
  "build-jobs-queued",
  "build-logs-visible",
  "quota-and-cost-ledger",
  "deployment-provider-abstraction",
  "design-asset-registry"
];

export const createQuotaSnapshot = (input: {
  userId: string;
  now: string;
  sourceChars: number;
  publishedSites: number;
  usageRecords: UsageRecord[];
}): UserQuotaSnapshot => {
  const day = input.now.slice(0, 10);
  const todayRecords = input.usageRecords.filter((record) => record.createdAt.startsWith(day));
  return {
    userId: input.userId,
    plan: "alpha",
    day,
    limits: alphaQuotaLimits,
    usage: {
      buildsToday: todayRecords.filter((record) => record.kind === "build").length,
      sourceChars: input.sourceChars,
      costUnitsToday: todayRecords.reduce((sum, record) => sum + record.costUnits, 0),
      publishedSites: input.publishedSites
    }
  };
};

export const assertBuildQuota = (quota: UserQuotaSnapshot) => {
  if (quota.usage.buildsToday >= quota.limits.buildsPerDay) {
    throw new Error("今日生成次数已达到 alpha 测试配额。");
  }
  if (quota.usage.sourceChars > quota.limits.sourceChars) {
    throw new Error("当前知识库资料量超过 alpha 测试上限。");
  }
  if (quota.usage.costUnitsToday >= quota.limits.costUnitsPerDay) {
    throw new Error("今日模型成本配额已达到 alpha 测试上限。");
  }
  if (quota.usage.publishedSites >= quota.limits.publishedSites) {
    throw new Error("已保存网站数量达到 alpha 测试上限。");
  }
};

export const estimateBuildCostUnits = (run: HarnessRun): number => {
  const traceCost = (run.subAgentTraces ?? []).reduce((sum, trace) => {
    const toolCalls = trace.result?.toolCalls.length ?? 0;
    return sum + 6 + toolCalls * 2;
  }, 0);
  const artifactCost = run.buildVersion?.siteArtifact ? 8 : 3;
  return Math.max(8, traceCost + artifactCost);
};

export const createUsageRecord = (input: {
  id: string;
  userId: string;
  kind: UsageKind;
  quantity: number;
  costUnits: number;
  createdAt: string;
  model?: string;
  refId?: string;
  metadata?: Record<string, unknown>;
}): UsageRecord => ({
  id: input.id,
  userId: input.userId,
  kind: input.kind,
  quantity: input.quantity,
  costUnits: input.costUnits,
  createdAt: input.createdAt,
  ...(input.model ? { model: input.model } : {}),
  ...(input.refId ? { refId: input.refId } : {}),
  ...(input.metadata ? { metadata: input.metadata } : {})
});

export const createLocalDeploymentRecord = (input: {
  id: string;
  versionId: string;
  createdAt: string;
}): DeploymentRecord => ({
  id: input.id,
  provider: "local-artifact",
  status: "ready",
  url: `/site?version=${encodeURIComponent(input.versionId)}`,
  artifactPath: `local://published-sites/${input.versionId}/index.html`,
  createdAt: input.createdAt
});
