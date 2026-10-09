import { randomUUID } from "node:crypto";
import type {
  AgentConfig,
  ActionJournal,
} from "../../../packages/agent-core/src/index.js";
import {
  canonicalHash,
  redact,
} from "../../../packages/agent-core/src/index.js";
import type { SonaStore } from "../../../apps/server/src/storage/index.js";
import type {
  EventInput,
  Session,
  EvidenceEvent,
} from "../../../apps/server/src/storage/types.js";

/** Volatile call state. No study persistence or participant database is used. */
export function runtimeSessionMemory(actionJournal: ActionJournal) {
  const calls = new Map<string, Session>();
  const clock = `server-runtime-${randomUUID()}`;
  let sequence = 0;
  const get = (id: string): Session => {
    const item = calls.get(id);
    if (!item) throw new Error("The runtime session does not exist.");
    return item;
  };
  const appendEvent = (id: string, input: EventInput): EvidenceEvent => {
    const session = get(id);
    const at = new Date().toISOString();
    // Events pass through memory only. Raw audio and transcripts never enter this database.
    return {
      ...input,
      id: input.id ?? randomUUID(),
      schemaVersion: "1",
      sessionId: id,
      segmentId: session.segments.at(-1)?.id,
      sequence: ++sequence,
      source: input.source ?? "server",
      timestamp: input.timestamp ?? at,
      receivedAt: at,
      monotonicMs: performance.now(),
      clock,
      payload: redact(input.payload ?? {}),
      completeness: input.completeness ?? "complete",
    };
  };
  return {
    actionJournal,
    start(
      config: AgentConfig,
      versions: Record<string, unknown> = {},
    ): Session {
      const id = randomUUID(),
        now = new Date().toISOString();
      const session: Session = {
        id,
        kind: "quick",
        agentId: "portable-agent",
        researcherParticipant: false,
        plannedView: "participant",
        initialView: "participant",
        view: "participant",
        state: "active",
        snapshot: {
          configuration: structuredClone(config),
          configurationHash: canonicalHash(config),
          versions: { runtime: "1.1.0", ...versions },
          devices: {},
          rawAudio: false,
        },
        providerEvidence: {},
        startedAt: now,
        protocolDeviations: [],
        outcome: {
          taskSuccess: "unknown",
          ratings: {},
          notes: "",
          codes: [],
          annotations: [],
        },
        segments: [
          {
            id: randomUUID(),
            sessionId: id,
            startedAt: now,
            reason: "start",
            configurationHash: canonicalHash(config),
          },
        ],
        evidenceSaved: false,
      };
      calls.set(id, session);
      return session;
    },
    sessions: {
      get,
      appendEvent,
      setProviderEvidence(id: string, evidence: Record<string, unknown>) {
        const session = get(id);
        session.providerEvidence = redact(evidence);
        return session;
      },
      changeView(id: string, view: "researcher" | "participant") {
        const session = get(id);
        session.view = view;
        return session;
      },
      deviceChanged(
        id: string,
        input: Parameters<SonaStore["sessions"]["deviceChanged"]>[1],
      ) {
        appendEvent(id, {
          type: "device.changed",
          payload: input as unknown as Record<string, unknown>,
        });
        return get(id);
      },
      end(id: string, state: "ended" | "interrupted" = "ended") {
        const session = get(id);
        session.state = state;
        session.endedAt = new Date().toISOString();
        return session;
      },
      events(_id: string): EvidenceEvent[] {
        return [];
      },
      metrics(_id: string) {
        return [];
      },
    },
  };
}
