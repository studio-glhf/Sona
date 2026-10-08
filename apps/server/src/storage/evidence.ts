import { createHash } from "node:crypto";
import type { Distribution, Document, EvidenceEvent, Metric } from "./types.js";

const sensitiveKeys =
  /^(authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|password|secret|private[-_]?key)$/i;
export function redact<T>(value: T): T {
  if (typeof value === "string")
    return value
      .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
      .replace(
        /\b(?:sk-[A-Za-z0-9_-]{12,}|ek_[A-Za-z0-9_-]{12,})/g,
        "[REDACTED]",
      )
      .replace(
        /([?&](?:access_token|refresh_token|api_key|key|token|client_secret|code)=)[^&#\s]+/gi,
        "$1[REDACTED]",
      ) as T;
  if (Array.isArray(value)) return value.map(redact) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKeys.test(key) ? "[REDACTED]" : redact(item),
      ]),
    ) as T;
  return value;
}
export function canonical(value: unknown): string {
  if (value === undefined) throw new Error("Undefined is not a JSON value.");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonical((value as Document)[key])}`,
    )
    .join(",")}}`;
}
export const hash = (value: unknown): string =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function assertSafeConfiguration(value: Document): void {
  if (canonical(value) !== canonical(redact(value)))
    throw new Error(
      "Configuration contains a credential. Use a server-side credential reference.",
    );
}
export function diffValues(
  before: unknown,
  after: unknown,
  path = "",
): { path: string; before: unknown; after: unknown }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) =>
        diffValues(
          (before as Document)[key],
          (after as Document)[key],
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        ),
      );
  }
  return [{ path: path || "/", before: before ?? null, after: after ?? null }];
}
export function csvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : typeof value === "object"
        ? canonical(value)
        : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csv(rows: Document[], headers?: string[]): string {
  const columns = headers ?? [
    ...new Set(rows.flatMap((row) => Object.keys(row))),
  ];
  return (
    [
      columns.map(csvCell).join(","),
      ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[center]!
    : (sorted[center - 1]! + sorted[center]!) / 2;
}
export function distribution(
  values: Distribution["values"],
  total: number,
): Distribution {
  const valid = values.filter((item) => Number.isFinite(item.value));
  return {
    count: valid.length,
    missing: Math.max(0, total - valid.length),
    median: median(valid.map((item) => item.value)),
    min: valid.length ? Math.min(...valid.map((item) => item.value)) : null,
    max: valid.length ? Math.max(...valid.map((item) => item.value)) : null,
    values: valid,
  };
}

// These are receipt intervals on one server monotonic clock. They are not acoustic latency.
export function measureEvents(
  sessionId: string,
  input: EvidenceEvent[],
): Metric[] {
  const events = [...input].sort((a, b) => a.sequence - b.sequence);
  const metrics: Metric[] = [];
  let speechStop: EvidenceEvent | undefined;
  const toolStarts = new Map<string, EvidenceEvent>();
  const approvals = new Map<string, EvidenceEvent>();
  const audioResponses = new Set<string>();
  let toolsSinceStop = false;
  const interval = (
    name: Metric["name"],
    start: EvidenceEvent | undefined,
    end: EvidenceEvent,
    extra: Partial<Metric> = {},
  ): void => {
    let reason: string | undefined;
    if (!start) reason = "Start event missing";
    else if (start.clock !== end.clock) reason = "Events use different clocks";
    else if (start.segmentId !== end.segmentId)
      reason = "Events belong to different connection segments";
    else if (
      start.completeness !== "complete" ||
      end.completeness !== "complete"
    )
      reason = "Incomplete source event";
    else if (
      events.some(
        (event) =>
          event.sequence > start.sequence &&
          event.sequence < end.sequence &&
          event.completeness === "gap",
      )
    )
      reason = "Evidence gap within the interval";
    else if (start.monotonicMs > end.monotonicMs)
      reason = "Event order is invalid";
    else if (start.source === "browser" || end.source === "browser")
      reason = "Browser relay is not a server provider-event measurement";
    metrics.push({
      id: `${name}:${end.id}`,
      sessionId,
      name,
      definitionVersion: "1",
      value: reason ? null : end.monotonicMs - start!.monotonicMs,
      unit: "ms",
      ...(start ? { startEventId: start.id } : {}),
      endEventId: end.id,
      clock: end.clock,
      ...(reason ? { missingReason: reason } : {}),
      toolActive: toolsSinceStop,
      source: "server monotonic receipt",
      ...extra,
    });
  };
  for (const event of events) {
    if (
      ["input_audio_buffer.speech_stopped", "speech.stopped"].includes(
        event.type,
      )
    ) {
      speechStop = event;
      toolsSinceStop = false;
    }
    if (
      [
        "output_audio_buffer.started",
        "audio.stream.started",
        "response.output_audio.delta",
        "response.audio.delta",
      ].includes(event.type)
    ) {
      const key = event.responseId ?? event.id;
      if (!audioResponses.has(key)) {
        interval("response-start-latency", speechStop, event, {
          responseId: event.responseId,
        });
        audioResponses.add(key);
        speechStop = undefined;
      }
    }
    const toolKey = String(event.payload.operationId ?? event.toolId ?? "");
    if (["tool.dispatch", "tool.dispatched"].includes(event.type)) {
      toolStarts.set(toolKey, event);
      toolsSinceStop = true;
    }
    if (["tool.result", "tool.error", "tool.unknown"].includes(event.type)) {
      interval("tool-latency", toolStarts.get(toolKey), event, {
        toolId: event.toolId,
      });
      toolStarts.delete(toolKey);
    }
    if (event.type === "proposal.delivered")
      approvals.set(String(event.payload.proposalId ?? toolKey), event);
    if (["proposal.approved", "proposal.rejected"].includes(event.type)) {
      const key = String(event.payload.proposalId ?? toolKey);
      interval("approval-wait", approvals.get(key), event);
      approvals.delete(key);
    }
    if (
      [
        "response.output_audio_transcript.done",
        "response.audio_transcript.done",
        "transcript.generated.final",
      ].includes(event.type)
    ) {
      const transcript = event.payload.transcript ?? event.payload.text;
      metrics.push({
        id: `response-length:${event.id}`,
        sessionId,
        responseId: event.responseId,
        name: "response-length",
        definitionVersion: "1",
        value: typeof transcript === "string" ? [...transcript].length : null,
        unit: "characters",
        endEventId: event.id,
        clock: event.clock,
        toolActive: toolsSinceStop,
        source: "generated transcript; may include unheard speech",
        ...(typeof transcript === "string"
          ? {}
          : { missingReason: "Generated transcript missing" }),
      });
    }
  }
  return metrics;
}
