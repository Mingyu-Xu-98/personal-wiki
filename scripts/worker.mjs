#!/usr/bin/env node

process.env.PWH_BUILD_WORKER_MODE = "external";

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
