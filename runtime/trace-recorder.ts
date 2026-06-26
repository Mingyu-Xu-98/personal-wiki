import type { TraceSpan } from "./types.js";

export class TraceRecorder {
  private readonly spans: TraceSpan[];

  constructor(initialSpans: TraceSpan[] = []) {
    this.spans = [...initialSpans];
  }

  start(name: string, input?: unknown, parentId?: string): TraceSpan {
    const span: TraceSpan = {
      id: crypto.randomUUID(),
      parentId,
      name,
      input,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    this.spans.push(span);
    return span;
  }

  end(span: TraceSpan, output?: unknown): void {
    span.output = output;
    span.finishedAt = new Date().toISOString();
    span.status = "ok";
  }

  error(span: TraceSpan, output?: unknown): void {
    span.output = output;
    span.finishedAt = new Date().toISOString();
    span.status = "error";
  }

  all(): TraceSpan[] {
    return [...this.spans];
  }
}
