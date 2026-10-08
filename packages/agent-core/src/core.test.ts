import { describe, expect, it } from "vitest";
import {
  ActionExecutor,
  ActionPolicyError,
  canonicalHash,
  canonicalJson,
  compareAppliedSettings,
  configDiff,
  createRevision,
  csvCell,
  defaultAgentConfig,
  descriptiveStats,
  exportAgent,
  measuredInterval,
  parseSpokenConfirmation,
  proposalTranscriptMatches,
  redact,
  validateAgentConfig,
  type ActionJournal,
  type ActionRecord,
  type ConnectionAdapter,
  type EvidenceEvent,
  type ToolDefinition,
} from "./index.js";

class Journal implements ActionJournal {
  records = new Map<string, ActionRecord>();
  async get(id: string) {
    const item = this.records.get(id);
    return item ? structuredClone(item) : undefined;
  }
  async insert(record: ActionRecord) {
    if (this.records.has(record.id)) return false;
    this.records.set(record.id, structuredClone(record));
    return true;
  }
  async update(id: string, expected: number, record: ActionRecord) {
    if (this.records.get(id)?.version !== expected) return false;
    this.records.set(id, structuredClone(record));
    return true;
  }
  async listUnsettled() {
    return [...this.records.values()]
      .filter((record) =>
        [
          "proposed",
          "awaiting_approval",
          "approved",
          "dispatching",
          "unknown",
        ].includes(record.state),
      )
      .map((record) => structuredClone(record));
  }
}
const inputSchema = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
  additionalProperties: false,
};
const tool: ToolDefinition = {
  name: "create_event",
  connection: "calendar",
  description: "Create an event",
  inputSchema,
  schemaHash: canonicalHash(inputSchema),
  effect: "write",
  resource: "test-calendar",
};
function setup(effect: "read" | "write" = "write") {
  let time = 1_000,
    active = true,
    calls = 0;
  const journal = new Journal();
  const adapter: ConnectionAdapter = {
    id: "calendar",
    accountId: "account-A",
    discover: async () => [{ ...tool, effect }],
    invoke: async () => {
      calls++;
      return { data: { ok: true }, externalId: "event-1" };
    },
  };
  const executor = new ActionExecutor({
    journal,
    policy: defaultAgentConfig().confirmationPolicy,
    isSessionActive: () => active,
    now: () => time,
    monotonic: () => time,
    clockId: "server-test",
    timeoutMs: 10,
  });
  const propose = () =>
    executor.propose({
      id: "operation-1",
      sessionId: "session-1",
      segmentId: "segment-1",
      tool: { ...tool, effect },
      arguments: { title: "Voice test" },
      adapter,
      resource: "test-calendar",
    });
  async function deliver() {
    const action = await propose();
    time = 1_020;
    return executor.markDelivered(action.id, {
      source: "audio-playback",
      responseId: "response-1",
      startedAt: 1_001,
      completedAt: 1_019,
      uninterrupted: true,
      proposalHash: action.proposalHash,
    });
  }
  async function approve(text = "yes", language: "en" | "ko" = "en") {
    time = 1_050;
    return executor.approve("operation-1", {
      source: "participant-transcription",
      eventId: "speech-1",
      sessionId: "session-1",
      segmentId: "segment-1",
      startedAt: 1_030,
      completedAt: 1_049,
      final: true,
      text,
      language,
    });
  }
  return {
    journal,
    executor,
    adapter,
    propose,
    deliver,
    approve,
    calls: () => calls,
    setTime: (next: number) => {
      time = next;
    },
    end: () => {
      active = false;
    },
  };
}

describe("Portable configuration and provider evidence", () => {
  it("keeps omitted settings absent and serializes a portable source-backed definition", () => {
    const config = defaultAgentConfig("Other use case");
    expect(validateAgentConfig(config).success).toBe(true);
    expect(JSON.parse(exportAgent(config))).toEqual(config);
    expect(exportAgent(config)).not.toContain("participant");
    expect(config.settings).not.toHaveProperty("reasoning");
  });
  it("rejects unknown versions, invented parameters, nested unknown fields and impossible settings", () => {
    for (const config of [
      { ...defaultAgentConfig(), schemaVersion: "2" },
      { ...defaultAgentConfig(), settings: { temperature: 0.7 } },
      {
        ...defaultAgentConfig(),
        settings: { audio: { output: { speed: 2 } } },
      },
      {
        ...defaultAgentConfig(),
        settings: { audio: { output: { invent: true } } },
      },
      {
        ...defaultAgentConfig(),
        settings: { output_modalities: ["audio", "text"] },
      },
      { ...defaultAgentConfig(), settings: { max_output_tokens: 9000 } },
      { ...defaultAgentConfig(), settings: { tracing: "auto" } },
    ])
      expect(validateAgentConfig(config).success).toBe(false);
  });
  it("requires verified model access for measured runs and rejects raw WebRTC formats", () => {
    expect(
      validateAgentConfig(defaultAgentConfig(), { measured: true }).success,
    ).toBe(false);
    expect(
      validateAgentConfig(defaultAgentConfig(), {
        measured: true,
        modelVerified: true,
      }).success,
    ).toBe(true);
    expect(
      validateAgentConfig({
        ...defaultAgentConfig(),
        settings: {
          audio: { input: { format: { type: "audio/pcm", rate: 24000 } } },
        },
      }).success,
    ).toBe(false);
  });
  it("checks actual tool schema identity and argument-bearing configuration immutability", () => {
    const config = { ...defaultAgentConfig(), tools: [tool] };
    expect(validateAgentConfig(config).success).toBe(true);
    expect(
      validateAgentConfig({ ...config, tools: [{ ...tool, inputSchema: {} }] })
        .success,
    ).toBe(false);
    const revision = createRevision(config, "Baseline");
    config.instructions = "changed draft";
    expect(revision.config.instructions).not.toBe("changed draft");
    expect(Object.isFrozen(revision.config.settings)).toBe(true);
    expect(configDiff(revision.config, config)).toEqual([
      {
        path: "instructions",
        before: revision.config.instructions,
        after: "changed draft",
        change: "changed",
      },
    ]);
  });
  it("does not confuse acceptance, omission and applied evidence", () => {
    expect(
      compareAppliedSettings(
        {
          audio: { output: { voice: "marin", speed: 1 } },
          instructions: "hello",
        },
        { audio: { output: { voice: "cedar" } }, instructions: "hello" },
      ).map((row) => row.status),
    ).toEqual(["mismatch", "sent", "confirmed"]);
  });
});

describe("Durable, account-bound action policy", () => {
  it("dispatches an approved action once, including concurrent callbacks", async () => {
    const s = setup();
    await s.deliver();
    await s.approve();
    const results = await Promise.allSettled([
      s.executor.dispatch("operation-1", { title: "Voice test" }, s.adapter),
      s.executor.dispatch("operation-1", { title: "Voice test" }, s.adapter),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect(s.calls()).toBe(1);
    expect(
      (
        await s.executor.dispatch(
          "operation-1",
          { title: "Voice test" },
          s.adapter,
        )
      ).state,
    ).toBe("succeeded");
    expect(s.calls()).toBe(1);
  });
  it("blocks writes before delivery, after interruption, and after overlapping speech", async () => {
    const s = setup();
    const action = await s.propose();
    await expect(s.approve()).rejects.toBeInstanceOf(ActionPolicyError);
    await expect(
      s.executor.markDelivered(action.id, {
        source: "audio-playback",
        responseId: "r",
        startedAt: 1_001,
        completedAt: 1_040,
        uninterrupted: false,
        proposalHash: action.proposalHash,
      }),
    ).rejects.toThrow("playback");
    await s.deliver();
    await expect(
      s.executor.approve(action.id, {
        source: "participant-transcription",
        eventId: "s",
        sessionId: "session-1",
        segmentId: "segment-1",
        startedAt: 1_010,
        completedAt: 1_020,
        final: true,
        text: "yes",
        language: "en",
      }),
    ).rejects.toThrow("speech");
    expect(s.calls()).toBe(0);
  });
  it.each([
    "yes, but move it to tomorrow",
    "yesterday",
    "not yes",
    "yes or no",
    "maybe",
    "",
    "네, 하지만 시간을 바꿔 주세요",
  ])(
    "does not treat ambiguous or corrected speech as approval: %s",
    async (text) => {
      const s = setup();
      await s.deliver();
      expect(
        (await s.approve(text, text.startsWith("네") ? "ko" : "en")).state,
      ).toBe("awaiting_approval");
      await expect(
        s.executor.dispatch("operation-1", { title: "Voice test" }, s.adapter),
      ).rejects.toThrow("approval");
      expect(s.calls()).toBe(0);
    },
  );
  it("recognizes separate English and Korean affirmative and negative utterances", () => {
    expect(parseSpokenConfirmation("네.", "ko")).toBe("approve");
    expect(parseSpokenConfirmation("아니요", "ko")).toBe("reject");
    expect(parseSpokenConfirmation("yes please", "en")).toBe("approve");
    expect(parseSpokenConfirmation("don't proceed", "en")).toBe("reject");
    expect(parseSpokenConfirmation("yes", "ko")).toBe("ambiguous");
  });
  it("binds permission to exact arguments, current schema, account and expiry", async () => {
    const s = setup();
    await s.deliver();
    await s.approve();
    await expect(
      s.executor.dispatch(
        "operation-1",
        { title: "Different appointment" },
        s.adapter,
      ),
    ).rejects.toThrow("changed");
    await expect(
      s.executor.dispatch(
        "operation-1",
        { title: "Voice test" },
        { ...s.adapter, accountId: "account-B" },
      ),
    ).rejects.toThrow("changed");
    s.setTime(100_000);
    expect(
      (
        await s.executor.dispatch(
          "operation-1",
          { title: "Voice test" },
          s.adapter,
        )
      ).state,
    ).toBe("expired");
    expect(s.calls()).toBe(0);
  });
  it("ends dispatch permission when the session ends", async () => {
    const s = setup();
    await s.deliver();
    await s.approve();
    s.end();
    await expect(
      s.executor.dispatch("operation-1", { title: "Voice test" }, s.adapter),
    ).rejects.toThrow("ended");
  });
  it("preserves unknown write outcomes without retries and uses explicit reconciliation", async () => {
    const s = setup();
    await s.deliver();
    await s.approve();
    let writes = 0;
    s.adapter.invoke = async () => {
      writes++;
      throw new Error("Connection closed after dispatch");
    };
    expect(
      (
        await s.executor.dispatch(
          "operation-1",
          { title: "Voice test" },
          s.adapter,
        )
      ).state,
    ).toBe("unknown");
    expect(
      (
        await s.executor.dispatch(
          "operation-1",
          { title: "Voice test" },
          s.adapter,
        )
      ).state,
    ).toBe("unknown");
    expect(writes).toBe(1);
    await expect(
      s.executor.propose({
        id: "another-session-operation",
        sessionId: "another-session",
        segmentId: "another-segment",
        tool,
        arguments: { title: "Voice test" },
        adapter: s.adapter,
        resource: "test-calendar",
      }),
    ).rejects.toThrow("Reconcile");
    s.adapter.reconcile = async () => ({
      status: "succeeded",
      externalId: "found-event",
    });
    expect(
      (await s.executor.reconcile("operation-1", s.adapter)).externalId,
    ).toBe("found-event");
  });
  it("treats a crash after durable dispatch as unknown on recovery, without replay", async () => {
    const s = setup();
    const action = await s.propose();
    await s.journal.update(action.id, action.version, {
      ...action,
      version: 1,
      state: "dispatching",
    });
    expect((await s.executor.reconcile(action.id, s.adapter)).state).toBe(
      "unknown",
    );
    expect(s.calls()).toBe(0);
  });
  it("bounds read retries and records all visible attempts", async () => {
    const s = setup("read");
    await s.propose();
    let calls = 0;
    s.adapter.invoke = async () => {
      calls++;
      if (calls === 1) throw new Error("Temporary failure");
      return { data: "read" };
    };
    const result = await s.executor.dispatch(
      "operation-1",
      { title: "Voice test" },
      s.adapter,
    );
    expect(result.state).toBe("succeeded");
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      "failed",
      "succeeded",
    ]);
    expect(calls).toBe(2);
  });
  it("keeps transcript matches conservative for deterministic proposal playback", () => {
    expect(
      proposalTranscriptMatches("At 3 pm. Confirm?", "At 3 pm, confirm."),
    ).toBe(true);
    expect(
      proposalTranscriptMatches("At 3 pm. Confirm?", "At 4 pm, confirm."),
    ).toBe(false);
  });
});

describe("Evidence integrity and redaction", () => {
  it("redacts secrets at arbitrary depth, URL credentials and explicit canaries", () => {
    const output = redact(
      {
        authorization: "Bearer abc",
        nested: [{ access_token: "secret" }],
        message: "unique-canary http://local/?code=oauthvalue&x=1",
        ephemeral: { value: "ek_fixture_canary_1234567890" },
      },
      ["unique-canary"],
    );
    expect(JSON.stringify(output)).not.toContain("oauthvalue");
    expect(JSON.stringify(output)).not.toContain("unique-canary");
    expect(output.authorization).toBe("[REDACTED]");
    expect(output.ephemeral.value).toBe("[REDACTED]");
  });
  it("prevents spreadsheet formulas and preserves CSV quotes", () => {
    expect(csvCell(" =SUM(A1)")).toBe('"\' =SUM(A1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell(null)).toBe('""');
  });
  it("keeps missing observations separate and rejects mixed clock intervals", () => {
    expect(descriptiveStats([1, 3, null, undefined])).toEqual({
      count: 2,
      missing: 2,
      median: 2,
      min: 1,
      max: 3,
    });
    const event = {
      schemaVersion: "1.0",
      id: "a",
      sequence: 1,
      sessionId: "s",
      segmentId: "g",
      type: "speech.stop",
      source: "server",
      timestamp: "2026-10-06T00:00:00Z",
      monotonicMs: 20,
      clockId: "server-a",
      completeness: "complete",
      payload: {},
    } satisfies EvidenceEvent;
    expect(
      measuredInterval("response_start_latency", event, {
        ...event,
        id: "b",
        monotonicMs: 30,
      }).value,
    ).toBe(10);
    expect(
      measuredInterval("response_start_latency", event, {
        ...event,
        clockId: "browser-a",
      }).value,
    ).toBeNull();
    expect(
      measuredInterval("response_start_latency", undefined, event)
        .missingReason,
    ).not.toBeNull();
  });
  it("hashes canonical object order without losing array order or absent values", () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
    expect(canonicalHash([1, 2])).not.toBe(canonicalHash([2, 1]));
    expect(() => canonicalJson({ value: undefined })).toThrow();
  });
});
