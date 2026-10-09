import { randomUUID } from "node:crypto";
import { redact } from "./redaction.js";

export interface EvidenceEvent {
  schemaVersion: "1.0";
  id: string;
  sequence: number;
  sessionId: string;
  segmentId: string;
  responseId?: string;
  toolId?: string;
  type: string;
  source: "provider" | "browser" | "server" | "researcher";
  timestamp: string;
  monotonicMs: number;
  clockId: string;
  completeness: "complete" | "partial" | "gap";
  payload: Record<string, unknown>;
}
export interface Measurement {
  definitionVersion: "1";
  name: "response_start_latency" | "tool_latency" | "approval_wait";
  value: number | null;
  unit: "ms";
  clockId: string | null;
  startEventId: string | null;
  endEventId: string | null;
  missingReason: string | null;
}
export function measuredInterval(
  name: Measurement["name"],
  start?: EvidenceEvent,
  end?: EvidenceEvent,
): Measurement {
  const base = {
    definitionVersion: "1" as const,
    name,
    unit: "ms" as const,
    startEventId: start?.id ?? null,
    endEventId: end?.id ?? null,
  };
  if (!start || !end)
    return {
      ...base,
      value: null,
      clockId: null,
      missingReason: "A necessary event is missing.",
    };
  if (start.clockId !== end.clockId || !start.clockId.startsWith("server-"))
    return {
      ...base,
      value: null,
      clockId: null,
      missingReason: "The events do not share one server monotonic clock.",
    };
  if (
    start.completeness !== "complete" ||
    end.completeness !== "complete" ||
    start.segmentId !== end.segmentId ||
    end.monotonicMs < start.monotonicMs
  )
    return {
      ...base,
      value: null,
      clockId: start.clockId,
      missingReason:
        "The event interval is incomplete, reordered, or crosses a reconnect.",
    };
  return {
    ...base,
    value: end.monotonicMs - start.monotonicMs,
    clockId: start.clockId,
    missingReason: null,
  };
}
export function createEvidenceEvent(
  input: Omit<EvidenceEvent, "schemaVersion" | "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
  secrets: readonly string[] = [],
): EvidenceEvent {
  return {
    ...input,
    schemaVersion: "1.0",
    id: input.id ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    payload: redact(input.payload, secrets),
  };
}
export function descriptiveStats(values: Array<number | null | undefined>): {
  count: number;
  missing: number;
  median: number | null;
  min: number | null;
  max: number | null;
} {
  const valid = values
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    )
    .sort((a, b) => a - b);
  const n = valid.length;
  return {
    count: n,
    missing: values.length - n,
    median: n
      ? n % 2
        ? valid[Math.floor(n / 2)]!
        : (valid[n / 2 - 1]! + valid[n / 2]!) / 2
      : null,
    min: n ? valid[0]! : null,
    max: n ? valid[n - 1]! : null,
  };
}
