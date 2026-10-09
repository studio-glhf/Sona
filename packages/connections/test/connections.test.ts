import { describe, expect, it, vi } from "vitest";
import { canonicalHash } from "@sona/agent-core";
import {
  ConnectionManager,
  MemoryOAuthProvider,
  googleCalendarDefinition,
  hash,
  importPlugin,
  assertEndpoint,
  getPointer,
  setPointer,
  redact,
  publicFetch,
  isPrivateHost,
} from "../src/index.js";
import type { ConnectionDefinition, ConnectionRecord } from "../src/index.js";
import type { McpConnection } from "../src/mcp.js";

const callback = "http://127.0.0.1:4317/api/connections/oauth/callback";
const readSchema = {
  type: "object",
  properties: { calendarId: { type: "string" }, eventId: { type: "string" } },
  required: ["calendarId"],
  additionalProperties: false,
};
const writeSchema = {
  type: "object",
  properties: {
    calendarId: { type: "string" },
    summary: { type: "string" },
    attendees: { type: "array" },
    sendUpdates: { type: "string" },
    operationId: { type: "string" },
  },
  required: ["calendarId", "summary"],
  additionalProperties: false,
};
const definition = (): ConnectionDefinition => ({
  ...googleCalendarDefinition(),
  id: "test",
  accountLabel: "Synthetic test account",
  oauth: undefined,
});
async function fixture() {
  const saved: ConnectionRecord[] = [],
    audit: unknown[] = [];
  const calls = vi.fn().mockResolvedValue({ id: "external-1" });
  let identity = "account-1";
  const client = {
    auth: new MemoryOAuthProvider(definition(), callback, {}),
    runtimeVersion: "fixture-1",
    connect: vi.fn().mockResolvedValue([
      {
        name: "read",
        inputSchema: readSchema,
        schemaHash: hash(readSchema),
        effect: "read",
      },
      {
        name: "write",
        inputSchema: writeSchema,
        schemaHash: hash(writeSchema),
        effect: "write",
      },
    ]),
    identity: vi.fn(async () => ({
      id: identity,
      label: "Test",
      verified: true,
    })),
    invoke: calls,
    close: vi.fn().mockResolvedValue(undefined),
  };
  const manager = new ConnectionManager({
    callbackUrl: callback,
    env: {},
    mcpFactory: () => client as unknown as McpConnection,
    persistence: {
      save: (r) => {
        saved.push(structuredClone(r));
      },
    },
    audit: (e) => {
      audit.push(e);
    },
  });
  await manager.importDefinition(definition());
  await manager.connect("test");
  await manager.updatePolicy("test", {
    read: {
      effect: "read",
      schemaHash: hash(readSchema),
      resourcePointer: "/calendarId",
      resources: ["dedicated-test"],
    },
    write: {
      effect: "write",
      schemaHash: hash(writeSchema),
      resourcePointer: "/calendarId",
      resources: ["dedicated-test"],
      externalIdPointer: "/id",
    },
  });
  return {
    manager,
    client,
    calls,
    saved,
    audit,
    setIdentity: (id: string) => {
      identity = id;
    },
    adapter: manager.createAdapter("test"),
  };
}

describe("connection definitions and network policy", () => {
  it("imports metadata and remote MCP definitions without installing executable code", () => {
    const [item] = importPlugin({
      name: "Calendar",
      version: "1.2.6",
      mcpServers: {
        calendar: {
          type: "http",
          url: "https://calendarmcp.googleapis.com/mcp/v1",
        },
      },
    });
    expect(item?.tools).toEqual({});
    expect(item?.instructionsApproved).toBe(false);
  });
  it.each([
    { mcpServers: { x: { command: "sh", args: ["bad"] } } },
    {
      mcpServers: {
        x: { url: "https://example.com", headers: { authorization: "secret" } },
      },
    },
    { hooks: ["install"] },
    { oauth: { client_secret: "secret" } },
  ])("rejects executable code and inline credentials %#", (input) => {
    expect(() => importPlugin(input)).toThrow();
  });
  it.each([
    "http://example.com/mcp",
    "https://user:pass@example.com/mcp",
    "https://127.0.0.1/mcp",
    "https://[::1]/mcp",
    "https://example.com/mcp?token=secret",
    "https://example.com/#fragment",
  ])("rejects unsafe endpoints %s", (url) =>
    expect(() => assertEndpoint(url)).toThrow(),
  );
  it.each([
    "10.0.0.1",
    "172.16.1.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "host.local",
  ])("blocks private destinations %s", (h) =>
    expect(isPrivateHost(h)).toBe(true),
  );
  it("rejects unapproved origins before a network request", async () => {
    await expect(
      publicFetch(["https://example.com"])("https://unapproved.example/token"),
    ).rejects.toThrow("outside");
  });
  it("matches shared canonical schema hashes", () =>
    expect(hash({ z: 2, A: 1, a: { b: false } })).toBe(
      canonicalHash({ z: 2, A: 1, a: { b: false } }),
    ));
  it("uses JSON pointers without prototype mutation", () => {
    const value = { nested: { id: "x" } };
    expect(getPointer(value, "/nested/id")).toBe("x");
    setPointer(value, "/nested/id", "y");
    expect(getPointer(value, "/nested/id")).toBe("y");
    expect(() => setPointer(value, "/__proto__/danger", true)).toThrow();
  });
  it("removes known credential forms from recursive evidence", () => {
    const value = JSON.stringify(
      redact({
        Authorization: "Bearer secret",
        nested: { refresh_token: "secret" },
        text: "Bearer abc?key=secret",
      }),
    );
    expect(value).not.toContain("secret");
  });
});

describe("OAuth state, PKCE, issuer, and local sessions", () => {
  it("binds single-use state to the initiating session and expiry", () => {
    let time = 1000;
    const auth = new MemoryOAuthProvider(
      definition(),
      callback,
      {},
      () => time,
    );
    auth.begin("browser-a");
    const state = auth.state();
    expect(() => auth.consume(state, "browser-b")).toThrow("another");
    auth.consume(state, "browser-a");
    expect(() => auth.consume(state, "browser-a")).toThrow();
    auth.begin("browser-a");
    const expired = auth.state();
    time += 11 * 60_000;
    expect(() => auth.consume(expired, "browser-a")).toThrow();
  });
  it("requires state and S256 in the authorization redirect", () => {
    const auth = new MemoryOAuthProvider(
      googleCalendarDefinition(),
      callback,
      {},
    );
    auth.begin("browser");
    expect(() =>
      auth.redirectToAuthorization(
        new URL(
          "https://accounts.google.com/auth?state=wrong&code_challenge_method=S256",
        ),
      ),
    ).toThrow();
    const url = new URL("https://accounts.google.com/auth");
    url.searchParams.set("state", auth.state());
    url.searchParams.set("code_challenge_method", "S256");
    auth.redirectToAuthorization(url);
    expect(auth.authorizationUrl).toBe(url.href);
  });
  it("rejects a callback outside the loopback application route", () => {
    expect(
      () =>
        new MemoryOAuthProvider(
          definition(),
          "https://attacker.example/callback",
        ),
    ).toThrow();
  });
  it("keeps tokens and PKCE verifier in memory and invalidates them", () => {
    const auth = new MemoryOAuthProvider(definition(), callback, {});
    auth.saveTokens({ access_token: "secret", token_type: "Bearer" });
    auth.saveCodeVerifier("verifier");
    expect(auth.tokens()?.access_token).toBe("secret");
    auth.invalidateCredentials("all");
    expect(auth.tokens()).toBeUndefined();
    expect(() => auth.codeVerifier()).toThrow();
  });
  it("pins registered credentials to the specified issuer", () => {
    const auth = new MemoryOAuthProvider(googleCalendarDefinition(), callback, {
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    });
    expect(auth.clientInformation()).toMatchObject({
      issuer: "https://accounts.google.com",
    });
  });
  it("rejects an OAuth resource on another origin or outside the MCP path", async () => {
    const auth = new MemoryOAuthProvider(definition(), callback, {});
    await expect(
      auth.validateResourceURL(
        definition().endpoint!,
        "https://attacker.example/",
      ),
    ).rejects.toThrow();
    await expect(
      auth.validateResourceURL(
        definition().endpoint!,
        "https://calendarmcp.googleapis.com/another",
      ),
    ).rejects.toThrow();
  });
});

describe("selected tools, account identity, and real dispatch boundary", () => {
  it("prepares a supported idempotency field before proposal and uses it for reconciliation", async () => {
    const { manager, calls } = await fixture();
    const record = manager.getPublic("test");
    await manager.updatePolicy("test", {
      ...record.tools,
      write: {
        ...record.tools.write!,
        idempotencyPointer: "/operationId",
        idempotencyEncoding: "sha256",
        reconciliation: {
          toolName: "read",
          externalIdPointer: "/eventId",
          arguments: { calendarId: "dedicated-test" },
          resultIdPointer: "/id",
        },
      },
    });
    const args = manager.prepareInvocation(
      "test",
      "write",
      { calendarId: "dedicated-test", summary: "Fixture" },
      undefined,
      "stable-operation",
    ).arguments;
    expect(args.operationId).toMatch(/^[a-f0-9]{64}$/);
    const adapter = manager.createAdapter("test");
    calls.mockResolvedValue({ id: args.operationId });
    const result = await adapter.reconcile!({
      toolName: "write",
      operationId: "stable-operation",
      accountId: "account-1",
      resource: "dedicated-test",
    });
    expect(result.status).toBe("succeeded");
    expect(calls).toHaveBeenCalledWith(
      "read",
      { calendarId: "dedicated-test", eventId: args.operationId },
      undefined,
    );
    await expect(
      adapter.invoke({
        toolName: "write",
        operationId: "stable-operation",
        accountId: "account-1",
        resource: "dedicated-test",
        arguments: { calendarId: "dedicated-test", summary: "Fixture" },
      }),
    ).rejects.toThrow("idempotency");
    await manager.close();
  });
  it("detects connection policy changes after a measured binding snapshot", async () => {
    const { manager } = await fixture();
    const snapshot = manager.bindingSnapshot("test");
    expect(() => manager.assertBinding(snapshot)).not.toThrow();
    const record = manager.getPublic("test");
    await manager.updatePolicy("test", record.tools, false, {
      "test-calendar": "dedicated-test",
    });
    expect(() => manager.assertBinding(snapshot)).toThrow("changed after");
    expect(JSON.stringify(snapshot)).not.toContain("account-1");
    await manager.close();
  });
  it("resolves a portable logical resource only through a reviewed local binding", async () => {
    const { manager } = await fixture();
    const record = manager.getPublic("test");
    await manager.updatePolicy("test", record.tools, false, {
      "test-calendar": "dedicated-test",
    });
    const args = { calendarId: "test-calendar", summary: "Fixture" };
    expect(
      manager.prepareInvocation("test", "write", args, "test-calendar"),
    ).toEqual({
      arguments: { calendarId: "dedicated-test", summary: "Fixture" },
      resource: "dedicated-test",
    });
    expect(args.calendarId).toBe("test-calendar");
    expect(() =>
      manager.prepareInvocation(
        "test",
        "write",
        { calendarId: "another-calendar", summary: "Fixture" },
        "test-calendar",
      ),
    ).toThrow("differs");
    expect(() =>
      manager.prepareInvocation("test", "write", args, "missing"),
    ).toThrow("Bind");
    await manager.close();
  });
  it("dispatches selected schema-valid reads and approved-executor writes once", async () => {
    const { adapter, calls, audit } = await fixture();
    const result = await adapter.invoke({
      toolName: "write",
      arguments: {
        calendarId: "dedicated-test",
        summary: "Fixture appointment",
      },
      operationId: "op-1",
      accountId: "account-1",
      resource: "dedicated-test",
    });
    expect(result.externalId).toBe("external-1");
    expect(calls).toHaveBeenCalledTimes(1);
    expect(audit).toHaveLength(2);
    await expect(
      adapter.invoke({
        toolName: "write",
        arguments: {
          calendarId: "dedicated-test",
          summary: "Fixture appointment",
        },
        operationId: "op-1",
        accountId: "account-1",
      }),
    ).rejects.toThrow("already");
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it.each([
    {
      toolName: "unselected",
      arguments: { calendarId: "dedicated-test" },
      accountId: "account-1",
    },
    {
      toolName: "read",
      arguments: { calendarId: "primary" },
      accountId: "account-1",
    },
    {
      toolName: "read",
      arguments: { calendarId: "dedicated-test" },
      accountId: "account-2",
    },
    {
      toolName: "write",
      arguments: {
        calendarId: "dedicated-test",
        summary: "X",
        attendees: [{ email: "private@example.test" }],
      },
      accountId: "account-1",
    },
    {
      toolName: "write",
      arguments: {
        calendarId: "dedicated-test",
        summary: "X",
        sendUpdates: "all",
      },
      accountId: "account-1",
    },
    {
      toolName: "write",
      arguments: { calendarId: "dedicated-test", unexpected: 1 },
      accountId: "account-1",
    },
  ])("rejects unauthorized invocation before dispatch %#", async (input) => {
    const { adapter, calls } = await fixture();
    await expect(
      adapter.invoke({ ...input, operationId: "op-1" }),
    ).rejects.toThrow();
    expect(calls).not.toHaveBeenCalled();
  });
  it("detects a changed authenticated account before dispatch", async () => {
    const { adapter, setIdentity, calls } = await fixture();
    setIdentity("different-account");
    await expect(
      adapter.invoke({
        toolName: "read",
        arguments: { calendarId: "dedicated-test" },
        accountId: "account-1",
        operationId: "op-1",
      }),
    ).rejects.toThrow("account changed");
    expect(calls).not.toHaveBeenCalled();
  });
  it("does not downgrade an unverified write to a read", async () => {
    const { manager } = await fixture();
    await expect(
      manager.updatePolicy("test", {
        write: { effect: "read", schemaHash: hash(writeSchema) },
      }),
    ).rejects.toThrow("read-only");
  });
  it("rejects schema changes and nonexistent resource fields", async () => {
    const { manager } = await fixture();
    await expect(
      manager.updatePolicy("test", {
        read: { effect: "read", schemaHash: "old" },
      }),
    ).rejects.toThrow("schema changed");
    await expect(
      manager.updatePolicy("test", {
        write: {
          effect: "write",
          schemaHash: hash(writeSchema),
          resourcePointer: "/invented",
          resources: ["test"],
        },
      }),
    ).rejects.toThrow("absent");
  });
  it("keeps write timeout outcomes unknown and never retries a write", async () => {
    const { adapter, calls } = await fixture();
    calls.mockRejectedValue(new Error("network failed secret"));
    await expect(
      adapter.invoke({
        toolName: "write",
        arguments: { calendarId: "dedicated-test", summary: "X" },
        accountId: "account-1",
        operationId: "op-1",
      }),
    ).rejects.toMatchObject({ definitive: false });
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it("bounds and records retries for reads", async () => {
    const { adapter, calls, audit } = await fixture();
    calls
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ id: "ok" });
    await adapter.invoke({
      toolName: "read",
      arguments: { calendarId: "dedicated-test" },
      accountId: "account-1",
      operationId: "op-1",
    });
    expect(calls).toHaveBeenCalledTimes(2);
    expect(audit).toHaveLength(4);
  });
  it("returns unknown when the service has no configured reconciliation route", async () => {
    const { adapter } = await fixture();
    expect(
      await adapter.reconcile!({
        operationId: "op",
        toolName: "write",
        accountId: "account-1",
      }),
    ).toEqual({ status: "unknown" });
  });
  it("restores definitions but requires a new successful runtime check", async () => {
    const { manager, saved } = await fixture();
    const fresh = new ConnectionManager({
      callbackUrl: callback,
      records: [saved.at(-1)!],
    });
    expect(fresh.list()[0]?.status).toBe("needs-verification");
    expect(() => fresh.createAdapter("test")).toThrow();
    await manager.close();
  });
  it("redacts arbitrary OAuth token values before audit and tool results", async () => {
    const { manager, client, calls, audit, adapter } = await fixture();
    const canary = "synthetic-opaque-credential-for-redaction";
    client.auth.saveTokens({ access_token: canary, token_type: "Bearer" });
    calls.mockResolvedValue({ message: "Echo " + canary });
    const result = await adapter.invoke({
      toolName: "read",
      arguments: { calendarId: "dedicated-test" },
      accountId: "account-1",
      operationId: "canary",
    });
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(JSON.stringify(audit)).not.toContain(canary);
    await manager.close();
  });
  it("never persists authorization URLs or claims connection reuse from discovery", async () => {
    const { manager, saved } = await fixture();
    expect(saved.some((x) => "authorizationUrl" in x)).toBe(false);
    expect(manager.getPublic("test").reuseVerified).toBe(false);
  });
});
