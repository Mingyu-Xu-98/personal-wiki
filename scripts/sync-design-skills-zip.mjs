import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const zipPath = args.zip || args._[0];
  if (!zipPath) {
    throw new Error("Usage: npm run sync:design-skills -- /path/to/skills.zip");
  }

  const outputPath = args.output || path.join(".pwh-studio", "design-assets", "design-skills.json");
  const entries = await listZipEntries(zipPath);
  const skillEntries = entries.filter(isDesignSkillEntry);
  const assets = [];

  for (const entry of skillEntries) {
    const content = await readZipEntry(zipPath, entry).catch(() => "");
    if (!content) continue;
    const asset = toDesignSkillAsset({ entry, content });
    if (asset) assets.push(asset);
  }

  const uniqueAssets = uniqueById(assets).sort((a, b) => a.id.localeCompare(b.id));
  await writeAssetCache(outputPath, {
    provider: "design-skills",
    syncedAt: new Date().toISOString(),
    sourceZip: zipPath,
    assets: uniqueAssets
  });

  console.log(
    JSON.stringify(
      {
        outputPath,
        sourceZip: zipPath,
        scannedSkillFiles: skillEntries.length,
        assets: uniqueAssets.length,
        sample: uniqueAssets.slice(0, 8).map((asset) => asset.id)
      },
      null,
      2
    )
  );
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--zip") parsed.zip = rawArgs[++index];
    else if (arg === "--output") parsed.output = rawArgs[++index];
    else parsed._.push(arg);
  }
  return parsed;
}

async function listZipEntries(zipPath) {
  const { stdout } = await execFileAsync("unzip", ["-Z1", zipPath], { maxBuffer: 10 * 1024 * 1024 });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function readZipEntry(zipPath, entry) {
  const { stdout } = await execFileAsync("unzip", ["-p", zipPath, entry], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

function isDesignSkillEntry(entry) {
  if (!entry.endsWith("/SKILL.md")) return false;
  if (entry.startsWith("__MACOSX/") || entry.includes("/.git/")) return false;
  if (entry.includes("/ui-skill/")) return true;
  if (entry.includes("/style-skills/skills/")) return true;
  if (entry.includes("/storytelling-for-user-experience-crafting-stories-for-better-design-skill.pdf/")) return true;
  if (entry.includes("/mattpocock-skills/design-an-interface/")) return true;
  return false;
}

function toDesignSkillAsset(input) {
  const parsed = parseSkillMarkdown(input.content);
  const name = parsed.frontmatter.name || titleFromEntry(input.entry);
  const description = parsed.frontmatter.description || parsed.summary;
  if (!name || !description) return null;

  const text = `${input.entry}\n${name}\n${description}\n${parsed.body}`.toLowerCase();
  const role = inferRole({ entry: input.entry, name, description, body: parsed.body });
  const idBase = slugify(`${name}-${input.entry}`);
  const skillId = `zip:${input.entry}`;

  return {
    id: `skill-${idBase || stableHash(input.entry)}`,
    name: titleCase(name),
    kind: "skill",
    role,
    description: cleanText(description).slice(0, 720),
    capabilities: inferCapabilities(role, text),
    recommendedFor: inferRecommendedFor(role, text),
    avoidWhen: inferAvoidWhen(role, text),
    constraints: inferConstraints(role),
    examples: [parsed.summary, excerpt(parsed.body, 1400)].filter(Boolean),
    installHints: [
      `Synced from ${input.entry}. Treat this as design guidance, not source content.`,
      "If selected, record the skill id in DesignUsagePlan before compiling the site."
    ],
    source: {
      kind: "skill-registry",
      provider: "custom",
      skillId
    }
  };
}

function parseSkillMarkdown(markdown) {
  const text = markdown.replace(/\r\n/g, "\n");
  const frontmatter = {};
  let body = text;
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 4);
    if (end !== -1) {
      const raw = text.slice(4, end);
      body = text.slice(end + 4).trim();
      Object.assign(frontmatter, parseFrontmatter(raw));
    }
  }
  return {
    frontmatter,
    body,
    summary: firstUsefulParagraph(body)
  };
}

function parseFrontmatter(raw) {
  const result = {};
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (value === ">" || value === "|") {
      const chunks = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        chunks.push(lines[++index].trim());
      }
      value = chunks.join(" ");
    }
    result[key] = stripQuotes(value);
  }
  return result;
}

function firstUsefulParagraph(body) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => cleanText(paragraph))
    .filter((paragraph) => paragraph && !paragraph.startsWith("#") && !paragraph.startsWith("```"));
  return paragraphs[0] || "";
}

function inferRole(input) {
  const key = `${input.entry}\n${input.name}`.toLowerCase();
  if (key.includes("storytelling") || key.includes("story") || key.includes("narrative") || key.includes("written")) return "copywriting";
  if (key.includes("colorize") || key.includes("color")) return "color";
  if (key.includes("typeset") || key.includes("typography") || key.includes("font")) return "typography";
  if (key.includes("animate") || key.includes("motion") || key.includes("delight")) return "motion";
  if (key.includes("arrange") || key.includes("layout") || key.includes("adapt")) return "layout";
  if (key.includes("audit") || key.includes("critique") || key.includes("polish") || key.includes("harden") || key.includes("optimize")) return "visual-audit";
  if (key.includes("onboard") || key.includes("clarify") || key.includes("navigation")) return "navigation";
  if (key.includes("ui-skill") || key.includes("frontend-design") || key.includes("extract") || key.includes("normalize") || key.includes("teach-impeccable")) {
    return "design-system";
  }
  if (key.includes("bolder") || key.includes("quieter") || key.includes("overdrive")) return "section";

  const text = `${input.description}\n${input.body}`.toLowerCase();
  if (text.includes("story") || text.includes("narrative") || text.includes("writing") || text.includes("distill")) return "copywriting";
  if (text.includes("color") || text.includes("palette")) return "color";
  if (text.includes("typography") || text.includes("font")) return "typography";
  if (text.includes("motion") || text.includes("animation")) return "motion";
  if (text.includes("layout") || text.includes("responsive")) return "layout";
  if (text.includes("audit") || text.includes("critique")) return "visual-audit";
  if (text.includes("design system") || text.includes("style guide")) return "design-system";
  if (text.includes("accessibility")) return "accessibility";
  return "section";
}

function inferCapabilities(role, text) {
  const shared = ["design guidance", "builder-agent planning", "public site quality"];
  const roleCapabilities = {
    "design-system": ["design system generation", "style selection", "token planning"],
    typography: ["font pairing", "text hierarchy", "readability"],
    color: ["palette strategy", "semantic color", "contrast planning"],
    motion: ["purposeful motion", "micro-interactions", "reduced-motion awareness"],
    layout: ["layout rhythm", "responsive composition", "spacing system"],
    "visual-audit": ["quality review", "anti-template checks", "edge-case hardening"],
    copywriting: ["narrative structure", "UX writing", "story-led sections"],
    navigation: ["onboarding flow", "wayfinding", "information architecture"],
    accessibility: ["accessibility review", "inclusive interaction", "contrast and motion checks"],
    section: ["section design", "visual differentiation", "interface refinement"]
  };
  const capabilities = [...shared, ...(roleCapabilities[role] ?? roleCapabilities.section)];
  if (text.includes("landing")) capabilities.push("landing page strategy");
  if (text.includes("dashboard")) capabilities.push("dashboard interface strategy");
  if (text.includes("portfolio")) capabilities.push("portfolio expression");
  return uniqueStrings(capabilities);
}

function inferRecommendedFor(role, text) {
  const recommended = ["generated public website", "personal site build", "site revision"];
  if (role === "design-system") recommended.push("new website design", "style direction selection");
  if (role === "copywriting") recommended.push("brand story", "case study", "about page");
  if (role === "motion") recommended.push("portfolio polish", "hero reveal");
  if (role === "visual-audit") recommended.push("pre-publish review", "UI quality pass");
  if (text.includes("portfolio")) recommended.push("portfolio");
  if (text.includes("landing")) recommended.push("landing page");
  if (text.includes("dashboard")) recommended.push("dashboard");
  return uniqueStrings(recommended);
}

function inferAvoidWhen(role, text) {
  const avoid = ["pure backend work", "non-visual data export", "content without selected wiki grounding"];
  if (role === "motion") avoid.push("accessibility-sensitive dense reading page");
  if (role === "copywriting") avoid.push("pure utility UI with no narrative need");
  if (text.includes("bold") || text.includes("overdrive")) avoid.push("strictly conservative compliance pages");
  return uniqueStrings(avoid);
}

function inferConstraints(role) {
  const constraints = [
    "Use as presentation guidance only; do not invent knowledge-base content.",
    "Preserve selected wiki/source refs in the content model.",
    "Record selected skill refs in DesignUsagePlan.",
    "Keep generated HTML public-facing; do not expose internal harness or model language."
  ];
  if (role === "motion") constraints.push("Respect prefers-reduced-motion and keep content readable without animation.");
  if (role === "color") constraints.push("Maintain accessible contrast for text and interactive elements.");
  if (role === "typography") constraints.push("Keep text responsive and readable on mobile.");
  if (role === "design-system") constraints.push("Convert recommendations into stable tokens before implementation.");
  return constraints;
}

function titleFromEntry(entry) {
  const parts = entry.split("/").filter(Boolean);
  const parent = parts.at(-2) || parts.at(-1) || "design-skill";
  return parent.replace(/[-_]+/g, " ");
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function cleanText(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(value, maxChars) {
  const cleaned = cleanText(value);
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars - 1)}…` : cleaned;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function titleCase(value) {
  const text = String(value).trim();
  if (/[\u4e00-\u9fff]/.test(text)) return text;
  return text
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueById(assets) {
  const seen = new Set();
  const result = [];
  for (const asset of assets) {
    if (seen.has(asset.id)) continue;
    seen.add(asset.id);
    result.push(asset);
  }
  return result;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

async function writeAssetCache(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, ...payload }, null, 2)}\n`);
}

function stableHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

await main();
