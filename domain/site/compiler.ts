import type { BuildIntent, ContentModel, SectionSpec, SitePlan, WikiSnapshot } from "../index.js";

export function compileWikiToContentModel(snapshot: WikiSnapshot, intent: BuildIntent): ContentModel {
  const primary = snapshot.entities.find((entity) => entity.type === "person")
    ?? snapshot.entities.find((entity) => entity.type === "project")
    ?? snapshot.entities[0];
  const skills = snapshot.entities.filter((entity) => entity.type === "skill").slice(0, 8);
  const projects = snapshot.entities.filter((entity) => entity.type === "project").slice(0, 4);

  const sections: SectionSpec[] = [
    {
      id: "hero",
      kind: "hero",
      title: primary?.name ?? "Personal Wiki",
      entityIds: primary ? [primary.id] : [],
      narrativeRole: "establish identity and website goal",
    },
    {
      id: "projects",
      kind: "projects",
      title: "Selected Work",
      entityIds: projects.map((entity) => entity.id),
      narrativeRole: "show proof through projects",
    },
    {
      id: "skills",
      kind: "skills",
      title: "Capabilities",
      entityIds: skills.map((entity) => entity.id),
      narrativeRole: "summarize practical capability",
    },
  ];

  return {
    id: `content-${intent.id}`,
    hero: {
      entityId: primary?.id,
      name: primary?.name ?? "Personal Wiki",
      title: `${intent.purpose.replaceAll("_", " ")} for ${intent.audience}`,
      summary: intent.goal,
      tags: skills.map((entity) => entity.name),
    },
    sections,
    sourceIds: snapshot.sources.map((source) => source.id),
  };
}

export function compileContentModelToSitePlan(content: ContentModel, intent: BuildIntent): SitePlan {
  return {
    id: `plan-${content.id}`,
    narrative: `${content.hero.name}: ${content.hero.summary}`,
    visualDirection: intent.audience === "recruiter" ? "clear technical dossier" : "personal knowledge portfolio",
    interactionModel: "entity_drilldown",
    sections: content.sections,
  };
}

export function renderSiteArtifacts(content: ContentModel, plan: SitePlan, intent: BuildIntent): { html: string; markdown: string } {
  const tags = content.hero.tags.length > 0
    ? content.hero.tags.map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("\n        ")
    : "<span class=\"pill\">personal wiki</span>";
  const sections = plan.sections.map((section) => [
    "<section>",
    `  <h2>${escapeHtml(section.title)}</h2>`,
    `  <p>${escapeHtml(section.narrativeRole)}</p>`,
    `  <small>${section.entityIds.length} linked wiki entities</small>`,
    "</section>",
  ].join("\n")).join("\n");

  const html = [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>${escapeHtml(content.hero.name)}</title>`,
    "  <style>",
    "    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f7f2; color: #202124; }",
    "    main { max-width: 920px; margin: 0 auto; padding: 72px 24px; }",
    "    h1 { font-size: 48px; line-height: 1; margin: 0 0 16px; max-width: 760px; }",
    "    h2 { margin-top: 40px; }",
    "    p { font-size: 18px; line-height: 1.6; max-width: 720px; }",
    "    section { border-top: 1px solid #d8d6ca; padding-top: 24px; margin-top: 32px; }",
    "    .pill { display: inline-block; border: 1px solid #202124; padding: 6px 10px; margin: 6px 6px 0 0; font-size: 13px; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    `    <h1>${escapeHtml(content.hero.name)}</h1>`,
    `    <p>${escapeHtml(content.hero.summary)}</p>`,
    "    <div>",
    `      ${tags}`,
    "    </div>",
    sections,
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");

  const markdown = [
    `# ${content.hero.name}`,
    "",
    content.hero.summary,
    "",
    `Audience: ${intent.audience}`,
    `Plan: ${plan.visualDirection}`,
    "",
    "## Sections",
    "",
    ...plan.sections.map((section) => `- ${section.title}: ${section.narrativeRole}`),
    "",
  ].join("\n");

  return { html, markdown };
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
