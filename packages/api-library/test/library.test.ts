import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  listOperations,
  getOperation,
  getOperationSchema,
  describeParameters,
  sourceRevision,
  getNamedSchema,
  openapiDocument,
  validateRecipe,
  validateSchema,
  compileAllOperationSchemas,
  buildRequest,
  executeRecipe,
  parseEventStream,
  paginateRecipe,
  pollRecipe,
  streamTargetUrl,
  openApiStream,
  receiveWebhook,
  redactApiValue,
} from "../src/index.js";
const fixture = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_fixture",
    },
  });
const context = {
  credentials: {
    project: "secret-project-canary",
    admin: "secret-admin-canary",
  },
  fixture: true,
};
const intent = (operationId: string) => ({ confirmed: true, operationId });
const operation = (path: string, method: string) =>
  listOperations().find((o) => o.path === path && o.method === method)!;

describe("official source coverage and lossless validation", () => {
  it("accounts for each operation and compiles all request schemas", () => {
    const operations = listOperations();
    const schemas = compileAllOperationSchemas();
    const sourceCount = Object.values(openapiDocument.paths)
      .flatMap((path: any) => Object.values(path))
      .filter((op: any) => op.operationId).length;
    expect(operations.length).toBe(sourceCount);
    expect(new Set(operations.map((o) => o.id)).size).toBe(operations.length);
    expect(schemas).toHaveLength(operations.length);
    expect(schemas.filter((s) => !s.valid)).toEqual([]);
    expect(sourceRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(operations.map((o) => o.family)).size).toBe(31);
  });
  it("returns original reachable refs and documented defaults without applying them", () => {
    const source = getOperationSchema("createResponse");
    expect(source.components.schemas.CreateResponse).toBeDefined();
    const body = { model: "gpt-6-astra", input: "Hello" };
    const recipe = { operationId: "createResponse", body };
    expect(validateRecipe(recipe).valid).toBe(true);
    expect(body).toEqual({ model: "gpt-6-astra", input: "Hello" });
    expect(
      describeParameters("createResponse").some((p) =>
        p.pointer.includes("/model"),
      ),
    ).toBe(true);
  });
  it("preserves null vs omission and validates nested unions/enums/constraints", () => {
    const schema = {
      type: "object",
      properties: {
        v: {
          anyOf: [
            { type: "number", minimum: 0.25, maximum: 1.5 },
            { type: "null" },
          ],
        },
        items: { type: "array", items: { type: "string", enum: ["en", "ko"] } },
      },
      additionalProperties: false,
    };
    expect(validateSchema(schema, {}).valid).toBe(true);
    expect(validateSchema(schema, { v: null }).valid).toBe(true);
    expect(validateSchema(schema, { v: 2 }).valid).toBe(false);
    expect(validateSchema(schema, { items: ["kr"] }).valid).toBe(false);
    expect(validateSchema(schema, { extra: true }).valid).toBe(false);
    expect(
      validateSchema(
        { $ref: "#/components/schemas/RealtimeSessionCreateRequestGA" },
        { type: "realtime", audio: { input: { noise_reduction: null } } },
      ).valid,
    ).toBe(true);
  });
  it("rejects missing/invalid path and query fields, undeclared authentication headers", () => {
    const op = operation("/models/{model}", "GET");
    expect(validateRecipe({ operationId: op.id }).valid).toBe(false);
    expect(
      validateRecipe({
        operationId: op.id,
        path: { model: "gpt-6-astra" },
        headers: { Authorization: "secret" },
      }).valid,
    ).toBe(false);
    expect(
      validateRecipe({
        operationId: "createResponse",
        body: { model: "gpt-6-astra", input: "x", max_output_tokens: -2 },
      }).valid,
    ).toBe(false);
  });
});

describe("execution and safety", () => {
  it("does not request an API during discovery, blocks missing keys and mutation intent", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return fixture({});
    };
    await expect(
      executeRecipe(
        {
          operationId: "createResponse",
          body: { model: "gpt-6-astra", input: "hello" },
        },
        { ...context, fetch: fetcher as typeof fetch },
      ),
    ).rejects.toThrow("Confirm");
    const id = operation("/models", "GET").id;
    await expect(
      executeRecipe(
        { operationId: id },
        { credentials: {}, fetch: fetcher as typeof fetch },
      ),
    ).rejects.toThrow("credential");
    expect(calls).toBe(0);
  });
  it("sends JSON only to fixed OpenAI origin, separates admin credentials, redacts secrets", async () => {
    const op = operation("/organization/projects", "GET");
    let auth = "";
    const result = await executeRecipe(
      { operationId: op.id },
      {
        ...context,
        fetch: (async (url: URL, init: RequestInit) => {
          expect(url.origin).toBe("https://api.openai.com");
          expect(init.redirect).toBe("error");
          auth = new Headers(init.headers).get("authorization")!;
          return fixture({
            value: "secret-admin-canary",
            client_secret: { value: "provider-secret" },
            ephemeral: { value: "ek_fixture_canary_1234567890" },
            usage: { input_tokens: 20 },
          });
        }) as typeof fetch,
      },
    );
    expect(auth).toBe("Bearer secret-admin-canary");
    expect(result.body).toEqual({
      value: "[REDACTED]",
      client_secret: "[REDACTED]",
      ephemeral: { value: "[REDACTED]" },
      usage: { input_tokens: 20 },
    });
    expect(result.verification).toBe("contract-fixture");
  });
  it("serializes files and nested fields in real multipart and reads binary results", async () => {
    const op = operation("/audio/transcriptions", "POST");
    const recipe = {
      operationId: op.id,
      body: { model: "gpt-4o-transcribe", language: "ko" },
      files: {
        file: {
          name: "speech.wav",
          mediaType: "audio/wav",
          data: new Uint8Array([1, 2, 3]),
        },
      },
      intent: intent(op.id),
    };
    expect(validateRecipe(recipe).valid).toBe(true);
    await executeRecipe(recipe, {
      ...context,
      fetch: (async (_url: URL, init: RequestInit) => {
        expect(init.body).toBeInstanceOf(FormData);
        const form = init.body as FormData;
        expect((form.get("file") as File).name).toBe("speech.wav");
        expect(form.get("language")).toBe("ko");
        expect(new Headers(init.headers).has("content-type")).toBe(false);
        return fixture({ text: "안녕하세요" });
      }) as typeof fetch,
    });
    const speech = operation("/audio/speech", "POST");
    const result = await executeRecipe(
      {
        operationId: speech.id,
        body: { model: "gpt-4o-mini-tts", input: "Hi", voice: "marin" },
        intent: intent(speech.id),
      },
      {
        ...context,
        fetch: (async () =>
          new Response(new Uint8Array([4, 5]), {
            headers: { "content-type": "audio/mpeg" },
          })) as typeof fetch,
      },
    );
    expect(result.binary?.data).toEqual(new Uint8Array([4, 5]));
  });
  it("serializes Realtime SDP multipart with documented content encodings", () => {
    const op = operation("/realtime/calls", "POST");
    const request = buildRequest(op, {
      operationId: op.id,
      body: {
        sdp: "v=0\r\n",
        session: { type: "realtime", model: "gpt-realtime-2.1" },
      },
    });
    const form = request.init.body as FormData;
    expect((form.get("sdp") as Blob).type).toBe("application/sdp");
    expect((form.get("session") as Blob).type).toBe("application/json");
  });
  it("parses split Unicode SSE, multiline data, comments, and ids", async () => {
    const encoded = new TextEncoder().encode(
      ':ping\r\nid: one\r\nevent: delta\r\ndata: {"text":"안녕"}\r\n\r\ndata: line1\ndata: line2\n\n',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < encoded.length; i += 2)
          controller.enqueue(encoded.slice(i, i + 2));
        controller.close();
      },
    });
    const events = [];
    for await (const event of parseEventStream(stream)) events.push(event);
    expect(events[0]).toEqual({
      kind: "event",
      event: "delta",
      id: "one",
      data: { text: "안녕" },
    });
    expect(events[1]?.data).toBe("line1\nline2");
  });
  it("records rejected responses as errors rather than successful fixtures", async () => {
    const result = await executeRecipe(
      { operationId: operation("/models", "GET").id },
      {
        ...context,
        fetch: (async () =>
          fixture(
            { error: { message: "Unavailable model" } },
            403,
          )) as typeof fetch,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.acceptance).toBe("rejected");
    expect(result.status).toBe(403);
  });
  it("handles cursor pagination with a bounded read lifecycle", async () => {
    const op = operation("/files", "GET");
    let count = 0;
    const fetcher = (async (url: URL) => {
      count++;
      if (count === 1)
        return fixture({
          data: [{ id: "file_1" }],
          has_more: true,
          last_id: "file_1",
        });
      expect(url.searchParams.get("after")).toBe("file_1");
      return fixture({ data: [{ id: "file_2" }], has_more: false });
    }) as typeof fetch;
    const pages = [];
    for await (const page of paginateRecipe(
      { operationId: op.id },
      { ...context, fetch: fetcher },
    ))
      pages.push(page);
    expect(pages).toHaveLength(2);
  });
  it("polls jobs without reissuing creation and supports explicit cancellation operations", async () => {
    const op = operation("/batches/{batch_id}", "GET");
    let count = 0;
    const result = await pollRecipe(
      { operationId: op.id, path: { batch_id: "batch_1" } },
      {
        ...context,
        fetch: (async () =>
          fixture({
            status: ++count === 2 ? "completed" : "in_progress",
          })) as typeof fetch,
      },
      { intervalMs: 10, maxPolls: 3 },
    );
    expect((result.body as any).status).toBe("completed");
    expect(count).toBe(2);
    const cancel = operation("/batches/{batch_id}/cancel", "POST");
    expect(cancel.handlers).toContain("cancel");
    await executeRecipe(
      {
        operationId: cancel.id,
        path: { batch_id: "batch_1" },
        intent: intent(cancel.id),
      },
      {
        ...context,
        fetch: (async () => fixture({ status: "cancelling" })) as typeof fetch,
      },
    );
  });
});

describe("bidirectional transports and callbacks", () => {
  it("builds documented transport URLs without credentials and prevents invalid targets", () => {
    expect(
      streamTargetUrl({ kind: "realtime", model: "gpt-realtime-2.1" }).href,
    ).toBe("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1");
    expect(
      streamTargetUrl({ kind: "live-sideband", sessionId: "live_123" })
        .pathname,
    ).toBe("/v1/live/sessions/live_123/attach");
    expect(
      streamTargetUrl({ kind: "live-fork", sessionId: "live_123" }).pathname,
    ).toBe("/v1/live/sessions/live_123/fork");
    expect(() =>
      streamTargetUrl({ kind: "realtime", model: "x", callId: "y" }),
    ).toThrow("exactly one");
    expect(() =>
      streamTargetUrl({ kind: "live-sideband", sessionId: "../../other" }),
    ).toThrow("Invalid");
  });
  it("validates outgoing events, reports errors, closes, and never auto-replays", () => {
    class Socket extends EventEmitter {
      readyState = 1;
      sent: string[] = [];
      send(v: string) {
        this.sent.push(v);
      }
      close() {
        this.readyState = 3;
        this.emit("close", 1000);
      }
      terminate() {
        this.close();
      }
    }
    const socket = new Socket();
    const events: unknown[] = [];
    const run = openApiStream(
      { kind: "realtime", model: "gpt-realtime-2.1" },
      {
        credentials: context.credentials,
        confirmed: true,
        onEvent: (event) => events.push(event),
        onError() {},
        socketFactory: () => socket as any,
      },
    );
    run.send({ type: "response.cancel" });
    expect(socket.sent).toHaveLength(1);
    expect(() => run.send({ type: "invented.parameter" })).toThrow("Invalid");
    socket.emit(
      "message",
      Buffer.from('{"type":"session.created","client_secret":"secret"}'),
      false,
    );
    expect((events[0] as any).client_secret).toBe("[REDACTED]");
    run.close();
    expect(() => run.send({ type: "response.cancel" })).toThrow("not open");
  });
  it("authenticates webhook bytes and rejects replay, tampering, and stale timestamps", async () => {
    const secretBytes = Buffer.from("test-webhook-secret-32-bytes-long");
    const secret = `whsec_${secretBytes.toString("base64")}`;
    const payload = JSON.stringify({
      id: "evt_1",
      type: "response.completed",
      data: { id: "resp_1" },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secretBytes)
      .update(`msg_1.${timestamp}.${payload}`)
      .digest("base64");
    const headers = {
      "webhook-id": "msg_1",
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    };
    const seen = new Set<string>();
    const reserve = async (id: string) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    };
    expect(
      (await receiveWebhook(payload, headers, secret, reserve)).accepted,
    ).toBe(true);
    expect(
      (await receiveWebhook(payload, headers, secret, reserve)).duplicate,
    ).toBe(true);
    await expect(
      receiveWebhook(`${payload} `, headers, secret, reserve),
    ).rejects.toThrow();
    await expect(
      receiveWebhook(
        payload,
        { ...headers, "webhook-timestamp": "1" },
        secret,
        reserve,
      ),
    ).rejects.toThrow();
  });
});
