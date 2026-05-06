import { HarnessOrchestrator } from "./index.ts";

const harness = new HarnessOrchestrator();

const run = await harness.run({
  title: "Personal Wiki Harness",
  prompt: "Compile a personal wiki into a coherent website artifact.",
  audience: "self",
  desiredArtifact: "site",
  constraints: [
    "Treat raw sources as immutable.",
    "Treat the wiki as the source of meaning.",
    "Record plan, verification, and version state."
  ]
});

console.log(JSON.stringify(run, null, 2));
