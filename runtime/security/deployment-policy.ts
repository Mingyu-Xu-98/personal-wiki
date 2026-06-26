import type { HarnessRun } from "../../domain/index.js";
import type { Principal } from "./auth.js";

export interface DeploymentPolicyInput {
  principal: Principal;
  run: HarnessRun;
  environment: "preview" | "production";
  approvalStatuses?: Array<"pending" | "approved" | "rejected">;
}

export interface DeploymentPolicyDecision {
  decision: "allow" | "deny" | "review";
  reason: string;
}

export function evaluateDeploymentPolicy(input: DeploymentPolicyInput): DeploymentPolicyDecision {
  const latest = input.run.versions.at(-1);
  if (!latest) return { decision: "deny", reason: "run has no build version" };
  if (latest.validationStatus !== "passed") return { decision: "deny", reason: "latest version did not pass validation" };
  if (input.run.status !== "completed") return { decision: "deny", reason: "run is not completed" };

  const hasApprovedGate = input.approvalStatuses?.includes("approved")
    ?? input.run.toolTrace.some((tool) => tool.name === "request_approval" && tool.status === "ok");
  if (!hasApprovedGate) return { decision: "review", reason: "deployment requires an approved checkpoint" };

  if (input.environment === "preview") {
    if (input.principal.role === "viewer") return { decision: "deny", reason: "viewer cannot deploy preview artifacts" };
    return { decision: "allow", reason: "preview deployment allowed for builder/admin after validation" };
  }

  if (input.principal.role === "admin" || input.principal.scopes.includes("deploy:production") || input.principal.scopes.includes("*")) {
    return { decision: "allow", reason: "production deployment allowed by admin role or deploy:production scope" };
  }

  return { decision: "review", reason: "production deployment requires admin or deploy:production scope" };
}
