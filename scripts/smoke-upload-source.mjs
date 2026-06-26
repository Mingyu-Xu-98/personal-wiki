import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempRoot = mkdtempSync(path.join(tmpdir(), "pwh-upload-smoke-"));
process.env.PWH_STUDIO_STATE_PATH = path.join(tempRoot, "state.json");
process.env.PWH_OBJECT_STORE_PATH = path.join(tempRoot, "objects");
process.env.PWH_INLINE_SOURCE_MAX_BYTES = "64";
process.env.PWH_SOURCE_EXCERPT_CHARS = "80";
delete process.env.DATABASE_URL;
delete process.env.PWH_STUDIO_STORE;
delete process.env.PWH_KNOWLEDGE_STORE;
delete process.env.PWH_WIKI_CURATOR_ENABLED;
delete process.env.PWH_SITE_AGENTS_ENABLED;

const { persistUploadedSourceFile } = await import("../apps/studio/lib/server/object-storage.ts");
const { addSource, createKnowledgeBase, getKnowledge } = await import("../apps/studio/lib/server/store.ts");

const userId = `upload_smoke_${Date.now()}`;
const base = createKnowledgeBase(userId, {
  name: "Upload Smoke Wiki",
  description: "Verifies uploaded source files are stored by reference with bounded wiki content."
});

const largeText = [
  "# Long Local Note",
  "",
  "This file should be persisted into object storage while only a bounded excerpt enters the wiki runtime.",
  "The source still needs enough text for deterministic extraction and later verification.",
  "A future reader can reopen the object key when direct evidence is needed."
].join("\n");

const prepared = persistUploadedSourceFile({
  userId,
  baseId: base.id,
  fileName: "long-local-note.md",
  mediaType: "text/markdown",
  bytes: Buffer.from(largeText, "utf8")
});

assert.equal(prepared.contentMode, "excerpt");
assert.ok(prepared.content.includes("内容已截断"));
assert.equal(prepared.metadata.truncated, true);

const objectKey = String(prepared.metadata.objectKey);
assert.ok(existsSync(path.join(process.env.PWH_OBJECT_STORE_PATH, ...objectKey.split("/"))));

await addSource({
  userId,
  baseId: base.id,
  title: prepared.title,
  content: prepared.content,
  uri: prepared.uri,
  mediaType: prepared.mediaType,
  contentHash: prepared.contentHash,
  contentMode: prepared.contentMode,
  byteSize: prepared.byteSize,
  metadata: prepared.metadata
});

const knowledge = getKnowledge(userId, base.id);
const source = knowledge.sources.find((entry) => entry.title === "long-local-note");
assert.ok(source);
assert.equal(source.contentMode, "excerpt");
assert.equal(source.metadata?.objectKey, objectKey);
assert.equal(source.byteSize, Buffer.byteLength(largeText, "utf8"));

console.log(
  JSON.stringify(
    {
      userId,
      knowledgeBaseId: base.id,
      objectKey,
      contentMode: source.contentMode,
      byteSize: source.byteSize,
      sourceCount: knowledge.sources.length
    },
    null,
    2
  )
);
