import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ActionJournal,
  ActionRecord,
} from "../../../packages/agent-core/src/index.js";

/** A private action journal only. This database contains no study tables. */
export class RuntimeActionJournal implements ActionJournal {
  private db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY,version INTEGER NOT NULL,expires_at INTEGER NOT NULL,document TEXT NOT NULL);",
    );
    this.db
      .prepare("DELETE FROM actions WHERE expires_at < ?")
      .run(Date.now() - 30 * 86_400_000);
    // An interrupted dispatch is an unknown result. Never replay it at startup.
    for (const row of this.db
      .prepare("SELECT id,document FROM actions")
      .all()) {
      const record = JSON.parse(row.document as string) as ActionRecord;
      if (record.state === "dispatching") {
        record.state = "unknown";
        record.failure =
          "Runtime stopped after dispatch. Reconcile before another action.";
        record.version++;
        this.db
          .prepare("UPDATE actions SET version=?,document=? WHERE id=?")
          .run(record.version, JSON.stringify(record), record.id);
      }
    }
  }
  async get(id: string): Promise<ActionRecord | undefined> {
    const row = this.db
      .prepare("SELECT document FROM actions WHERE id=?")
      .get(id);
    return row
      ? (JSON.parse(row.document as string) as ActionRecord)
      : undefined;
  }
  async insert(record: ActionRecord): Promise<boolean> {
    return (
      this.db
        .prepare(
          "INSERT OR IGNORE INTO actions(id,version,expires_at,document) VALUES (?,?,?,?)",
        )
        .run(
          record.id,
          record.version,
          record.expiresAt,
          JSON.stringify(record),
        ).changes === 1
    );
  }
  async update(
    id: string,
    expectedVersion: number,
    next: ActionRecord,
  ): Promise<boolean> {
    if (next.id !== id || next.version !== expectedVersion + 1)
      throw new Error("Invalid action journal version.");
    return (
      this.db
        .prepare(
          "UPDATE actions SET version=?,expires_at=?,document=? WHERE id=? AND version=?",
        )
        .run(
          next.version,
          next.expiresAt,
          JSON.stringify(next),
          id,
          expectedVersion,
        ).changes === 1
    );
  }
  async listUnsettled(): Promise<ActionRecord[]> {
    return this.db
      .prepare("SELECT document FROM actions")
      .all()
      .map((row) => JSON.parse(row.document as string) as ActionRecord)
      .filter((record) =>
        [
          "proposed",
          "awaiting_approval",
          "approved",
          "dispatching",
          "unknown",
        ].includes(record.state),
      );
  }
  async listForSession(sessionId: string): Promise<ActionRecord[]> {
    return this.db
      .prepare("SELECT document FROM actions")
      .all()
      .map((row) => JSON.parse(row.document as string) as ActionRecord)
      .filter((record) => record.sessionId === sessionId);
  }
  close(): void {
    this.db.close();
  }
}
