#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

process.env.PWH_BUILD_WORKER_MODE = "external";

// The worker shares the studio runtime's config (postgres stores/queue plus the
// site-agent model + token budget). Next.js loads apps/studio/.env.local for the
// web app, but this standalone process does not, so load it here. Existing
// process.env values win, so explicit shell overrides still apply.
function loadStudioEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "../apps/studio/.env.local");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

loadStudioEnv();

const once = process.argv.includes("--once");
const intervalMs = Number(process.env.PWH_WORKER_POLL_MS || 1500);
const { runBuildWorkerOnce } = await import("../apps/studio/lib/server/store.ts");

async function tick() {
  const result = await runBuildWorkerOnce();
  if (result.processed) {
    console.log(
      JSON.stringify({
        event: "job-processed",
        jobId: result.jobId,
        userId: result.userId,
        status: result.status,
        runId: result.runId,
        versionId: result.versionId
      })
    );
  }
  return result;
}

if (once) {
  await tick();
} else {
  console.log(`[worker] Personal Wiki Harness worker started. Polling every ${intervalMs}ms.`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error("[worker] Failed to process build job.", error instanceof Error ? error.message : String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
