import WebSocket from "ws";
import OpenAI from "openai";
import { validateNamedSchema } from "./validation.js";
import {
  redactApiValue,
  ApiCredentialError,
  ApiIntentError,
} from "./runner.js";
import type { Credentials } from "./types.js";

export type StreamTarget =
  | {
      kind: "realtime";
      model?: string;
      callId?: string;
      intent?: "transcription";
    }
  | { kind: "live" }
  | {
      kind: "live-sideband" | "live-fork";
      sessionId: string;
      gracefulClose?: boolean;
    };
export const transportSources = {
  realtime:
    "https://raw.githubusercontent.com/openai/openai-node/master/src/realtime/internal-base.ts",
  live: "https://raw.githubusercontent.com/openai/openai-node/master/src/resources/live/internal-base.ts",
  "live-sideband":
    "https://raw.githubusercontent.com/openai/openai-node/master/src/resources/live/sideband/internal-base.ts",
  "live-fork":
    "https://raw.githubusercontent.com/openai/openai-node/master/src/resources/live/forks/internal-base.ts",
};
export function streamTargetUrl(target: StreamTarget): URL {
  const url = new URL("wss://api.openai.com/v1/");
  if (target.kind === "realtime") {
    if (
      [target.model, target.callId, target.intent].filter(Boolean).length !== 1
    )
      throw new Error(
        "Select exactly one model, call identifier, or transcription intent.",
      );
    url.pathname += "realtime";
    if (target.model) url.searchParams.set("model", target.model);
    if (target.callId) url.searchParams.set("call_id", target.callId);
    if (target.intent) url.searchParams.set("intent", target.intent);
  } else if (target.kind === "live") url.pathname += "live/sessions";
  else {
    if (!target.sessionId || !/^[A-Za-z0-9_-]+$/.test(target.sessionId))
      throw new Error("Invalid Live session identifier.");
    url.pathname += `live/sessions/${encodeURIComponent(target.sessionId)}/${target.kind === "live-fork" ? "fork" : "attach"}`;
    if (target.gracefulClose !== undefined)
      url.searchParams.set("graceful_close", String(target.gracefulClose));
  }
  return url;
}
const clientSchemas = {
  realtime: "RealtimeClientEvent",
  live: "LiveClientEvent",
  "live-sideband": "LiveSidebandClientEvent",
  "live-fork": "LiveForkClientEvent",
};
export interface StreamContext {
  credentials: Credentials;
  confirmed: boolean;
  signal?: AbortSignal;
  maxDurationMs?: number;
  onEvent(event: unknown): void;
  onError(error: string): void;
  onClose?(code: number): void;
  socketFactory?: (url: URL, headers: Record<string, string>) => WebSocket;
}
/** This lifecycle is independent of measured Sona voice sessions. No reconnect or action replay is automatic. */
export function openApiStream(target: StreamTarget, context: StreamContext) {
  if (!context.confirmed) throw new ApiIntentError();
  if (!context.credentials.project) throw new ApiCredentialError("project");
  const url = streamTargetUrl(target);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${context.credentials.project}`,
  };
  if (context.credentials.projectId)
    headers["OpenAI-Project"] = context.credentials.projectId;
  if (context.credentials.organizationId)
    headers["OpenAI-Organization"] = context.credentials.organizationId;
  const socket = context.socketFactory
    ? context.socketFactory(url, headers)
    : new WebSocket(url, {
        headers,
        followRedirects: false,
        handshakeTimeout: 15_000,
        maxPayload: 16 * 1024 * 1024,
      });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", close);
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    else socket.close(1000, "Sona API run ended");
  };
  const timer = setTimeout(
    close,
    Math.min(context.maxDurationMs ?? 120_000, 3_600_000),
  );
  context.signal?.addEventListener("abort", close, { once: true });
  if (context.signal?.aborted) close();
  socket.on("message", (data, binary) => {
    if (binary) {
      context.onEvent({
        type: "binary",
        base64: Buffer.from(data as Buffer).toString("base64"),
      });
      return;
    }
    try {
      context.onEvent(
        redactApiValue(JSON.parse(data.toString()), [
          context.credentials.project!,
        ]),
      );
    } catch {
      context.onError("The provider returned an invalid JSON event.");
    }
  });
  socket.on("error", () =>
    context.onError(
      "The API stream failed. Check access, network, and the selected model.",
    ),
  );
  socket.on("close", (code) => {
    closed = true;
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", close);
    context.onClose?.(code);
  });
  return {
    url: url.toString(),
    close,
    send(event: unknown) {
      if (closed || socket.readyState !== WebSocket.OPEN)
        throw new Error("The API stream is not open.");
      const result = validateNamedSchema(clientSchemas[target.kind], event);
      if (!result.valid)
        throw new Error(
          `Invalid stream event: ${result.issues
            .map((i) => `${i.location} ${i.message}`)
            .slice(0, 5)
            .join("; ")}`,
        );
      socket.send(JSON.stringify(event));
    },
  };
}
/** Signature verification precedes JSON parsing and reservation. The caller must persist reserved identifiers. */
export async function receiveWebhook(
  payload: string,
  headers: Record<string, string>,
  secret: string,
  reserveEventId: (id: string) => Promise<boolean>,
) {
  if (!secret)
    throw new Error("Configure a server-side webhook signing secret.");
  if (Buffer.byteLength(payload) > 4 * 1024 * 1024)
    throw new Error("Webhook payload is too large.");
  const client = new OpenAI({
    apiKey: "local-verification-only",
    webhookSecret: secret,
    maxRetries: 0,
  });
  const event = await client.webhooks.unwrap(payload, headers, secret, 300);
  const id = headers["webhook-id"];
  if (!id) throw new Error("The webhook identifier is missing.");
  const accepted = await reserveEventId(id);
  return {
    accepted,
    duplicate: !accepted,
    event: redactApiValue(event),
    callbackRequirement:
      "OpenAI must reach a separately configured HTTPS callback URL. Loopback is not a public endpoint.",
  };
}
