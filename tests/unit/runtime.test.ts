import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { RuntimeActionJournal } from "../../examples/agent/src/journal.js";
import { runtimeSessionMemory } from "../../examples/agent/src/session-memory.js";
import {
  ActionExecutor,
  canonicalHash,
  defaultAgentConfig,
  type ConnectionAdapter,
} from "../../packages/agent-core/src/index.js";

describe("portable runtime isolation", () => {
  it("uses a configuration snapshot and an action-only database without Sona study storage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sona-runtime-contract-")),
      path = join(dir, "actions.sqlite");
    const journal = new RuntimeActionJournal(path);
    try {
      const config = defaultAgentConfig("Independent runtime fixture"),
        memory = runtimeSessionMemory(journal),
        session = memory.start(config);
      config.instructions = "Next draft";
      expect(session.snapshot.configuration.instructions).not.toBe(
        config.instructions,
      );
      expect(session.snapshot.configurationHash).toBe(
        canonicalHash(session.snapshot.configuration),
      );
      memory.sessions.appendEvent(session.id, {
        type: "transcript.participant",
        payload: { text: "Synthetic speech" },
      });
      expect(memory.sessions.events(session.id)).toEqual([]);
      const db = new DatabaseSync(path, { readOnly: true });
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name),
      ).toEqual(["actions"]);
      db.close();
    } finally {
      journal.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("keeps an uncertain dispatched action across restart without replay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sona-runtime-recovery-")),
      path = join(dir, "actions.sqlite");
    let journal = new RuntimeActionJournal(path);
    try {
      const schema = {
          type: "object",
          properties: { resource: { type: "string" } },
          required: ["resource"],
        },
        tool = {
          name: "read",
          connection: "fixture",
          description: "Contract fixture",
          inputSchema: schema,
          schemaHash: canonicalHash(schema),
          effect: "read" as const,
        };
      let invocations = 0;
      const adapter: ConnectionAdapter = {
        id: "fixture",
        accountId: "fixture-account",
        discover: async () => [tool],
        invoke: async () => {
          invocations++;
          return { data: {} };
        },
      };
      const executor = new ActionExecutor({
        journal,
        policy: defaultAgentConfig().confirmationPolicy,
        isSessionActive: () => true,
      });
      const record = await executor.propose({
        id: "crash-fixture",
        sessionId: "independent-session",
        segmentId: "segment",
        tool,
        arguments: { resource: "test" },
        adapter,
      });
      await journal.update(record.id, record.version, {
        ...record,
        version: record.version + 1,
        state: "dispatching",
      });
      journal.close();
      journal = new RuntimeActionJournal(path);
      expect((await journal.get(record.id))?.state).toBe("unknown");
      expect(invocations).toBe(0);
      expect(await journal.listForSession("independent-session")).toHaveLength(
        1,
      );
    } finally {
      journal.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
