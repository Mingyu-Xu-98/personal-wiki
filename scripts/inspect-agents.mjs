import path from "node:path";
import { listFileSystemAgentIds, loadFileSystemAgent } from "@personal-wiki-harness/agent-runtime";

const agentsRoot = path.resolve("agents");
const ids = await listFileSystemAgentIds(agentsRoot);
const agents = [];

for (const id of ids) {
  const agent = await loadFileSystemAgent(path.join(agentsRoot, id));
  agents.push({
    id: agent.definition.id,
    model: agent.definition.model,
    tools: agent.localTools,
    skills: agent.localSkills,
    evals: agent.localEvals,
    issues: agent.validationIssues
  });
}

const issueCount = agents.reduce((sum, agent) => sum + agent.issues.length, 0);
console.log(JSON.stringify({ agentsRoot, count: agents.length, issueCount, agents }, null, 2));

if (agents.some((agent) => agent.issues.some((issue) => issue.severity === "error"))) {
  process.exit(1);
}
