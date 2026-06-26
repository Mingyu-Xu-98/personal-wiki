import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";

const stateDir = await mkdtemp("/private/tmp/pwh-studio-smoke-");
process.env.PWH_STUDIO_STATE_PATH = path.join(stateDir, "state.json");
process.env.PWH_PUBLISHED_SITE_PATH = path.join(stateDir, "published-sites");
delete process.env.PWH_WIKI_CURATOR_ENABLED;
delete process.env.PWH_SITE_AGENTS_ENABLED;

const {
  addSource,
  createKnowledgeBase,
  createRun,
  getKnowledge,
  getKnowledgeBaseContext,
  getRuns,
  getSiteState,
  publishRunToSite
} = await import("../apps/studio/lib/server/store.ts");

const userA = `studio_smoke_${Date.now()}_a`;
const userB = `studio_smoke_${Date.now()}_b`;

const base = createKnowledgeBase(userA, {
  name: "Smoke Test Wiki",
  description: "A private wiki used to verify the Studio create and publish flow."
});

await addSource({
  userId: userA,
  baseId: base.id,
  title: "Personal Site Notes",
  content:
    "Mingyu builds AI knowledge products, writes about personal wikis, and wants a calm public website for collaborators."
});

const knowledge = getKnowledge(userA, base.id);
assert.equal(knowledge.activeBase.id, base.id);
assert.ok(knowledge.sources.some((source) => source.title === "Personal Site Notes"));
assert.ok(knowledge.entities.length > 0);

const context = getKnowledgeBaseContext(userA, base.id);
assert.equal(context.id, base.id);
assert.match(context.wikiIndex, /Personal Site Notes|个人|Smoke Test Wiki/);

const isolatedKnowledge = getKnowledge(userB);
assert.ok(!isolatedKnowledge.bases.some((candidate) => candidate.id === base.id));

const firstRun = await createRun(userA, {
  title: "Smoke Personal Site",
  prompt: "Create a calm personal website for collaborators using only the selected wiki.",
  audience: "collaborators",
  desiredArtifact: "site",
  knowledgeBaseId: base.id,
  knowledgeBaseName: base.name,
  constraints: ["Use only the selected knowledge base."]
});
assert.equal(firstRun.state, "versioned");
assert.ok(firstRun.buildVersion?.id);
assertRunContextIntegrity(firstRun);

const firstPublication = publishRunToSite(userA, firstRun.id);
assert.equal(firstPublication.versionNumber, 1);
assert.equal(firstPublication.versionId, firstRun.buildVersion?.id);
assert.equal(firstPublication.parentVersionId, null);
assert.ok(firstPublication.deployment?.url.includes(firstPublication.id));
assert.ok(existsSync(path.join(firstPublication.deployment.artifactPath, "index.html")));

const secondRun = await createRun(userA, {
  title: "Smoke Personal Site",
  prompt: "Revise the site to make the home page more concise and editorial.",
  audience: "collaborators",
  desiredArtifact: "site",
  knowledgeBaseId: base.id,
  knowledgeBaseName: base.name,
  baseRunId: firstRun.id,
  baseVersionId: firstPublication.versionId,
  revisionReason: "Make the home page more concise and editorial.",
  constraints: ["Preserve the selected knowledge base boundary."]
});
assert.equal(secondRun.state, "versioned");
assert.equal(secondRun.buildVersion?.parentVersionId, firstPublication.versionId);
assert.equal(secondRun.buildVersion?.changeSummary, "Make the home page more concise and editorial.");
assertRunContextIntegrity(secondRun);
assert.equal(secondRun.buildVersion?.runContextManifest?.baseVersionId, firstPublication.versionId);

const secondPublication = publishRunToSite(userA, secondRun.id);
assert.equal(secondPublication.versionNumber, 2);
assert.equal(secondPublication.parentVersionId, firstPublication.versionId);
assert.equal(secondPublication.changeSummary, "Make the home page more concise and editorial.");
assert.ok(existsSync(path.join(secondPublication.deployment.artifactPath, "index.html")));

const siteState = getSiteState(userA);
assert.equal(siteState.latest?.id, secondPublication.versionId);
assert.equal(siteState.publishedVersions.length, 2);
assert.equal(siteState.runs.length, 2);
assert.equal(getRuns(userA).length, 2);

const isolatedSiteState = getSiteState(userB);
assert.equal(isolatedSiteState.publishedVersions.length, 0);
assert.equal(isolatedSiteState.runs.length, 0);

assert.ok(existsSync(process.env.PWH_STUDIO_STATE_PATH));
const persisted = JSON.parse(await readFile(process.env.PWH_STUDIO_STATE_PATH, "utf8"));
assert.ok(persisted.users[userA]);
assert.ok(persisted.users[userB]);
assert.equal(persisted.users[userA].publishedSiteVersions.length, 2);

console.log(
  JSON.stringify(
    {
      stateDir,
      knowledgeBaseId: base.id,
      firstVersionId: firstPublication.versionId,
      secondVersionId: secondPublication.versionId,
      manifestId: secondRun.contextLedger?.runContextManifest.id,
      userAPublishedVersions: siteState.publishedVersions.length,
      userBPublishedVersions: isolatedSiteState.publishedVersions.length
    },
    null,
    2
  )
);

function assertRunContextIntegrity(run) {
  const manifest = run.contextLedger?.runContextManifest;
  assert.ok(manifest?.id);
  assert.ok(manifest.requiredCarryForwardRefs.includes(`run-context-manifest:${manifest.id}`));
  assert.ok(manifest.requiredCarryForwardRefs.includes(`wiki-snapshot:${manifest.wikiSnapshotId}`));
  assert.ok(manifest.requiredCarryForwardRefs.includes(`design-system:${manifest.designSystemId}`));
  assert.ok(run.buildVersion?.runContextManifest?.id === manifest.id);
  assert.ok((run.observabilityEvents?.length ?? 0) > 0);
  assert.ok(run.observabilityEvents?.some((event) => event.type === "version.created"));
  assert.ok(run.observabilityEvents?.some((event) => event.type === "verification.completed"));
  assert.equal(run.buildVersion?.lintIssues.filter((issue) => issue.code === "missing-carry-forward-ref").length, 0);
  assert.equal(run.buildVersion?.lintIssues.filter((issue) => issue.code === "missing-shared-context-input").length, 0);

  for (const trace of run.subAgentTraces ?? []) {
    const inputKinds = new Set(trace.packet.inputs.map((input) => input.kind));
    assert.ok(inputKinds.has("run-context-manifest"));
    assert.ok(inputKinds.has("design-system"));
    assert.ok(inputKinds.has("component-registry"));
    assert.ok(inputKinds.has("tool-registry"));
    assert.ok(inputKinds.has("style-guide"));
    for (const ref of trace.packet.requiredCarryForwardRefs ?? []) {
      assert.ok(trace.result?.mustCarryForwardRefs.includes(ref), `${trace.role} dropped ${ref}`);
    }
  }
}
