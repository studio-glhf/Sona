import { getOperation } from "./catalog.js";
import { assertRecipe } from "./validation.js";
import { buildRequest } from "./serialization.js";
import type {
  ApiExecutionContext,
  ApiRecipe,
  ApiRunResult,
  ApiStreamEvent,
  JsonValue,
} from "./types.js";

export function redactApiValue(value: any, secrets: string[] = []): any {
  if (typeof value === "string") {
    let result = value.replace(
      /\b(?:sk-(?:proj-|admin-)?[A-Za-z0-9_-]{12,}|ek_[A-Za-z0-9_-]{12,})\b/g,
      "[REDACTED]",
    );
    for (const secret of secrets.filter((s) => s.length > 3))
      result = result.split(secret).join("[REDACTED]");
    return result;
  }
  if (Array.isArray(value))
    return value.map((item) => redactApiValue(item, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(authorization|cookie|set-cookie|api_key|apiKey|access_token|refresh_token|client_secret|secret|password|token|key)$/i.test(
          key,
        )
          ? "[REDACTED]"
          : redactApiValue(item, secrets),
      ]),
    );
  return value;
}
export class ApiIntentError extends Error {
  constructor() {
    super(
      "Confirm this specific API operation before execution. It can change data or incur charges.",
    );
    this.name = "ApiIntentError";
  }
}
export class ApiCredentialError extends Error {
  constructor(kind: string) {
    super(`Configure the server-side ${kind} OpenAI credential binding.`);
    this.name = "ApiCredentialError";
  }
}
export async function* parseEventStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes = 32 * 1024 * 1024,
): AsyncGenerator<ApiStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let bytes = 0;
  let event = "";
  let id: string | undefined;
  let data: string[] = [];
  const dispatch = (): ApiStreamEvent | undefined => {
    if (!data.length) {
      event = "";
      return undefined;
    }
    const joined = data.join("\n");
    let parsed: any = joined;
    try {
      parsed = JSON.parse(joined);
    } catch {
      /* SSE permits plain text */
    }
    const result: ApiStreamEvent = {
      kind: "event",
      ...(event ? { event } : {}),
      ...(id !== undefined ? { id } : {}),
      data: parsed,
    };
    data = [];
    event = "";
    return result;
  };
  const line = (value: string): ApiStreamEvent | undefined => {
    if (!value) return dispatch();
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    let v = colon < 0 ? "" : value.slice(colon + 1);
    if (v.startsWith(" ")) v = v.slice(1);
    if (field === "event") event = v;
    else if (field === "data") data.push(v);
    else if (field === "id" && !v.includes("\0")) id = v;
    return undefined;
  };
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes)
        throw new Error("API stream exceeds the configured byte limit.");
      pending += decoder.decode(result.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const l = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        const item = line(l);
        if (item) yield item;
      }
    }
    pending += decoder.decode();
    if (pending) {
      const item = line(pending.replace(/\r$/, ""));
      if (item) yield item;
    }
    const last = dispatch();
    if (last) yield last;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
async function readBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > limit)
        throw new Error("API result exceeds the configured byte limit.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let position = 0;
  for (const part of chunks) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}
export async function executeRecipe(
  recipe: ApiRecipe,
  context: ApiExecutionContext,
): Promise<ApiRunResult> {
  assertRecipe(recipe);
  const op = getOperation(recipe.operationId);
  if (
    op.requiresIntent &&
    (!recipe.intent?.confirmed || recipe.intent.operationId !== op.id)
  )
    throw new ApiIntentError();
  const credential = context.credentials[op.credentialClass];
  if (!credential) throw new ApiCredentialError(op.credentialClass);
  const { url, init } = buildRequest(op, recipe);
  const headers = init.headers;
  headers.set("Authorization", `Bearer ${credential}`);
  if (op.credentialClass === "project" && context.credentials.projectId)
    headers.set("OpenAI-Project", context.credentials.projectId);
  if (context.credentials.organizationId)
    headers.set("OpenAI-Organization", context.credentials.organizationId);
  const timeout = AbortSignal.timeout(
    Math.min(context.timeoutMs ?? 120_000, 600_000),
  );
  const signal = context.signal
    ? AbortSignal.any([context.signal, timeout])
    : timeout;
  const start = performance.now();
  const response = await (context.fetch ?? fetch)(url, { ...init, signal });
  const secrets = [
    context.credentials.project,
    context.credentials.admin,
  ].filter((v): v is string => !!v);
  const clean = (value: any) => redactApiValue(value, secrets);
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() ??
    "application/octet-stream";
  const responseHeaders: Record<string, string> = {};
  for (const name of [
    "x-request-id",
    "openai-processing-ms",
    "retry-after",
    "location",
    "content-type",
    "content-length",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-remaining-tokens",
  ]) {
    const value = response.headers.get(name);
    if (value !== null) responseHeaders[name] = clean(value);
  }
  const base = {
    operationId: op.id,
    status: response.status,
    ok: response.ok,
    contentType,
    requestId: responseHeaders["x-request-id"],
    headers: responseHeaders,
    acceptance: response.ok ? ("accepted" as const) : ("rejected" as const),
    applied: "not-returned" as const,
    verification: context.fixture
      ? ("contract-fixture" as const)
      : ("live-service" as const),
  };
  const limit = context.maxResponseBytes ?? 32 * 1024 * 1024;
  if (contentType === "text/event-stream" && response.body) {
    const events: ApiStreamEvent[] = [];
    for await (const event of parseEventStream(response.body, limit)) {
      const safe = clean(event);
      if (events.length >= (context.maxStoredEvents ?? 20_000))
        throw new Error("API event limit reached. The stream was stopped.");
      events.push(safe);
      await context.onEvent?.(safe);
    }
    return { ...base, events, elapsedMs: performance.now() - start };
  }
  const bytes = await readBytes(response, limit);
  if (
    /^(?:application\/(?:[^;]+\+)?json|text\/|application\/sdp)/.test(
      contentType,
    )
  ) {
    const text = new TextDecoder().decode(bytes);
    let body: JsonValue | string = text;
    if (contentType.includes("json")) {
      try {
        body = JSON.parse(text);
      } catch {
        /* expose malformed provider JSON as text, not a success fixture */
      }
    }
    return { ...base, body: clean(body), elapsedMs: performance.now() - start };
  }
  return {
    ...base,
    binary: { data: bytes, mediaType: contentType },
    elapsedMs: performance.now() - start,
  };
}
export async function* paginateRecipe(
  recipe: ApiRecipe,
  context: ApiExecutionContext,
  maxPages = 100,
): AsyncGenerator<ApiRunResult> {
  const op = getOperation(recipe.operationId);
  if (op.method !== "GET")
    throw new Error("Automatic pagination is limited to read operations.");
  let next = structuredClone(recipe);
  const cursors = new Set<string>();
  for (let page = 0; page < Math.min(maxPages, 1000); page++) {
    const result = await executeRecipe(next, context);
    yield result;
    if (!result.ok) return;
    const data = result.body as Record<string, any> | undefined;
    if (!data || typeof data !== "object") return;
    const nextValue =
      data.next_page ??
      data.next_page_token ??
      data.next_cursor ??
      (data.has_more ? (data.last_id ?? data.data?.at(-1)?.id) : undefined);
    if (!nextValue || data.has_more === false) return;
    const name = ["after", "page", "page_token", "cursor"].find((n) =>
      op.parameters.some((p) => p.in === "query" && p.name === n),
    );
    if (!name)
      throw new Error("The source does not define a cursor for the next page.");
    const cursor = String(nextValue);
    if (cursors.has(cursor))
      throw new Error("The provider repeated a pagination cursor.");
    cursors.add(cursor);
    next = { ...recipe, query: { ...recipe.query, [name]: cursor } };
  }
  // A selected page limit is a deliberate bound. The caller reports truncation separately.
  return;
}
export async function pollRecipe(
  recipe: ApiRecipe,
  context: ApiExecutionContext,
  options: {
    terminalStates?: string[];
    intervalMs?: number;
    maxPolls?: number;
    onPoll?: (result: ApiRunResult) => void;
  } = {},
): Promise<ApiRunResult> {
  if (getOperation(recipe.operationId).method !== "GET")
    throw new Error("Polling is limited to read operations.");
  const terminal = options.terminalStates ?? [
    "completed",
    "succeeded",
    "failed",
    "cancelled",
    "canceled",
    "expired",
    "incomplete",
  ];
  for (
    let attempt = 0;
    attempt < Math.min(options.maxPolls ?? 30, 300);
    attempt++
  ) {
    context.signal?.throwIfAborted();
    const result = await executeRecipe(recipe, context);
    options.onPoll?.(result);
    if (!result.ok || terminal.includes(String((result.body as any)?.status)))
      return result;
    const wait = Math.min(Math.max(options.intervalMs ?? 1000, 10), 60_000);
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(context.signal?.reason ?? new Error("Polling canceled."));
      };
      const timer = setTimeout(() => {
        context.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, wait);
      context.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  throw new Error("The configured polling limit was reached.");
}
