#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const port = process.env.PWH_STUDIO_PORT || "3006";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listPidsOnPort() {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return [...new Set(output.split(/\s+/).filter(Boolean))];
  } catch {
    return [];
  }
}

function killPid(pid, signal) {
  try {
    process.kill(Number(pid), signal);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[restart:studio] Could not ${signal} PID ${pid}: ${message}`);
    return false;
  }
}

function readDotEnvLocal() {
  if (!existsSync(".env.local")) return {};
  const env = {};
  for (const rawLine of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) env[key] = value;
  }
  return env;
}

async function freePort() {
  const pids = listPidsOnPort();
  if (!pids.length) {
    console.log(`[restart:studio] Port ${port} is free.`);
    return;
  }

  console.log(`[restart:studio] Stopping existing process on ${port}: ${pids.join(", ")}`);
  pids.forEach((pid) => killPid(pid, "SIGTERM"));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(150);
    if (!listPidsOnPort().length) return;
  }

  const stubbornPids = listPidsOnPort();
  if (stubbornPids.length) {
    console.log(`[restart:studio] Force stopping: ${stubbornPids.join(", ")}`);
    stubbornPids.forEach((pid) => killPid(pid, "SIGKILL"));
  }

  await sleep(250);
  const remaining = listPidsOnPort();
  if (remaining.length) {
    throw new Error(
      `Port ${port} is still occupied by ${remaining.join(", ")}. Run this command in the terminal that owns the dev server, or kill those PIDs manually.`
    );
  }
}

await freePort();

console.log(`[restart:studio] Starting Studio at http://127.0.0.1:${port}`);
const localEnv = readDotEnvLocal();
const child = spawn("npm", ["run", "dev", "-w", "@personal-wiki-harness/studio"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...localEnv,
    PWH_STUDIO_PORT: port
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
