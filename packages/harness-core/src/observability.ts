import type { HarnessObservationEvent, HarnessObserver } from "./types.ts";

export type InMemoryHarnessObserver = HarnessObserver & {
  list(): HarnessObservationEvent[];
  clear(): void;
};

export const createInMemoryHarnessObserver = (): InMemoryHarnessObserver => {
  const events: HarnessObservationEvent[] = [];
  return {
    record(event) {
      events.push(structuredClone(event));
    },
    list() {
      return structuredClone(events);
    },
    clear() {
      events.length = 0;
    }
  };
};

export const summarizeObservationValue = (value: unknown, maxChars = 600): string => {
  if (value === undefined) return "";
  if (value === null) return "null";
  const text = typeof value === "string" ? value : safeStringify(value);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
};

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
