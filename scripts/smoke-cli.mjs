import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const workspace = mkdtempSync(path.join(tmpdir(), "pwh-cli-smoke-"));
const notePath = path.join(workspace, "notes.md");
writeFileSync(
  notePath,
  [
    "# Personal Wiki Harness CLI Smoke",
    "",
    "Mingyu builds personal wiki driven websites.",
    "The local CLI should ingest files, query the generated wiki, lint the workspace, build HTML, and export it."
  ].join("\n"),
  "utf8"
);

const cli = path.resolve("apps/cli/bin/pwh.mjs");
const run = (...args) =>
  execFileSync("node", [cli, ...args, "--workspace", workspace], {
    encoding: "utf8",
    env: {
      ...process.env,
      PWH_SITE_AGENTS_ENABLED: "",
      PWH_WIKI_CURATOR_ENABLED: ""
    }
  });

run("init");
run("ingest", notePath);
const query = run("query", "wiki websites");
assert.match(query, /Pages|Sources/);
run("lint");
run("build", "--title", "CLI Smoke Site", "--prompt", "Build a compact personal website from the local wiki.");
const exportOutput = run("export");
assert.match(exportOutput, /Exported static site/);
assert.ok(existsSync(path.join(workspace, ".pwh", "dist", "index.html")));
assert.ok(existsSync(path.join(workspace, ".pwh", "export", "index.html")));

console.log(
  JSON.stringify(
    {
      workspace,
      dist: path.join(workspace, ".pwh", "dist", "index.html"),
      export: path.join(workspace, ".pwh", "export", "index.html")
    },
    null,
    2
  )
);
