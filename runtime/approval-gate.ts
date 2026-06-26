import type { ApprovalRequest } from "./types.js";

export class ApprovalGate {
  private readonly approvals: ApprovalRequest[] = [];

  request(input: {
    runId: string;
    reason: string;
    artifactPath?: string;
    autoApprove?: boolean;
  }): ApprovalRequest {
    const now = new Date().toISOString();
    const approval: ApprovalRequest = {
      id: crypto.randomUUID(),
      runId: input.runId,
      reason: input.reason,
      artifactPath: input.artifactPath,
      requestedAt: now,
      resolvedAt: input.autoApprove ? now : undefined,
      status: input.autoApprove ? "approved" : "pending",
    };
    this.approvals.push(approval);
    return approval;
  }

  all(): ApprovalRequest[] {
    return [...this.approvals];
  }
}
