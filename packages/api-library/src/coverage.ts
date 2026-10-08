import {
  listOperations,
  getTransportSchemas,
  getWebhookSchemas,
  sourceRevision,
  sourceProvenance,
} from "./catalog.js";
import { compileAllOperationSchemas } from "./validation.js";
export interface LiveVerification {
  operationId: string;
  result: "passed" | "failed" | "blocked";
  timestamp: string;
  evidence?: string;
  requestId?: string;
  reason?: string;
}
export function coverageReport(live: LiveVerification[] = [], compile = true) {
  const schemas = compile
    ? new Map(
        compileAllOperationSchemas().map((item) => [item.operationId, item]),
      )
    : new Map();
  const operations = listOperations().map((op) => ({
    operationId: op.id,
    family: op.family,
    method: op.method,
    path: op.path,
    source: op.source,
    sourceRevision,
    catalog: "implemented",
    editing: "lossless-json-and-schema-fields",
    validation: compile
      ? schemas.get(op.id)?.valid
        ? "schema-compiled"
        : "failed"
      : "not-run",
    validationError: schemas.get(op.id)?.error,
    execution: "implemented",
    handlers: op.handlers,
    credentialClass: op.credentialClass,
    accountAccess: "unverified",
    lifecycle: op.lifecycle,
    lifecycleVerification: "unverified: official lifecycle website unavailable",
    live: live.filter((item) => item.operationId === op.id),
    liveVerification: live.some(
      (item) => item.operationId === op.id && item.result === "passed",
    )
      ? "service-test-passed"
      : "verification-needed",
  }));
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    sourceRevision,
    provenance: sourceProvenance,
    denominator: {
      operations: operations.length,
      paths: new Set(operations.map((o) => o.path)).size,
      families: new Set(operations.map((o) => o.family)).size,
      transportEventUnions: getTransportSchemas().length,
      webhookEvents: Object.keys(getWebhookSchemas()).length,
    },
    summary: {
      cataloged: operations.length,
      schemaCompiled: operations.filter(
        (o) => o.validation === "schema-compiled",
      ).length,
      implementedHandlers: operations.filter(
        (o) => o.execution === "implemented",
      ).length,
      livePassed: operations.filter(
        (o) => o.liveVerification === "service-test-passed",
      ).length,
      schemaFailures: operations.filter((o) => o.validation === "failed")
        .length,
    },
    transport: [
      "Realtime WebSocket",
      "Realtime WebRTC SDP request",
      "Live primary WebSocket",
      "Live sideband WebSocket",
      "Live fork WebSocket",
      "Live WebRTC SDP request",
      "SSE",
      "multipart",
      "binary",
      "pagination",
      "polling",
      "cancellation",
      "signed webhook callback",
    ].map((handler) => ({
      handler,
      implementation: "implemented",
      liveVerification: "verification-needed",
    })),
    limits: [
      "The source snapshot is not proof of account access or current lifecycle status.",
      "No paid API call runs during catalog or coverage generation.",
      "Webhooks need a reachable HTTPS endpoint; Sona does not publish one.",
      "Schema descriptions contain provider and model rules that cannot all be expressed in JSON Schema. The UI preserves those source conditions; provider acceptance remains separate from observed behavior.",
    ],
    operations,
  };
}
