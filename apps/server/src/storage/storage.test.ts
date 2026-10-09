import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionRecord } from "../../../../packages/agent-core/src/index.js";
import {
  createStore,
  csvCell,
  measureEvents,
  type SonaStore,
  type Session,
  type Study,
  type EvidenceEvent,
} from "./index.js";

let directory: string;
let store: SonaStore;
let wall = Date.parse("2026-10-06T12:00:00Z");
let mono = 100;
const config = {
  schemaVersion: "1",
  instructions: "Help with the selected task.",
  model: "gpt-realtime",
  settings: { audio: { output: { speed: 1 } } },
};
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sona-storage-"));
  wall = Date.parse("2026-10-06T12:00:00Z");
  mono = 100;
  store = createStore(directory, { now: () => wall, monotonic: () => mono });
});
afterEach(() => {
  store.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const agent = store.agents.create({ name: "Neutral agent", draft: config });
  const revision = store.agents.revise(agent.id);
  const study = store.studies.save({
    name: "Voice study",
    conditions: [
      {
        id: "a",
        name: "A",
        revisionId: revision.id,
        view: "researcher",
        controls: {},
        estimatedMinutes: 4,
      },
      {
        id: "b",
        name: "B",
        revisionId: revision.id,
        view: "researcher",
        controls: {},
        estimatedMinutes: 4,
      },
    ],
    order: ["a", "b"],
    ordering: "abba",
    measures: [
      {
        id: "clarity",
        question: "How clear was the answer?",
        min: 1,
        max: 7,
        lowAnchor: "Unclear",
        highAnchor: "Clear",
      },
    ],
  });
  return { agent, revision, study };
}
function run(
  study: Study,
  agentId: string,
  code = "P01",
  conditionId = "a",
  researcher = false,
): Session {
  store.studies.assign(study.id, {
    participantCode: code,
    researcherParticipant: researcher,
  });
  store.studies.consent(study.id, {
    participantCode: code,
    accepted: true,
    policyVersion: study.consentPolicy.version,
  });
  return store.sessions.start({
    kind: "study",
    agentId,
    studyId: study.id,
    conditionId,
    participantCode: code,
  });
}
function latency(id: string, duration: number, responseId = "response1") {
  store.sessions.appendEvent(id, {
    type: "input_audio_buffer.speech_stopped",
    responseId,
  });
  mono += duration;
  store.sessions.appendEvent(id, {
    type: "output_audio_buffer.started",
    responseId,
  });
}

describe("durable configurations", () => {
  it("preserves the task and rating scale and separates later protocol changes", () => {
    const { agent, study } = fixture();
    const first = run(study, agent.id);
    const changed = store.studies.save({
      ...study,
      task: "A different task",
      measures: study.measures.map((m) => ({ ...m, max: 3 })),
    });
    store.sessions.annotate(first.id, { ratings: { clarity: 7 } });
    store.sessions.end(first.id);
    const second = run(changed, agent.id);
    store.sessions.annotate(second.id, { ratings: { clarity: 3 } });
    store.sessions.end(second.id);
    expect(store.sessions.get(first.id).snapshot.protocol?.task).toBe(
      study.task,
    );
    expect(
      store.sessions.get(first.id).snapshot.protocol?.measures[0].max,
    ).toBe(7);
    const groups = store.compare(study.id).groups;
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.protocolHash)).size).toBe(2);
    expect(
      groups.find((g) => g.sessionIds.includes(first.id))?.ratings.clarity
        .median,
    ).toBe(7);
  });
  it("does not pair runs from different task protocols", () => {
    const { agent, study } = fixture();
    const first = run(study, agent.id, "P01", "a");
    latency(first.id, 100);
    store.sessions.end(first.id);
    const changed = store.studies.save({ ...study, task: "Different task" });
    const second = run(changed, agent.id, "P01", "b");
    latency(second.id, 200);
    store.sessions.end(second.id);
    expect(store.compare(study.id).pairedDifferences).toEqual([]);
  });
  it("keeps different configuration revisions in separate comparison groups even with the same condition name", () => {
    const { agent, study } = fixture();
    const first = run(study, agent.id);
    store.sessions.end(first.id);
    const changed = store.agents.revise(agent.id, "Changed", {
      ...config,
      instructions: "Different prompt",
    });
    store.studies.save({
      ...study,
      conditions: study.conditions.map((c) =>
        c.id === "a" ? { ...c, revisionId: changed.id } : c,
      ),
    });
    const second = run(study, agent.id);
    store.sessions.end(second.id);
    const groups = store.compare(study.id).groups;
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.configurationHash)).size).toBe(2);
    expect(groups.every((g) => g.sessionCount === 1)).toBe(true);
  });
  it("keeps immutable revisions while the next draft changes", () => {
    const { agent, revision } = fixture();
    store.agents.updateDraft(agent.id, { ...config, model: "different-model" });
    const next = store.agents.revise(agent.id, "Second");
    expect(store.agents.revision(revision.id).configuration.model).toBe(
      "gpt-realtime",
    );
    expect(next.parentId).toBe(revision.id);
    expect(next.number).toBe(2);
    expect(store.agents.diff(revision.id, next.id)).toEqual([
      { path: "/model", before: "gpt-realtime", after: "different-model" },
    ]);
  });
  it("survives restart and protects referenced agents from deletion", () => {
    const { agent, revision } = fixture();
    expect(() => store.agents.delete(agent.id)).toThrow("related sessions");
    store.close();
    store = createStore(directory, { now: () => wall });
    expect(store.agents.revision(revision.id).hash).toBe(revision.hash);
    const duplicate = store.agents.duplicate(agent.id);
    expect(duplicate.id).not.toBe(agent.id);
    store.agents.delete(duplicate.id);
    expect(store.agents.list()).toHaveLength(1);
  });
  it("rejects secrets in configs and persistent metadata", () => {
    expect(() =>
      store.agents.create({ name: "bad", draft: { apiKey: "private-token" } }),
    ).toThrow("credential");
    expect(() =>
      store.metadata.set("connection", { access_token: "secret-value" }),
    ).toThrow("credentials");
    store.metadata.set("connection:test", {
      secretRef: "GOOGLE_CREDENTIALS",
      accountId: "account1",
    });
    expect(store.metadata.list("connection:")).toHaveLength(1);
  });
  it("keeps a backup that can reopen independently", () => {
    const agent = store.agents.create({ name: "Portable", draft: config });
    const backupDirectory = join(directory, "backup");
    // The target directory is created by the maintenance command, not the database engine.
    const backupStore = createStore(backupDirectory);
    backupStore.close();
    rmSync(join(backupDirectory, "sona.sqlite"));
    store.backup(join(backupDirectory, "sona.sqlite"));
    const reopened = createStore(backupDirectory, { now: () => wall });
    expect(reopened.agents.get(agent.id).name).toBe("Portable");
    reopened.close();
  });
});

describe("consent and experiment control", () => {
  it("blocks a researcher participant before explicit applicable consent", () => {
    const { agent, study } = fixture();
    store.studies.assign(study.id, {
      participantCode: "SELF",
      researcherParticipant: true,
    });
    expect(() =>
      store.sessions.start({
        kind: "study",
        agentId: agent.id,
        studyId: study.id,
        conditionId: "a",
        participantCode: "SELF",
      }),
    ).toThrow("consent");
    expect(() =>
      store.studies.consent(study.id, {
        participantCode: "SELF",
        accepted: false,
        policyVersion: "1",
      }),
    ).toThrow("Explicit");
    const session = run(study, agent.id, "SELF", "a", true);
    expect(session.researcherParticipant).toBe(true);
    expect(session.view).toBe("researcher");
  });
  it("does not reuse consent when the policy text changes under the same version", () => {
    const { agent, study } = fixture();
    run(study, agent.id);
    store.studies.save({
      ...study,
      consentPolicy: { ...study.consentPolicy, text: "Different data policy." },
    });
    expect(() =>
      store.sessions.start({
        kind: "study",
        agentId: agent.id,
        studyId: study.id,
        conditionId: "a",
        participantCode: "P01",
      }),
    ).toThrow("consent");
  });
  it("consumes session-scope consent once", () => {
    const { agent, study: original } = fixture();
    const study = store.studies.save({
      ...original,
      consentPolicy: { ...original.consentPolicy, scope: "session" },
    });
    run(study, agent.id);
    expect(() =>
      store.sessions.start({
        kind: "study",
        agentId: agent.id,
        studyId: study.id,
        conditionId: "b",
        participantCode: "P01",
      }),
    ).toThrow("consent");
  });
  it("uses a fixed condition revision and records view/device deviations", () => {
    const { agent, study, revision } = fixture();
    const session = run(study, agent.id, "SELF", "a", true);
    store.agents.updateDraft(agent.id, { ...config, model: "new-model" });
    store.sessions.changeView(session.id, "participant");
    store.sessions.deviceChanged(session.id, {
      kind: "input",
      label: "Headset",
      result: "success",
      muted: true,
    });
    const changed = store.sessions.get(session.id);
    expect(changed.id).toBe(session.id);
    expect(changed.snapshot.revisionId).toBe(revision.id);
    expect(changed.snapshot.configuration.model).toBe("gpt-realtime");
    expect(changed.protocolDeviations).toHaveLength(2);
  });
  it("counterbalances AB/BA and records manual order changes with reasons", () => {
    const { study } = fixture();
    const a = store.studies.assign(study.id, {
      participantCode: "P01",
      researcherParticipant: false,
    });
    const b = store.studies.assign(study.id, {
      participantCode: "P02",
      researcherParticipant: false,
    });
    expect(a.order).toEqual(["a", "b"]);
    expect(b.order).toEqual(["b", "a"]);
    expect(() =>
      store.studies.assign(study.id, {
        participantCode: "P01",
        researcherParticipant: false,
        order: ["b", "a"],
      }),
    ).toThrow("Reason");
    const changed = store.studies.assign(study.id, {
      participantCode: "P01",
      researcherParticipant: false,
      order: ["b", "a"],
      reason: "Scheduled order adjusted.",
    });
    expect(changed.orderChanges).toHaveLength(1);
    expect(store.studies.burden(study.id, 6)).toMatchObject({
      sessionCount: 12,
      estimatedMinutes: 48,
    });
  });
  it("rejects unsupported raw-audio storage and invalid rating scales", () => {
    const { study } = fixture();
    expect(() =>
      store.studies.save({
        ...study,
        consentPolicy: { ...study.consentPolicy, rawAudio: true as false },
      }),
    ).toThrow("Raw audio");
    expect(() =>
      store.studies.save({
        ...study,
        measures: [{ ...study.measures[0]!, min: 7, max: 1 }],
      }),
    ).toThrow("bounds");
  });
});

describe("temporary and durable evidence", () => {
  it("never persists quick-test transcripts or notes and clears the previous test", () => {
    const agent = store.agents.create({ name: "Quick", draft: config });
    const start = () =>
      store.sessions.start({
        kind: "quick",
        agentId: agent.id,
        processingAccepted: true,
      });
    const first = start();
    store.sessions.appendEvent(first.id, {
      type: "transcript.final",
      payload: { text: "PRIVATE_TRANSCRIPT_CANARY" },
    });
    store.sessions.annotate(first.id, { notes: "PRIVATE_NOTE_CANARY" });
    expect(store.sessions.events(first.id)).toHaveLength(1);
    start();
    expect(store.sessions.events(first.id)).toHaveLength(0);
    store.close();
    const raw = readFileSync(join(directory, "sona.sqlite")).toString();
    expect(raw).not.toContain("PRIVATE_TRANSCRIPT_CANARY");
    expect(raw).not.toContain("PRIVATE_NOTE_CANARY");
    store = createStore(directory, { now: () => wall });
    expect(store.sessions.get(first.id).snapshot.configuration).toEqual(config);
    expect(store.sessions.events(first.id)).toEqual([]);
  });
  it("keeps quick-test provider evidence in memory only", () => {
    const agent = store.agents.create({ name: "Quick", draft: config });
    const session = store.sessions.start({
      kind: "quick",
      agentId: agent.id,
      processingAccepted: true,
    });
    store.sessions.setProviderEvidence(session.id, {
      applied: { model: "CONFIRMED_CANARY" },
    });
    expect(store.sessions.get(session.id).providerEvidence).toEqual({
      applied: { model: "CONFIRMED_CANARY" },
    });
    store.close();
    store = createStore(directory, { now: () => wall });
    expect(store.sessions.get(session.id).providerEvidence).toEqual({});
  });
  it("keeps duplicate and out-of-order events without losing provenance", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.sessions.appendEvent(session.id, {
      id: "1",
      type: "transcript.partial",
      sourceSequence: 1,
      payload: { text: "hel" },
      completeness: "partial",
    });
    store.sessions.appendEvent(session.id, {
      id: "3",
      type: "transcript.final",
      sourceSequence: 3,
      payload: { text: "hello" },
    });
    store.sessions.appendEvent(session.id, {
      id: "2",
      type: "provider.notice",
      sourceSequence: 2,
    });
    store.sessions.appendEvent(session.id, {
      id: "1",
      type: "transcript.partial",
      payload: { text: "duplicate" },
    });
    const events = store.sessions.events(session.id);
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(events[1]!.completeness).toBe("gap");
    expect(events[0]!.payload.text).toBe("hel");
  });
  it("preserves original transcript evidence and annotation history after corrections", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.sessions.appendEvent(session.id, {
      id: "e",
      type: "transcript.final",
      source: "input-asr",
      payload: { text: "Tuesday" },
    });
    store.sessions.annotate(session.id, {
      notes: "Correction: participant said Thursday.",
      codes: [{ code: "ASR_ERROR", eventId: "e" }],
      ratings: { clarity: null },
    });
    expect(store.sessions.events(session.id)[0]!.payload.text).toBe("Tuesday");
    expect(store.sessions.get(session.id).outcome.annotations).toHaveLength(3);
    expect(() =>
      store.sessions.annotate(session.id, { ratings: { clarity: 8 } }),
    ).toThrow("scale");
  });
  it("recovers active sessions as interrupted and keeps late results after end", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.close();
    store = createStore(directory, { now: () => wall });
    expect(store.sessions.get(session.id).state).toBe("interrupted");
    const resumed = store.sessions.segment(session.id);
    expect(resumed.segments).toHaveLength(2);
    expect(resumed.snapshot.configurationHash).toBe(
      session.snapshot.configurationHash,
    );
    store.sessions.end(session.id);
    store.sessions.appendEvent(session.id, {
      type: "tool.result",
      payload: { late: true },
    });
    expect(store.sessions.events(session.id).at(-1)!.type).toBe("tool.result");
  });
  it("removes secrets before event persistence and export", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.sessions.appendEvent(session.id, {
      type: "tool.error",
      payload: {
        access_token: "TOKEN_CANARY",
        message: "Bearer SECRET_CANARY",
        url: "https://example.test/?api_key=URL_CANARY",
      },
    });
    const exported = JSON.stringify(store.exportStudy(study.id));
    expect(exported).not.toContain("TOKEN_CANARY");
    expect(exported).not.toContain("SECRET_CANARY");
    expect(exported).not.toContain("URL_CANARY");
    expect(exported).toContain("[REDACTED]");
  });
});

describe("analysis and exports", () => {
  it("uses one monotonic clock and refuses browser or cross-segment timing", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    latency(session.id, 350);
    expect(store.sessions.metrics(session.id)[0]).toMatchObject({
      value: 350,
      unit: "ms",
      name: "response-start-latency",
    });
    const raw = store.sessions.events(session.id);
    const badClock = [{ ...raw[0]! }, { ...raw[1]!, clock: "different" }];
    expect(measureEvents(session.id, badClock)[0]).toMatchObject({
      value: null,
      missingReason: "Events use different clocks",
    });
    const browser = raw.map((event) => ({ ...event, source: "browser" }));
    expect(measureEvents(session.id, browser)[0]!.value).toBeNull();
    const segments = [{ ...raw[0]! }, { ...raw[1]!, segmentId: "other" }];
    expect(measureEvents(session.id, segments)[0]!.value).toBeNull();
  });
  it("shows missing values, distinct group counts, exclusions, and paired participant differences", () => {
    const { agent, study } = fixture();
    const a = run(study, agent.id, "P01", "a");
    latency(a.id, 100);
    store.sessions.end(a.id);
    const b = run(study, agent.id, "P01", "b");
    latency(b.id, 200);
    store.sessions.end(b.id);
    const missing = run(study, agent.id, "P02", "a");
    store.sessions.end(missing.id);
    const self = run(study, agent.id, "SELF", "a", true);
    latency(self.id, 900);
    store.sessions.end(self.id);
    const changed = run(study, agent.id, "P03", "a");
    store.sessions.changeView(changed.id, "participant");
    store.sessions.end(changed.id);
    const comparison = store.compare(study.id);
    expect(comparison.participantCount).toBe(3);
    expect(comparison.sessionCount).toBe(4);
    expect(comparison.excluded).toHaveLength(1);
    expect(comparison.groups).toHaveLength(3);
    const groupA = comparison.groups.find(
      (group) =>
        group.conditionId === "a" && group.researcherParticipant === false,
    )!;
    expect(groupA.responseLatency).toMatchObject({
      count: 1,
      missing: 1,
      median: 100,
    });
    expect(groupA.ratings.clarity!.missing).toBe(2);
    expect(
      comparison.pairedDifferences.find(
        (pair) => pair.metric === "responseLatency",
      )!.values,
    ).toEqual([{ participantCode: "P01", difference: 100 }]);
    expect(store.compare(study.id, { poolGroups: true }).poolingDecision).toBe(
      "combined",
    );
  });
  it("exports selected records with join identifiers and protects spreadsheet cells", () => {
    const { agent, study } = fixture();
    const selected = run(study, agent.id, "P01");
    const excluded = run(study, agent.id, "P02");
    store.sessions.annotate(selected.id, {
      notes: '=HYPERLINK("https://invalid.example")',
    });
    store.sessions.end(selected.id);
    store.sessions.end(excluded.id);
    const exported = store.exportStudy(study.id, { sessionIds: [selected.id] });
    expect("sessions" in exported && exported.sessions).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain(excluded.id);
    const files = store.exportStudy(study.id, {
      format: "csv",
      sessionIds: [selected.id],
    });
    expect("files" in files && files.files["outcomes.csv"]).toContain(
      "'=HYPERLINK",
    );
    expect(csvCell(" \t=1+1")).toBe('"\' \t=1+1"');
    expect(csvCell("ordinary, text")).toBe('"ordinary, text"');
  });
});

describe("retention and action crash recovery", () => {
  it("requires new consent for changed retention and does not extend previous records", () => {
    store.settings.setRetention(2);
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    expect(store.studies.currentConsent(study.id, "P01")).toBeDefined();
    store.settings.setRetention(30);
    expect(store.studies.currentConsent(study.id, "P01")).toBeUndefined();
    expect(() =>
      store.sessions.start({
        kind: "study",
        agentId: agent.id,
        studyId: study.id,
        conditionId: "b",
        participantCode: "P01",
      }),
    ).toThrow("consent");
    wall += 3 * 86_400_000;
    store.cleanup();
    expect(() => store.sessions.get(session.id)).toThrow();
  });
  it("preserves an interrupted outcome after repeated end and restart", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.sessions.end(session.id, "interrupted");
    wall += 1000;
    expect(store.sessions.end(session.id).state).toBe("interrupted");
    store.close();
    store = createStore(directory, { now: () => wall });
    expect(store.sessions.end(session.id).state).toBe("interrupted");
  });
  it("deletes expired sessions at startup and keeps definitions", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.sessions.end(session.id);
    store.close();
    wall += 31 * 86_400_000;
    store = createStore(directory, { now: () => wall });
    expect(store.sessions.list()).toHaveLength(0);
    expect(store.studies.get(study.id).name).toBe(study.name);
    expect(store.agents.get(agent.id).name).toBe(agent.name);
  });
  it("deletes study sessions, participant assignments, consent, and events together", () => {
    const { agent, study } = fixture();
    const session = run(study, agent.id);
    store.sessions.appendEvent(session.id, {
      type: "input.final",
      payload: { text: "private" },
    });
    store.studies.delete(study.id);
    expect(store.studies.list()).toEqual([]);
    expect(store.sessions.list()).toEqual([]);
    expect(() => store.sessions.events(session.id)).toThrow("not found");
  });
  it("atomically rejects duplicate action insert/update and recovers unknown writes", async () => {
    const action: ActionRecord = {
      id: "op1",
      version: 0,
      sessionId: "s1",
      segmentId: "segment1",
      toolName: "calendar.create",
      connectionId: "calendar",
      accountId: "private-account",
      effect: "write",
      schemaHash: "schema",
      argumentsHash: "args",
      proposalHash: "proposal",
      redactedArguments: {},
      state: "dispatching",
      createdAt: wall,
      expiresAt: wall + 60000,
      attempts: [],
    };
    expect(await store.actionJournal.insert(action)).toBe(true);
    expect(await store.actionJournal.insert(action)).toBe(false);
    expect(
      await store.actionJournal.update(action.id, 0, { ...action, version: 1 }),
    ).toBe(true);
    expect(
      await store.actionJournal.update(action.id, 0, { ...action, version: 1 }),
    ).toBe(false);
    store.close();
    store = createStore(directory, { now: () => wall });
    expect(await store.actionJournal.get(action.id)).toMatchObject({
      state: "unknown",
      version: 2,
    });
  });
});
