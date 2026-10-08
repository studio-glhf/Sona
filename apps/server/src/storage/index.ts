import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type {
  ActionJournal,
  ActionRecord,
} from "../../../../packages/agent-core/src/index.js";
import type {
  Agent,
  Assignment,
  Comparison,
  ComparisonFilters,
  ComparisonGroup,
  Condition,
  Consent,
  Document,
  EvidenceEvent,
  EventInput,
  Outcome,
  Revision,
  Session,
  StartSessionInput,
  Study,
} from "./types.js";
import {
  assertSafeConfiguration,
  canonical,
  csv,
  diffValues,
  distribution,
  hash,
  measureEvents,
  median,
  redact,
} from "./evidence.js";
export * from "./types.js";
export { csv, csvCell, diffValues, measureEvents, redact } from "./evidence.js";

export class StoreError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "StoreError";
  }
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function required(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new StoreError(
      "INVALID_INPUT",
      `${label} must contain 1 to ${max} characters.`,
    );
  return value.trim();
}
function object(value: unknown, label: string): Document {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new StoreError("INVALID_INPUT", `${label} must be an object.`);
  return value as Document;
}
function view(value: unknown = "researcher"): "researcher" | "participant" {
  if (value !== "researcher" && value !== "participant")
    throw new StoreError("INVALID_VIEW", "Session view is invalid.");
  return value;
}
const blankOutcome = (): Outcome => ({
  taskSuccess: "unknown",
  ratings: {},
  notes: "",
  codes: [],
  annotations: [],
});
export interface StoreOptions {
  now?: () => number;
  monotonic?: () => number;
  cleanupIntervalMs?: number;
}

export function createStore(dataDir: string, options: StoreOptions = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const dbPath = join(dataDir, "sona.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    /* Windows ACLs govern access. */
  }
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;",
  );
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
  );
  const version = Number(
    (
      db
        .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM migrations")
        .get() as { version: number }
    ).version,
  );
  if (version > 1) {
    db.close();
    throw new StoreError(
      "NEWER_DATABASE",
      "This database needs a newer Sona release.",
    );
  }
  if (version === 0) {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE agents (id TEXT PRIMARY KEY, document TEXT NOT NULL);
      CREATE TABLE revisions (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id), number INTEGER NOT NULL, document TEXT NOT NULL, UNIQUE(agent_id, number));
      CREATE TABLE studies (id TEXT PRIMARY KEY, document TEXT NOT NULL);
      CREATE TABLE assignments (study_id TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE, participant_code TEXT NOT NULL, document TEXT NOT NULL, PRIMARY KEY(study_id, participant_code));
      CREATE TABLE consents (id TEXT PRIMARY KEY, study_id TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE, participant_code TEXT NOT NULL, document TEXT NOT NULL);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, study_id TEXT REFERENCES studies(id) ON DELETE CASCADE, created_at TEXT NOT NULL, document TEXT NOT NULL);
      CREATE TABLE events (id TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, document TEXT NOT NULL, PRIMARY KEY(session_id,id), UNIQUE(session_id,sequence));
      CREATE TABLE actions (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, document TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, document TEXT NOT NULL);
      CREATE INDEX session_study ON sessions(study_id);
      CREATE INDEX actions_session ON actions(session_id);
      INSERT INTO migrations(version,applied_at) VALUES(1,datetime('now'));
      COMMIT;`);
  }
  const nowMs = options.now ?? Date.now;
  const now = () => new Date(nowMs()).toISOString();
  const monotonic = options.monotonic ?? (() => performance.now());
  const clock = `server:${randomUUID()}`;
  const liveEvents = new Map<string, EvidenceEvent[]>();
  const liveOutcomes = new Map<string, Outcome>();
  const liveProviderEvidence = new Map<string, Document>();
  let closed = false;
  const parse = <T>(row: unknown): T | undefined =>
    row ? (JSON.parse((row as { document: string }).document) as T) : undefined;
  const all = <T>(sql: string, ...values: (string | number)[]): T[] =>
    db
      .prepare(sql)
      .all(...values)
      .map((row) => parse<T>(row)!);
  const one = <T>(sql: string, ...values: (string | number)[]): T | undefined =>
    parse<T>(db.prepare(sql).get(...values));
  const tx = <T>(fn: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const must = <T>(item: T | undefined, label: string): T => {
    if (!item)
      throw new StoreError("NOT_FOUND", `${label} was not found.`, 404);
    return item;
  };
  const saveSession = (session: Session) => {
    const durable =
      session.kind === "quick"
        ? { ...session, outcome: blankOutcome(), providerEvidence: {} }
        : session;
    db.prepare("UPDATE sessions SET document=? WHERE id=?").run(
      JSON.stringify(redact(durable)),
      session.id,
    );
  };
  const settings = {
    get: () => ({
      retentionDays:
        one<number>(
          "SELECT document FROM settings WHERE key=?",
          "retentionDays",
        ) ?? 30,
      rawAudio: false as const,
    }),
    setRetention: (days: number) => {
      if (!Number.isInteger(days) || days < 1 || days > 3650)
        throw new StoreError(
          "INVALID_RETENTION",
          "Retention must be 1 to 3650 days.",
        );
      db.prepare(
        "INSERT INTO settings(key,document) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document",
      ).run("retentionDays", JSON.stringify(days));
      return settings.get();
    },
  };
  const metadata = {
    get: <T = unknown>(key: string): T | undefined =>
      one<T>(
        "SELECT document FROM settings WHERE key=?",
        "metadata:" + required(key, "Metadata key", 300),
      ),
    set: <T>(key: string, value: T): T => {
      required(key, "Metadata key", 300);
      if (canonical(value) !== canonical(redact(value)))
        throw new StoreError(
          "CREDENTIAL_STORAGE_BLOCKED",
          "Keep credentials in server-only environment bindings or the operating-system credential store.",
        );
      db.prepare(
        "INSERT INTO settings(key,document) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document",
      ).run("metadata:" + key, JSON.stringify(value));
      return clone(value);
    },
    delete: (key: string): void => {
      db.prepare("DELETE FROM settings WHERE key=?").run(
        "metadata:" + required(key, "Metadata key", 300),
      );
    },
    list: <T = unknown>(prefix = ""): { key: string; value: T }[] =>
      (
        db
          .prepare("SELECT key,document FROM settings WHERE substr(key,1,9)=?")
          .all("metadata:") as { key: string; document: string }[]
      )
        .filter((row) => row.key.slice(9).startsWith(prefix))
        .map((row) => ({
          key: row.key.slice(9),
          value: JSON.parse(row.document) as T,
        })),
  };
  const agents = {
    list: (): Agent[] =>
      all<Agent>("SELECT document FROM agents").sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    get: (id: string): Agent =>
      must(one<Agent>("SELECT document FROM agents WHERE id=?", id), "Agent"),
    create: (input: { name: string; draft: Document }): Agent => {
      const draft = clone(object(input.draft, "Agent configuration"));
      assertSafeConfiguration(draft);
      const agent: Agent = {
        id: randomUUID(),
        name: required(input.name, "Agent name"),
        draft,
        createdAt: now(),
        updatedAt: now(),
      };
      db.prepare("INSERT INTO agents(id,document) VALUES(?,?)").run(
        agent.id,
        JSON.stringify(agent),
      );
      return clone(agent);
    },
    updateDraft: (id: string, draft: Document, name?: string): Agent => {
      const current = agents.get(id);
      object(draft, "Agent configuration");
      assertSafeConfiguration(draft);
      const agent = {
        ...current,
        draft: clone(draft),
        name: name === undefined ? current.name : required(name, "Agent name"),
        updatedAt: now(),
      };
      db.prepare("UPDATE agents SET document=? WHERE id=?").run(
        JSON.stringify(agent),
        id,
      );
      return clone(agent);
    },
    revisions: (agentId: string): Revision[] => {
      agents.get(agentId);
      return all<Revision>(
        "SELECT document FROM revisions WHERE agent_id=? ORDER BY number DESC",
        agentId,
      );
    },
    revision: (id: string): Revision =>
      must(
        one<Revision>("SELECT document FROM revisions WHERE id=?", id),
        "Revision",
      ),
    revise: (
      agentId: string,
      name?: string,
      configuration?: Document,
    ): Revision =>
      tx(() => {
        const agent = agents.get(agentId);
        const config = clone(configuration ?? agent.draft);
        object(config, "Configuration");
        assertSafeConfiguration(config);
        const prior = agents.revisions(agentId)[0];
        const revision: Revision = {
          id: randomUUID(),
          agentId,
          number: (prior?.number ?? 0) + 1,
          name: name
            ? required(name, "Revision name")
            : `Version ${(prior?.number ?? 0) + 1}`,
          configuration: config,
          hash: hash(config),
          parentId: prior?.id ?? null,
          createdAt: now(),
        };
        db.prepare(
          "INSERT INTO revisions(id,agent_id,number,document) VALUES(?,?,?,?)",
        ).run(revision.id, agentId, revision.number, JSON.stringify(revision));
        return clone(revision);
      }),
    delete: (id: string): void =>
      tx(() => {
        agents.get(id);
        const referenced =
          all<Session>("SELECT document FROM sessions").some(
            (session) => session.agentId === id,
          ) ||
          all<Study>("SELECT document FROM studies").some((study) =>
            study.conditions.some(
              (condition) =>
                agents.revision(condition.revisionId).agentId === id,
            ),
          );
        if (referenced)
          throw new StoreError(
            "AGENT_IN_USE",
            "Delete related sessions and study conditions before this agent.",
            409,
          );
        db.prepare("DELETE FROM revisions WHERE agent_id=?").run(id);
        db.prepare("DELETE FROM agents WHERE id=?").run(id);
      }),
    duplicate: (id: string, name?: string): Agent => {
      const agent = agents.get(id);
      return agents.create({
        name: name ?? `${agent.name} copy`,
        draft: agent.draft,
      });
    },
    diff: (beforeId: string, afterId: string) =>
      diffValues(
        agents.revision(beforeId).configuration,
        agents.revision(afterId).configuration,
      ),
  };
  const studies = {
    list: (): Study[] =>
      all<Study>("SELECT document FROM studies").sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    get: (id: string): Study =>
      must(one<Study>("SELECT document FROM studies WHERE id=?", id), "Study"),
    save: (input: Partial<Study> & { name: string }): Study => {
      const prior = input.id ? studies.get(input.id) : undefined;
      const next: Study = {
        id: prior?.id ?? randomUUID(),
        question: "",
        task: "",
        conditions: [],
        order: [],
        ordering: "manual",
        measures: [],
        consentPolicy: {
          version: "1",
          text: "OpenAI processes voice. Connected services process selected tool calls. Sona keeps transcripts and events locally for the configured retention period. Raw audio is not saved. Exports and provider records are separate.",
          scope: "study",
          rawAudio: false,
        },
        createdAt: now(),
        ...prior,
        ...clone(input),
        updatedAt: now(),
      };
      next.id = prior?.id ?? next.id;
      next.name = required(next.name, "Study name");
      if (!Array.isArray(next.conditions) || next.conditions.length > 100)
        throw new StoreError(
          "INVALID_CONDITIONS",
          "Give at most 100 conditions.",
        );
      const ids = new Set<string>();
      next.conditions = next.conditions.map((condition) => {
        const id = required(condition.id, "Condition identifier");
        if (ids.has(id))
          throw new StoreError(
            "DUPLICATE_CONDITION",
            "Condition identifiers must be unique.",
          );
        ids.add(id);
        agents.revision(condition.revisionId);
        if (
          condition.estimatedMinutes !== undefined &&
          (!Number.isFinite(condition.estimatedMinutes) ||
            condition.estimatedMinutes < 0)
        )
          throw new StoreError(
            "INVALID_DURATION",
            "Condition duration cannot be negative.",
          );
        return {
          ...condition,
          id,
          name: required(condition.name, "Condition name"),
          view: view(condition.view),
          controls: object(condition.controls ?? {}, "Condition controls"),
        };
      });
      if (!["manual", "abba"].includes(next.ordering))
        throw new StoreError("INVALID_ORDER", "Select manual or AB/BA order.");
      if (next.order.some((id) => !ids.has(id)))
        throw new StoreError(
          "INVALID_ORDER",
          "Order contains an unknown condition.",
        );
      if (next.ordering === "abba" && next.conditions.length !== 2)
        throw new StoreError(
          "INVALID_ORDER",
          "AB/BA order needs two conditions.",
        );
      const measureIds = new Set<string>();
      for (const measure of next.measures) {
        if (measureIds.has(measure.id))
          throw new StoreError(
            "INVALID_MEASURE",
            "Measure identifiers must be unique.",
          );
        measureIds.add(required(measure.id, "Measure identifier"));
        required(measure.question, "Rating question", 2000);
        required(measure.lowAnchor, "Low scale anchor", 2000);
        required(measure.highAnchor, "High scale anchor", 2000);
        if (
          !Number.isFinite(measure.min) ||
          !Number.isFinite(measure.max) ||
          measure.min >= measure.max
        )
          throw new StoreError(
            "INVALID_SCALE",
            "Rating scale needs finite bounds in increasing order.",
          );
      }
      required(next.consentPolicy.version, "Consent policy version");
      required(next.consentPolicy.text, "Consent policy", 20000);
      if (
        !["study", "session"].includes(next.consentPolicy.scope) ||
        next.consentPolicy.rawAudio !== false
      )
        throw new StoreError(
          "INVALID_CONSENT_POLICY",
          "Use study or session consent. Raw audio storage is not available.",
        );
      db.prepare(
        "INSERT INTO studies(id,document) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document",
      ).run(next.id, JSON.stringify(redact(next)));
      return clone(next);
    },
    assignments: (studyId: string): Assignment[] => {
      studies.get(studyId);
      return all<Assignment>(
        "SELECT document FROM assignments WHERE study_id=?",
        studyId,
      );
    },
    assign: (
      studyId: string,
      input: {
        participantCode: string;
        researcherParticipant: boolean;
        order?: string[];
        reason?: string;
      },
    ): Assignment => {
      const study = studies.get(studyId);
      const code = required(input.participantCode, "Participant code", 80);
      const prior = one<Assignment>(
        "SELECT document FROM assignments WHERE study_id=? AND participant_code=?",
        studyId,
        code,
      );
      const count = studies.assignments(studyId).length;
      const baseOrder = study.order.length
        ? study.order
        : study.conditions.map((condition) => condition.id);
      const planned =
        study.ordering === "abba" && count % 2
          ? [...baseOrder].reverse()
          : baseOrder;
      const order = input.order ?? prior?.order ?? planned;
      if (
        !order.length ||
        order.some(
          (id) => !study.conditions.some((condition) => condition.id === id),
        )
      )
        throw new StoreError(
          "INVALID_ORDER",
          "Participant order must contain known conditions.",
        );
      const changes = prior?.orderChanges ?? [];
      if (prior && canonical(prior.order) !== canonical(order))
        changes.push({
          at: now(),
          previous: prior.order,
          next: order,
          reason: required(input.reason, "Reason for order change", 2000),
        });
      const assignment: Assignment = {
        createdAt: prior?.createdAt ?? now(),
        updatedAt: now(),
        studyId,
        participantCode: code,
        researcherParticipant: input.researcherParticipant === true,
        order,
        plannedOrder: prior?.plannedOrder ?? planned,
        orderChanges: changes,
      };
      db.prepare(
        "INSERT INTO assignments(study_id,participant_code,document) VALUES(?,?,?) ON CONFLICT(study_id,participant_code) DO UPDATE SET document=excluded.document",
      ).run(studyId, code, JSON.stringify(assignment));
      return clone(assignment);
    },
    consent: (
      studyId: string,
      input: {
        participantCode: string;
        accepted: boolean;
        policyVersion: string;
        sessionId?: string;
      },
    ): Consent => {
      const study = studies.get(studyId);
      const code = required(input.participantCode, "Participant code", 80);
      if (input.accepted !== true)
        throw new StoreError(
          "CONSENT_REQUIRED",
          "Explicit participant consent is necessary.",
        );
      if (input.policyVersion !== study.consentPolicy.version)
        throw new StoreError(
          "CONSENT_POLICY_CHANGED",
          "The consent policy changed. Read and accept the current policy.",
        );
      const consent: Consent = {
        id: randomUUID(),
        studyId,
        participantCode: code,
        policyVersion: input.policyVersion,
        policyHash: hash({
          ...study.consentPolicy,
          retentionDays: settings.get().retentionDays,
        }),
        acceptedAt: now(),
        scope: study.consentPolicy.scope,
        retentionDays: settings.get().retentionDays,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      };
      db.prepare(
        "INSERT INTO consents(id,study_id,participant_code,document) VALUES(?,?,?,?)",
      ).run(consent.id, studyId, code, JSON.stringify(consent));
      return consent;
    },
    currentConsent: (
      studyId: string,
      participantCode: string,
      sessionId?: string,
    ): Consent | undefined => {
      const study = studies.get(studyId),
        days = settings.get().retentionDays;
      return all<Consent>(
        "SELECT document FROM consents WHERE study_id=? AND participant_code=?",
        studyId,
        participantCode,
      )
        .reverse()
        .find(
          (item) =>
            !item.withdrawnAt &&
            item.policyHash ===
              hash({ ...study.consentPolicy, retentionDays: days }) &&
            Date.parse(item.acceptedAt) >=
              nowMs() - Math.min(days, item.retentionDays ?? 30) * 86_400_000 &&
            (item.scope === "study" ||
              !item.sessionId ||
              item.sessionId === sessionId),
        );
    },
    withdrawConsent: (consentId: string): Consent => {
      const consent = must(
        one<Consent>("SELECT document FROM consents WHERE id=?", consentId),
        "Consent",
      );
      consent.withdrawnAt = now();
      db.prepare("UPDATE consents SET document=? WHERE id=?").run(
        JSON.stringify(consent),
        consent.id,
      );
      return consent;
    },
    burden: (studyId: string, participantCount: number) => {
      const study = studies.get(studyId);
      if (!Number.isInteger(participantCount) || participantCount < 1)
        throw new StoreError(
          "INVALID_COUNT",
          "Participant count must be a positive integer.",
        );
      const order = study.order.length
        ? study.order
        : study.conditions.map((c) => c.id);
      const minutes =
        order.reduce(
          (total, id) =>
            total +
            (study.conditions.find((c) => c.id === id)?.estimatedMinutes ?? 0),
          0,
        ) * participantCount;
      return {
        sessionCount: order.length * participantCount,
        estimatedMinutes: minutes,
        durationIncomplete: order.some(
          (id) =>
            study.conditions.find((c) => c.id === id)?.estimatedMinutes ===
            undefined,
        ),
        warning:
          order.length > 4
            ? "Many conditions increase fatigue and session burden. Use focused comparisons."
            : null,
      };
    },
    delete: (studyId: string): void =>
      tx(() => {
        studies.get(studyId);
        for (const session of sessions.list({ studyId })) {
          db.prepare("DELETE FROM actions WHERE session_id=?").run(session.id);
          liveEvents.delete(session.id);
          liveOutcomes.delete(session.id);
        }
        db.prepare("DELETE FROM studies WHERE id=?").run(studyId);
      }),
  };
  const sessions = {
    list: (
      filter: { studyId?: string; kind?: "quick" | "study" } = {},
    ): Session[] => {
      const list = filter.studyId
        ? all<Session>(
            "SELECT document FROM sessions WHERE study_id=? ORDER BY created_at DESC",
            filter.studyId,
          )
        : all<Session>(
            "SELECT document FROM sessions ORDER BY created_at DESC",
          );
      return list
        .filter((session) => !filter.kind || session.kind === filter.kind)
        .map((session) => ({
          ...session,
          ...(session.kind === "quick"
            ? { outcome: liveOutcomes.get(session.id) ?? blankOutcome() }
            : {}),
        }));
    },
    get: (id: string): Session => {
      const session = must(
        one<Session>("SELECT document FROM sessions WHERE id=?", id),
        "Session",
      );
      if (session.kind === "quick") {
        session.outcome = clone(liveOutcomes.get(id) ?? blankOutcome());
        session.providerEvidence = clone(liveProviderEvidence.get(id) ?? {});
      }
      return session;
    },
    start: (input: StartSessionInput): Session =>
      tx(() => {
        if (!["quick", "study"].includes(input.kind))
          throw new StoreError("INVALID_SESSION", "Session type is invalid.");
        const agent = agents.get(input.agentId);
        const id = input.id ?? randomUUID();
        let configuration = clone(input.configuration ?? agent.draft);
        let condition: Condition | undefined;
        let revision: Revision | undefined;
        let consent: Consent | undefined;
        let protocol: Session["snapshot"]["protocol"];
        let researcherParticipant = input.researcherParticipant === true;
        if (input.kind === "study") {
          const study = studies.get(
            required(input.studyId, "Study identifier"),
          );
          protocol = clone({
            id: study.id,
            name: study.name,
            question: study.question,
            task: study.task,
            measures: study.measures,
          });
          condition = must(
            study.conditions.find((item) => item.id === input.conditionId),
            "Condition",
          );
          revision = agents.revision(condition.revisionId);
          if (revision.agentId !== agent.id)
            throw new StoreError(
              "AGENT_MISMATCH",
              "The condition belongs to a different agent.",
            );
          configuration = clone(revision.configuration);
          const code = required(input.participantCode, "Participant code", 80);
          const assignment = must(
            one<Assignment>(
              "SELECT document FROM assignments WHERE study_id=? AND participant_code=?",
              study.id,
              code,
            ),
            "Participant assignment",
          );
          researcherParticipant = assignment.researcherParticipant;
          consent = studies.currentConsent(study.id, code, id);
          if (!consent)
            throw new StoreError(
              "CONSENT_REQUIRED",
              "Applicable participant consent is necessary before study capture.",
            );
          if (consent.scope === "session") {
            consent.sessionId = id;
            db.prepare("UPDATE consents SET document=? WHERE id=?").run(
              JSON.stringify(consent),
              consent.id,
            );
          }
        } else if (input.processingAccepted !== true)
          throw new StoreError(
            "PROCESSING_NOTICE_REQUIRED",
            "Accept the processing notice before microphone capture.",
          );
        assertSafeConfiguration(configuration);
        const plannedView = condition?.view ?? "researcher";
        const initialView = view(input.view ?? plannedView);
        const session: Session = {
          id,
          kind: input.kind,
          agentId: agent.id,
          ...(input.kind === "study"
            ? {
                studyId: input.studyId,
                conditionId: input.conditionId,
                participantCode: input.participantCode,
              }
            : {}),
          researcherParticipant,
          plannedView,
          initialView,
          view: initialView,
          state: "active",
          snapshot: {
            ...(protocol
              ? {
                  protocol,
                  protocolHash: hash({
                    question: protocol.question,
                    task: protocol.task,
                    measures: protocol.measures,
                  }),
                }
              : {}),
            configuration,
            configurationHash: hash(configuration),
            ...(revision ? { revisionId: revision.id } : {}),
            ...(condition ? { condition: clone(condition) } : {}),
            ...(consent ? { consent: clone(consent) } : {}),
            versions: redact(input.versions ?? {}),
            devices: redact(input.devices ?? {}),
            rawAudio: false,
            retentionDays: settings.get().retentionDays,
          },
          providerEvidence: {},
          startedAt: now(),
          protocolDeviations:
            initialView === plannedView
              ? []
              : [
                  {
                    at: now(),
                    reason: "Initial view differs from the planned view.",
                  },
                ],
          outcome: blankOutcome(),
          segments: [],
          evidenceSaved: input.kind === "study",
        };
        session.segments.push({
          id: randomUUID(),
          sessionId: id,
          startedAt: now(),
          reason: "initial",
          configurationHash: session.snapshot.configurationHash,
        });
        db.prepare(
          "INSERT INTO sessions(id,kind,study_id,created_at,document) VALUES(?,?,?,?,?)",
        ).run(
          id,
          input.kind,
          session.studyId ?? null,
          session.startedAt,
          JSON.stringify(session),
        );
        if (input.kind === "quick") {
          liveEvents.clear();
          liveOutcomes.clear();
          liveProviderEvidence.clear();
          liveEvents.set(id, []);
        }
        return clone(session);
      }),
    events: (id: string): EvidenceEvent[] => {
      const session = sessions.get(id);
      return session.kind === "quick"
        ? clone(liveEvents.get(id) ?? [])
        : all<EvidenceEvent>(
            "SELECT document FROM events WHERE session_id=? ORDER BY sequence",
            id,
          );
    },
    appendEvent: (id: string, input: EventInput): EvidenceEvent => {
      const session = sessions.get(id);
      required(input.type, "Event type");
      object(input.payload ?? {}, "Event payload");
      const current = sessions.events(id);
      const eventId = input.id ?? randomUUID();
      const duplicate = current.find((event) => event.id === eventId);
      if (duplicate) return duplicate;
      const previousSource =
        input.sourceSequence === undefined
          ? undefined
          : [...current]
              .reverse()
              .find(
                (event) =>
                  event.source === (input.source ?? "server") &&
                  event.sourceSequence !== undefined,
              );
      const sourceGap =
        previousSource &&
        input.sourceSequence! > previousSource.sourceSequence! + 1;
      const segmentId = input.segmentId ?? session.segments.at(-1)?.id;
      if (
        segmentId &&
        !session.segments.some((segment) => segment.id === segmentId)
      )
        throw new StoreError(
          "INVALID_SEGMENT",
          "The event segment belongs to a different session.",
        );
      const event: EvidenceEvent = {
        id: eventId,
        schemaVersion: "1",
        sessionId: id,
        segmentId,
        sequence: (current.at(-1)?.sequence ?? 0) + 1,
        ...(input.sourceSequence === undefined
          ? {}
          : { sourceSequence: input.sourceSequence }),
        responseId: input.responseId,
        toolId: input.toolId,
        type: input.type,
        source: input.source ?? "server",
        timestamp: input.timestamp ?? now(),
        receivedAt: now(),
        monotonicMs: monotonic(),
        clock,
        payload: redact(clone(input.payload ?? {})),
        completeness: sourceGap ? "gap" : (input.completeness ?? "complete"),
        originalEventId: input.originalEventId,
      };
      if (session.kind === "quick") {
        const items = liveEvents.get(id) ?? [];
        items.push(event);
        liveEvents.set(id, items);
      } else
        db.prepare(
          "INSERT INTO events(id,session_id,sequence,document) VALUES(?,?,?,?)",
        ).run(event.id, id, event.sequence, JSON.stringify(event));
      return clone(event);
    },
    setProviderEvidence: (id: string, evidence: Document): Session => {
      const session = sessions.get(id);
      session.providerEvidence = redact(
        clone(object(evidence, "Provider evidence")),
      );
      if (session.kind === "quick")
        liveProviderEvidence.set(id, session.providerEvidence);
      saveSession(session);
      return session;
    },
    segment: (id: string, reason = "reconnect"): Session => {
      const session = sessions.get(id);
      if (session.state === "ended")
        throw new StoreError(
          "SESSION_ENDED",
          "An ended session cannot reconnect.",
        );
      session.segments.push({
        id: randomUUID(),
        sessionId: id,
        startedAt: now(),
        reason: required(reason, "Reconnect reason", 2000),
        configurationHash: session.snapshot.configurationHash,
      });
      session.state = "active";
      session.protocolDeviations.push({
        at: now(),
        reason: "Connection interrupted. Evidence has a gap.",
      });
      saveSession(session);
      sessions.appendEvent(id, {
        type: "session.reconnected",
        completeness: "gap",
        payload: { reason },
      });
      return session;
    },
    changeView: (
      id: string,
      next: "researcher" | "participant",
      reason = "Researcher selected view",
    ): Session => {
      const session = sessions.get(id);
      view(next);
      if (session.view === next) return session;
      const event = sessions.appendEvent(id, {
        type: "view.changed",
        payload: { previous: session.view, next, reason },
      });
      session.view = next;
      if (session.kind === "study")
        session.protocolDeviations.push({
          at: now(),
          reason: "Session view changed during the condition.",
          eventId: event.id,
        });
      saveSession(session);
      return session;
    },
    deviceChanged: (
      id: string,
      input: {
        kind: "input" | "output";
        label: string;
        result: "success" | "failure";
        muted: boolean;
        gap?: boolean;
        conditionChanged?: boolean;
      },
    ): Session => {
      const session = sessions.get(id);
      const event = sessions.appendEvent(id, {
        type: "device.changed",
        completeness:
          input.gap || input.result === "failure" ? "gap" : "complete",
        payload: { ...input },
      });
      if (session.kind === "study" && input.conditionChanged !== false)
        session.protocolDeviations.push({
          at: now(),
          reason: `Audio ${input.kind} device changed.`,
          eventId: event.id,
        });
      saveSession(session);
      return session;
    },
    annotate: (
      id: string,
      patch: Partial<
        Pick<Outcome, "taskSuccess" | "ratings" | "notes" | "codes">
      >,
      reason?: string,
    ): Session => {
      const session = sessions.get(id);
      const outcome = clone(session.outcome);
      if (
        patch.taskSuccess &&
        !["success", "partial", "failure", "unknown"].includes(
          patch.taskSuccess,
        )
      )
        throw new StoreError("INVALID_OUTCOME", "Task outcome is invalid.");
      if (patch.ratings) {
        const definitions = session.snapshot.protocol?.measures ?? [];
        for (const [key, value] of Object.entries(patch.ratings)) {
          const definition = definitions.find((item) => item.id === key);
          if (
            !definition ||
            (value !== null &&
              (!Number.isFinite(value) ||
                value < definition.min ||
                value > definition.max))
          )
            throw new StoreError(
              "INVALID_RATING",
              "Rating must use its configured scale or be missing.",
            );
        }
      }
      if (
        patch.notes !== undefined &&
        (typeof patch.notes !== "string" || patch.notes.length > 100000)
      )
        throw new StoreError(
          "INVALID_NOTES",
          "Notes must be text with at most 100000 characters.",
        );
      for (const [key, value] of Object.entries(patch)) {
        if (!["taskSuccess", "ratings", "notes", "codes"].includes(key))
          throw new StoreError(
            "INVALID_ANNOTATION",
            "Annotation field is invalid.",
          );
        outcome.annotations.push({
          id: randomUUID(),
          at: now(),
          kind: key,
          before: clone(outcome[key as keyof Outcome]),
          after: redact(clone(value)),
          ...(reason ? { reason: redact(reason) } : {}),
        });
        (outcome as unknown as Document)[key] =
          key === "ratings"
            ? { ...outcome.ratings, ...(value as object) }
            : redact(clone(value));
      }
      session.outcome = outcome;
      if (session.kind === "quick") liveOutcomes.set(id, outcome);
      saveSession(session);
      return session;
    },
    exclude: (id: string, reason: string | null): Session => {
      const session = sessions.get(id);
      if (reason === null) delete session.exclusion;
      else
        session.exclusion = {
          reason: required(reason, "Exclusion reason", 2000),
          at: now(),
        };
      saveSession(session);
      return session;
    },
    end: (id: string, state: "ended" | "interrupted" = "ended"): Session => {
      const session = sessions.get(id);
      if (session.state !== "active") return session;
      session.state = state;
      session.endedAt = now();
      saveSession(session);
      return session;
    },
    clearQuickEvidence: (id: string): void => {
      if (sessions.get(id).kind !== "quick")
        throw new StoreError(
          "NOT_QUICK_TEST",
          "Only quick-test evidence is temporary.",
        );
      liveEvents.delete(id);
      liveOutcomes.delete(id);
      liveProviderEvidence.delete(id);
    },
    metrics: (id: string) => measureEvents(id, sessions.events(id)),
    delete: (id: string): void =>
      tx(() => {
        sessions.get(id);
        db.prepare("DELETE FROM actions WHERE session_id=?").run(id);
        db.prepare("DELETE FROM sessions WHERE id=?").run(id);
        liveEvents.delete(id);
        liveOutcomes.delete(id);
        liveProviderEvidence.delete(id);
      }),
  };
  const actionJournal: ActionJournal = {
    async get(id) {
      return one<ActionRecord>("SELECT document FROM actions WHERE id=?", id);
    },
    async insert(record) {
      return (
        db
          .prepare(
            "INSERT OR IGNORE INTO actions(id,session_id,version,created_at,document) VALUES(?,?,?,?,?)",
          )
          .run(
            record.id,
            record.sessionId,
            record.version,
            record.createdAt,
            JSON.stringify(redact(record)),
          ).changes === 1
      );
    },
    async update(id, expectedVersion, next) {
      if (next.id !== id || next.version !== expectedVersion + 1)
        throw new StoreError(
          "INVALID_ACTION_VERSION",
          "Action updates must advance one version.",
        );
      return (
        db
          .prepare(
            "UPDATE actions SET version=?,document=? WHERE id=? AND version=?",
          )
          .run(next.version, JSON.stringify(redact(next)), id, expectedVersion)
          .changes === 1
      );
    },
    async listUnsettled() {
      return all<ActionRecord>("SELECT document FROM actions").filter((item) =>
        [
          "proposed",
          "awaiting_approval",
          "approved",
          "dispatching",
          "unknown",
        ].includes(item.state),
      );
    },
    async listForSession(sessionId) {
      return all<ActionRecord>(
        "SELECT document FROM actions WHERE session_id=? ORDER BY created_at",
        sessionId,
      );
    },
  };
  function compare(
    studyId: string,
    filters: ComparisonFilters = {},
  ): Comparison {
    const study = studies.get(studyId);
    const excluded: Comparison["excluded"] = [];
    const selected = sessions.list({ studyId }).filter((session) => {
      const reasons: string[] = [];
      if (filters.sessionIds && !filters.sessionIds.includes(session.id))
        return false;
      if (
        filters.conditionIds &&
        !filters.conditionIds.includes(session.conditionId!)
      )
        return false;
      if (
        filters.view &&
        filters.view !== "all" &&
        session.initialView !== filters.view
      )
        return false;
      if (
        filters.researcherParticipant !== undefined &&
        filters.researcherParticipant !== "all" &&
        session.researcherParticipant !== filters.researcherParticipant
      )
        return false;
      if (session.state !== "ended")
        reasons.push("Session has not ended normally.");
      if (!session.snapshot.protocol)
        reasons.push("The study protocol snapshot is missing.");
      if (session.exclusion) reasons.push(session.exclusion.reason);
      if (!filters.includeDeviations && session.protocolDeviations.length)
        reasons.push("Protocol deviation");
      if (reasons.length) {
        excluded.push({ sessionId: session.id, reasons });
        return false;
      }
      return true;
    });
    const sets = new Map<string, Session[]>();
    for (const session of selected) {
      const key =
        `${session.conditionId}:${session.snapshot.configurationHash}:${session.snapshot.protocolHash}:${hash(session.snapshot.condition ?? {})}` +
        (filters.poolGroups
          ? ""
          : `:${session.initialView}:${session.researcherParticipant}`);
      sets.set(key, [...(sets.get(key) ?? []), session]);
    }
    const groups: ComparisonGroup[] = [...sets.values()].map((group) => {
      const first = group[0]!;
      const metrics = new Map(
        group.map((session) => [session.id, sessions.metrics(session.id)]),
      );
      const latency = (
        name: "response-start-latency" | "tool-latency",
        toolActive?: boolean,
      ) =>
        distribution(
          group.flatMap((session) => {
            const value = median(
              metrics
                .get(session.id)!
                .filter(
                  (metric) =>
                    metric.name === name &&
                    metric.value !== null &&
                    (toolActive === undefined ||
                      metric.toolActive === toolActive),
                )
                .map((metric) => metric.value!),
            );
            return value === null
              ? []
              : [
                  {
                    sessionId: session.id,
                    participantCode: session.participantCode!,
                    value,
                  },
                ];
          }),
          group.length,
        );
      return {
        conditionId: first.conditionId!,
        protocol: clone(first.snapshot.protocol!),
        protocolHash: first.snapshot.protocolHash,
        conditionSnapshotHash: hash(first.snapshot.condition ?? {}),
        configurationHash: first.snapshot.configurationHash,
        revisionId: first.snapshot.revisionId,
        conditionName:
          first.snapshot.condition?.name ??
          study.conditions.find(
            (condition) => condition.id === first.conditionId,
          )?.name ??
          first.conditionId!,
        view: filters.poolGroups ? "all" : first.initialView,
        researcherParticipant: filters.poolGroups
          ? "all"
          : first.researcherParticipant,
        participantCount: new Set(
          group.map((session) => session.participantCode),
        ).size,
        sessionCount: group.length,
        turnCount: group.reduce(
          (count, session) =>
            count +
            metrics
              .get(session.id)!
              .filter((metric) => metric.name === "response-start-latency")
              .length,
          0,
        ),
        responseLatency: latency("response-start-latency"),
        responseLatencyWithTools: latency("response-start-latency", true),
        responseLatencyWithoutTools: latency("response-start-latency", false),
        toolLatency: latency("tool-latency"),
        ratings: Object.fromEntries(
          first.snapshot.protocol!.measures.map((measure) => [
            measure.id,
            distribution(
              group.flatMap((session) => {
                const value = session.outcome.ratings[measure.id];
                return value === undefined || value === null
                  ? []
                  : [
                      {
                        sessionId: session.id,
                        participantCode: session.participantCode!,
                        value,
                      },
                    ];
              }),
              group.length,
            ),
          ]),
        ),
        outcomes: {
          success: group.filter((s) => s.outcome.taskSuccess === "success")
            .length,
          partial: group.filter((s) => s.outcome.taskSuccess === "partial")
            .length,
          failure: group.filter((s) => s.outcome.taskSuccess === "failure")
            .length,
          unknown: group.filter((s) => s.outcome.taskSuccess === "unknown")
            .length,
        },
        sessionIds: group.map((session) => session.id),
      };
    });
    const pairedDifferences: Comparison["pairedDifferences"] = [];
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]!;
        const b = groups[j]!;
        if (
          a.conditionId === b.conditionId ||
          a.protocolHash !== b.protocolHash ||
          a.view !== b.view ||
          a.researcherParticipant !== b.researcherParticipant
        )
          continue;
        for (const metric of [
          "responseLatency",
          "toolLatency",
          ...a.protocol!.measures.map((measure) => `rating:${measure.id}`),
        ]) {
          const valuesA = metric.startsWith("rating:")
            ? a.ratings[metric.slice(7)]!.values
            : a[metric as "responseLatency" | "toolLatency"].values;
          const valuesB = metric.startsWith("rating:")
            ? b.ratings[metric.slice(7)]!.values
            : b[metric as "responseLatency" | "toolLatency"].values;
          const participants = [
            ...new Set(valuesA.map((value) => value.participantCode)),
          ];
          const values = participants.flatMap((participantCode) => {
            const aa = median(
              valuesA
                .filter((value) => value.participantCode === participantCode)
                .map((value) => value.value),
            );
            const bb = median(
              valuesB
                .filter((value) => value.participantCode === participantCode)
                .map((value) => value.value),
            );
            return aa === null || bb === null
              ? []
              : [{ participantCode, difference: bb - aa }];
          });
          pairedDifferences.push({
            protocolHash: a.protocolHash,
            fromConfigurationHash: a.configurationHash,
            toConfigurationHash: b.configurationHash,
            fromConditionId: a.conditionId,
            toConditionId: b.conditionId,
            view: a.view,
            researcherParticipant: a.researcherParticipant,
            metric,
            participantCount: values.length,
            median: median(values.map((value) => value.difference)),
            values,
          });
        }
      }
    return {
      schemaVersion: "1",
      studyId,
      filters: clone(filters),
      poolingDecision: filters.poolGroups ? "combined" : "separate",
      participantCount: new Set(
        selected.map((session) => session.participantCode),
      ).size,
      sessionCount: selected.length,
      excluded,
      groups,
      pairedDifferences,
      limitations: [
        "Descriptive results do not establish statistical significance or an optimal configuration.",
        "Latency points use a per-session median. Repeated turns are not independent participants.",
        "Model aliases and external services can change. Identical replay is not guaranteed.",
        "Response-start latency measures server event receipt. It is not physical speech-to-audible-output latency.",
      ],
    };
  }
  function exportStudy(
    studyId: string,
    input: {
      format?: "json" | "csv";
      sessionIds?: string[];
      filters?: ComparisonFilters;
    } = {},
  ) {
    const study = studies.get(studyId);
    const selected = sessions
      .list({ studyId })
      .filter(
        (session) => !input.sessionIds || input.sessionIds.includes(session.id),
      );
    const participantCodes = new Set(
      selected.map((session) => session.participantCode),
    );
    const revisionIds = new Set(
      selected.map((session) => session.snapshot.revisionId).filter(Boolean),
    );
    const records = {
      schemaVersion: "1",
      exportedAt: now(),
      scope: { studyId, sessionIds: selected.map((session) => session.id) },
      redactionPolicy:
        "Credentials and private account bindings excluded. Text fields can contain participant information entered by researchers.",
      study: {
        ...study,
        conditions: study.conditions.filter((condition) =>
          selected.some((session) => session.conditionId === condition.id),
        ),
      },
      configurations: [...revisionIds].map((id) => agents.revision(id!)),
      participants: studies
        .assignments(studyId)
        .filter((assignment) =>
          participantCodes.has(assignment.participantCode),
        ),
      sessions: selected,
      events: selected.flatMap((session) => sessions.events(session.id)),
      metrics: selected.flatMap((session) => sessions.metrics(session.id)),
      actions: selected.flatMap((session) =>
        all<ActionRecord>(
          "SELECT document FROM actions WHERE session_id=?",
          session.id,
        ),
      ),
      outcomes: selected.map((session) => ({
        sessionId: session.id,
        participantCode: session.participantCode,
        conditionId: session.conditionId,
        ...session.outcome,
      })),
      comparison: compare(studyId, {
        ...input.filters,
        sessionIds: selected.map((session) => session.id),
      }),
      definitions: {
        version: "1",
        responseStartLatency:
          "One server monotonic clock: receipt of speech-stop to receipt of audio-stream-start. Not acoustic latency.",
        toolLatency:
          "Local dispatch to result/error for each visible attempt. Approval wait excluded.",
        missing:
          "Missing data stays null. CSV empty cells denote null or absent scalar values. Nested objects retain canonical JSON.",
        transcript:
          "Input ASR differs from model perception. Generated transcript can include unheard speech.",
      },
    };
    const safe = redact(records);
    safe.actions = safe.actions.map((action) => ({
      ...action,
      accountId: "account:" + hash(action.accountId).slice(0, 12),
      ...(action.resource
        ? { resource: "resource:" + hash(action.resource).slice(0, 12) }
        : {}),
    }));
    if (input.format === "csv") {
      return {
        schemaVersion: "1",
        files: {
          "configurations.csv": csv(
            safe.configurations as unknown as Document[],
          ),
          "sessions.csv": csv(safe.sessions as unknown as Document[]),
          "events.csv": csv(safe.events as unknown as Document[]),
          "actions.csv": csv(safe.actions as unknown as Document[]),
          "outcomes.csv": csv(safe.outcomes as unknown as Document[]),
          "metrics.csv": csv(safe.metrics as unknown as Document[]),
          "participants.csv": csv(safe.participants as unknown as Document[]),
          "manifest.json": JSON.stringify(
            {
              schemaVersion: safe.schemaVersion,
              exportedAt: safe.exportedAt,
              scope: safe.scope,
              definitions: safe.definitions,
              study: safe.study,
              comparison: safe.comparison,
              redactionPolicy: safe.redactionPolicy,
            },
            null,
            2,
          ),
        },
      };
    }
    return safe;
  }
  function cleanup() {
    const cutoff = new Date(
      nowMs() - settings.get().retentionDays * 86_400_000,
    ).toISOString();
    const expired = sessions
      .list()
      .filter(
        (session) =>
          Date.parse(session.startedAt) <
          nowMs() -
            Math.min(
              settings.get().retentionDays,
              session.snapshot.retentionDays ?? 30,
            ) *
              86_400_000,
      );
    tx(() => {
      for (const session of expired) {
        db.prepare("DELETE FROM actions WHERE session_id=?").run(session.id);
        db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
        liveEvents.delete(session.id);
        liveOutcomes.delete(session.id);
      }
      db.prepare("DELETE FROM actions WHERE created_at < ?").run(
        Date.parse(cutoff),
      );
      for (const consent of all<Consent>("SELECT document FROM consents"))
        if (
          Date.parse(consent.acceptedAt) <
          nowMs() -
            Math.min(
              settings.get().retentionDays,
              consent.retentionDays ?? 30,
            ) *
              86_400_000
        )
          db.prepare("DELETE FROM consents WHERE id=?").run(consent.id);
      for (const assignment of all<Assignment>(
        "SELECT document FROM assignments",
      )) {
        const hasSession = sessions
          .list({ studyId: assignment.studyId })
          .some(
            (session) => session.participantCode === assignment.participantCode,
          );
        const hasConsent =
          all<Consent>(
            "SELECT document FROM consents WHERE study_id=? AND participant_code=?",
            assignment.studyId,
            assignment.participantCode,
          ).length > 0;
        if (!hasSession && !hasConsent && assignment.updatedAt < cutoff)
          db.prepare(
            "DELETE FROM assignments WHERE study_id=? AND participant_code=?",
          ).run(assignment.studyId, assignment.participantCode);
      }
    });
    return {
      deletedSessions: expired.length,
      cutoff,
      ranAt: now(),
      limitation:
        "Exports, backups, provider records, and external actions are separate. Cleanup operates only while Sona runs.",
    };
  }
  // Do not replay actions or resume capture after process loss.
  for (const session of sessions.list())
    if (session.state === "active") {
      session.state = "interrupted";
      session.protocolDeviations.push({
        at: now(),
        reason: "Application restarted. Microphone stays off.",
      });
      saveSession(session);
    }
  for (const action of all<ActionRecord>("SELECT document FROM actions"))
    if (action.state === "dispatching") {
      const recovered = {
        ...action,
        version: action.version + 1,
        state: "unknown" as const,
        failure: "Process stopped after dispatch. Reconcile before any retry.",
      };
      db.prepare("UPDATE actions SET version=?,document=? WHERE id=?").run(
        recovered.version,
        JSON.stringify(recovered),
        action.id,
      );
    }
  cleanup();
  const timer = setInterval(
    () => {
      if (!closed) cleanup();
    },
    options.cleanupIntervalMs ?? 60 * 60 * 1000,
  );
  timer.unref();
  return {
    agents,
    studies,
    sessions,
    actionJournal,
    settings,
    metadata,
    compare,
    exportStudy,
    cleanup,
    databasePath: dbPath,
    schemaVersion: 1,
    backup: (destination: string) => {
      db.prepare("VACUUM INTO ?").run(destination);
      return destination;
    },
    close: () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      liveEvents.clear();
      liveOutcomes.clear();
      db.close();
    },
  };
}
export type SonaStore = ReturnType<typeof createStore>;
