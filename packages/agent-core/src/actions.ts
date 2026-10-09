import { randomUUID } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import type { AgentConfig, ToolDefinition } from "./config.js";
import type { ConnectionAdapter, ToolResult } from "./connections.js";
import { canonicalHash } from "./canonical.js";
import { redact } from "./redaction.js";

export type ActionState =
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "dispatching"
  | "succeeded"
  | "failed"
  | "unknown"
  | "rejected"
  | "expired"
  | "canceled";
export interface ProposalDelivery {
  source: "audio-playback";
  responseId: string;
  startedAt: number;
  completedAt: number;
  uninterrupted: boolean;
  proposalHash: string;
}
export interface ParticipantApproval {
  source: "participant-transcription";
  eventId: string;
  sessionId: string;
  segmentId: string;
  startedAt: number;
  completedAt: number;
  final: boolean;
  text: string;
  language: "en" | "ko";
}
export interface ActionAttempt {
  number: number;
  clockId: string;
  startedAt: number;
  endedAt?: number;
  outcome?: "succeeded" | "failed" | "unknown";
  error?: string;
}
export interface ActionRecord {
  id: string;
  version: number;
  sessionId: string;
  segmentId: string;
  toolName: string;
  connectionId: string;
  accountId: string;
  resource?: string;
  effect: "read" | "write";
  schemaHash: string;
  argumentsHash: string;
  proposalHash: string;
  redactedArguments: Record<string, unknown>;
  state: ActionState;
  createdAt: number;
  expiresAt: number;
  delivery?: ProposalDelivery;
  approval?: {
    eventId: string;
    source: "participant-transcription";
    decision: "approve" | "reject" | "ambiguous";
    language: "en" | "ko";
    at: number;
    utteranceHash: string;
  };
  attempts: ActionAttempt[];
  result?: unknown;
  externalId?: string;
  failure?: string;
}
export interface ActionJournal {
  get(id: string): Promise<ActionRecord | undefined>;
  insert(record: ActionRecord): Promise<boolean>;
  /** Must be an atomic compare-and-swap against expectedVersion. */
  update(
    id: string,
    expectedVersion: number,
    next: ActionRecord,
  ): Promise<boolean>;
  listUnsettled(): Promise<ActionRecord[]>;
  listForSession?(sessionId: string): Promise<ActionRecord[]>;
}
export interface ActionProposal {
  id?: string;
  sessionId: string;
  segmentId: string;
  tool: ToolDefinition;
  arguments: Record<string, unknown>;
  adapter: ConnectionAdapter;
  /** Resolved authorized resource. The portable tool's resource is a logical reference. */
  resource?: string;
}
export interface ExecutorOptions {
  journal: ActionJournal;
  policy: AgentConfig["confirmationPolicy"];
  isSessionActive: (sessionId: string) => boolean;
  now?: () => number;
  monotonic?: () => number;
  clockId?: string;
  timeoutMs?: number;
  readRetries?: number;
  secrets?: readonly string[];
}
export class ActionPolicyError extends Error {
  override name = "ActionPolicyError";
}
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    readonly definitive: boolean = false,
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

/** Whole utterances only. A substring such as "yes, but..." never gives permission. */
export function parseSpokenConfirmation(
  text: string,
  language: "en" | "ko",
): "approve" | "reject" | "ambiguous" {
  const normalized = text
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?。！？]+$/u, "")
    .replace(/\s+/g, " ");
  const yes =
    language === "en"
      ? [
          "yes",
          "yes please",
          "yes, please",
          "confirm",
          "confirmed",
          "i confirm",
          "go ahead",
          "yes, go ahead",
          "yes go ahead",
        ]
      : [
          "네",
          "예",
          "확인",
          "확인합니다",
          "승인합니다",
          "네, 진행해 주세요",
          "네 진행해 주세요",
          "진행해 주세요",
        ];
  const no =
    language === "en"
      ? [
          "no",
          "no thanks",
          "no, thanks",
          "cancel",
          "do not proceed",
          "don't proceed",
          "stop",
        ]
      : [
          "아니요",
          "아니오",
          "취소",
          "취소해 주세요",
          "취소합니다",
          "진행하지 마세요",
          "하지 마세요",
        ];
  return yes.includes(normalized)
    ? "approve"
    : no.includes(normalized)
      ? "reject"
      : "ambiguous";
}

export class ActionExecutor {
  private readonly now: () => number;
  private readonly monotonic: () => number;
  private readonly clockId: string;
  constructor(private readonly options: ExecutorOptions) {
    this.now = options.now ?? Date.now;
    this.monotonic = options.monotonic ?? (() => performance.now());
    this.clockId = options.clockId ?? `server-${randomUUID()}`;
  }
  private async load(id: string): Promise<ActionRecord> {
    const record = await this.options.journal.get(id);
    if (!record) throw new ActionPolicyError("The action does not exist.");
    return record;
  }
  private async change(
    record: ActionRecord,
    patch: Partial<ActionRecord>,
  ): Promise<ActionRecord> {
    const next = { ...record, ...patch, version: record.version + 1 };
    if (!(await this.options.journal.update(record.id, record.version, next)))
      throw new ActionPolicyError(
        "The action changed concurrently. Read its current state.",
      );
    return next;
  }
  private active(record: Pick<ActionRecord, "sessionId">): void {
    if (!this.options.isSessionActive(record.sessionId))
      throw new ActionPolicyError(
        "The session ended. New actions are blocked.",
      );
  }
  async propose(input: ActionProposal): Promise<ActionRecord> {
    this.active(input);
    const discovered = (await input.adapter.discover()).find(
      (tool) => tool.name === input.tool.name,
    );
    if (
      !discovered ||
      discovered.schemaHash !== input.tool.schemaHash ||
      discovered.effect !== input.tool.effect
    )
      throw new ActionPolicyError(
        "The selected tool or its schema changed. Review the configuration.",
      );
    if (input.adapter.id !== input.tool.connection)
      throw new ActionPolicyError("The tool is bound to another connection.");
    const validator = new Ajv2020({
      strict: false,
      validateFormats: false,
    }).compile(input.tool.inputSchema);
    if (!validator(input.arguments))
      throw new ActionPolicyError(
        "Tool arguments do not match the selected schema.",
      );
    const argumentsHash = canonicalHash(input.arguments);
    if (input.tool.effect === "write") {
      const unsettled = await this.options.journal.listUnsettled();
      if (
        unsettled.some(
          (action) =>
            action.id !== input.id &&
            action.effect === "write" &&
            ["dispatching", "unknown"].includes(action.state) &&
            action.connectionId === input.adapter.id &&
            action.accountId === input.adapter.accountId &&
            (!input.resource ||
              !action.resource ||
              action.resource === input.resource),
        )
      )
        throw new ActionPolicyError(
          "A prior write has an uncertain result for this account and resource. Reconcile it before another write.",
        );
    }
    const identity = {
      sessionId: input.sessionId,
      segmentId: input.segmentId,
      toolName: input.tool.name,
      connectionId: input.adapter.id,
      accountId: input.adapter.accountId,
      resource: input.resource ?? null,
      schemaHash: input.tool.schemaHash,
      argumentsHash,
    };
    const record: ActionRecord = {
      ...identity,
      ...(input.resource !== undefined ? { resource: input.resource } : {}),
      id: input.id ?? randomUUID(),
      version: 0,
      effect: input.tool.effect,
      proposalHash: canonicalHash(identity),
      redactedArguments: redact(
        input.arguments,
        this.options.secrets,
        input.tool.sensitiveFields,
      ),
      state: input.tool.effect === "write" ? "proposed" : "approved",
      createdAt: this.now(),
      expiresAt: this.now() + this.options.policy.expiresAfterMs,
      attempts: [],
    } as ActionRecord;
    if (record.resource === null) delete record.resource;
    if (await this.options.journal.insert(record)) return record;
    const existing = await this.load(record.id);
    if (existing.proposalHash !== record.proposalHash)
      throw new ActionPolicyError(
        "An operation identifier cannot refer to changed arguments, account, or destination.",
      );
    return existing;
  }
  /** Call only from a trusted media observer after the complete proposal audio played. */
  async markDelivered(
    id: string,
    delivery: ProposalDelivery,
  ): Promise<ActionRecord> {
    const record = await this.load(id);
    this.active(record);
    if (record.state !== "proposed" && record.state !== "awaiting_approval")
      throw new ActionPolicyError(
        "This proposal cannot accept delivery evidence.",
      );
    if (this.now() >= record.expiresAt)
      return this.change(record, { state: "expired" });
    if (
      delivery.source !== "audio-playback" ||
      !delivery.uninterrupted ||
      delivery.proposalHash !== record.proposalHash ||
      !delivery.responseId ||
      delivery.startedAt < record.createdAt ||
      delivery.completedAt <= delivery.startedAt ||
      delivery.completedAt > this.now()
    )
      throw new ActionPolicyError(
        "Complete, uninterrupted proposal playback is necessary.",
      );
    return this.change(record, { state: "awaiting_approval", delivery });
  }
  /** Accept input transcription evidence, never a tool argument or an assistant statement. */
  async approve(
    id: string,
    utterance: ParticipantApproval,
  ): Promise<ActionRecord> {
    const record = await this.load(id);
    this.active(record);
    if (record.approval?.eventId === utterance.eventId) return record;
    if (
      this.now() >= record.expiresAt &&
      ["proposed", "awaiting_approval", "approved"].includes(record.state)
    )
      return this.change(record, { state: "expired" });
    if (record.state !== "awaiting_approval" || !record.delivery?.uninterrupted)
      throw new ActionPolicyError("Approval needs complete proposal playback.");
    if (
      utterance.source !== "participant-transcription" ||
      !utterance.final ||
      utterance.sessionId !== record.sessionId ||
      utterance.segmentId !== record.segmentId ||
      !utterance.eventId ||
      utterance.startedAt < record.delivery.completedAt ||
      utterance.completedAt < utterance.startedAt ||
      utterance.completedAt > this.now()
    )
      throw new ActionPolicyError("This speech cannot authorize the proposal.");
    const decision = parseSpokenConfirmation(
      utterance.text,
      utterance.language,
    );
    return this.change(record, {
      state:
        decision === "approve"
          ? "approved"
          : decision === "reject"
            ? "rejected"
            : "awaiting_approval",
      approval: {
        eventId: utterance.eventId,
        source: "participant-transcription",
        decision,
        language: utterance.language,
        at: utterance.completedAt,
        utteranceHash: canonicalHash(utterance.text),
      },
    });
  }
  async cancel(
    id: string,
    reason = "The proposal was canceled or changed.",
  ): Promise<ActionRecord> {
    const record = await this.load(id);
    if (["dispatching", "succeeded", "unknown"].includes(record.state))
      throw new ActionPolicyError(
        "Speech interruption does not reverse a dispatched action. Reconcile its result.",
      );
    return this.change(record, {
      state: "canceled",
      failure: redact(reason, this.options.secrets),
    });
  }
  async dispatch(
    id: string,
    args: Record<string, unknown>,
    adapter: ConnectionAdapter,
  ): Promise<ActionRecord> {
    let record = await this.load(id);
    if (
      ["succeeded", "failed", "unknown", "dispatching"].includes(record.state)
    )
      return record;
    this.active(record);
    if (this.now() >= record.expiresAt)
      return this.change(record, { state: "expired" });
    if (record.state !== "approved")
      throw new ActionPolicyError("The action does not have approval.");
    if (record.effect === "write" && record.approval?.decision !== "approve")
      throw new ActionPolicyError(
        "Participant approval is necessary for this write.",
      );
    if (
      record.effect === "write" &&
      (await this.options.journal.listUnsettled()).some(
        (other) =>
          other.id !== record.id &&
          other.effect === "write" &&
          ["dispatching", "unknown"].includes(other.state) &&
          other.connectionId === record.connectionId &&
          other.accountId === record.accountId &&
          (!record.resource ||
            !other.resource ||
            other.resource === record.resource),
      )
    )
      return this.change(record, {
        state: "failed",
        failure:
          "A prior write has an uncertain result. Reconcile it before another write.",
      });
    if (
      adapter.id !== record.connectionId ||
      adapter.accountId !== record.accountId ||
      canonicalHash(args) !== record.argumentsHash
    )
      throw new ActionPolicyError(
        "The arguments or account changed after the proposal.",
      );
    const tool = (await adapter.discover()).find(
      (item) => item.name === record.toolName,
    );
    if (
      !tool ||
      tool.schemaHash !== record.schemaHash ||
      tool.effect !== record.effect
    )
      throw new ActionPolicyError(
        "The tool schema changed after the proposal.",
      );
    this.active(record);
    // Commit dispatch before external I/O. A crash now gives an unknown result, never an automatic replay.
    record = await this.change(record, { state: "dispatching" });
    const attempts =
      record.effect === "read"
        ? 1 + Math.min(2, Math.max(0, this.options.readRetries ?? 1))
        : 1;
    for (let number = 1; number <= attempts; number++) {
      const attempt: ActionAttempt = {
        number,
        clockId: this.clockId,
        startedAt: this.monotonic(),
      };
      record = await this.change(record, {
        attempts: [...record.attempts, attempt],
      });
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new ToolExecutionError(
                "The tool timed out. Its result can be unknown.",
              ),
            );
          }, this.options.timeoutMs ?? 20_000);
        });
        const result: ToolResult = await Promise.race([
          adapter.invoke({
            toolName: record.toolName,
            arguments: args,
            operationId: record.id,
            accountId: record.accountId,
            ...(record.resource ? { resource: record.resource } : {}),
            signal: controller.signal,
          }),
          timeout,
        ]);
        attempt.endedAt = this.monotonic();
        attempt.outcome = "succeeded";
        return await this.change(record, {
          state: "succeeded",
          result: redact(result.data, this.options.secrets),
          ...(result.externalId ? { externalId: result.externalId } : {}),
          attempts: [...record.attempts.slice(0, -1), attempt],
        });
      } catch (error) {
        const message = redact(
          error instanceof Error ? error.message : "Tool execution failed.",
          this.options.secrets,
        );
        const unknown =
          record.effect === "write" &&
          !(error instanceof ToolExecutionError && error.definitive);
        attempt.endedAt = this.monotonic();
        attempt.outcome = unknown ? "unknown" : "failed";
        attempt.error = message;
        record = await this.change(record, {
          state:
            number < attempts && this.options.isSessionActive(record.sessionId)
              ? "dispatching"
              : unknown
                ? "unknown"
                : "failed",
          failure: message,
          attempts: [...record.attempts.slice(0, -1), attempt],
        });
        if (record.state !== "dispatching") return record;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return record;
  }
  async reconcile(
    id: string,
    adapter: ConnectionAdapter,
  ): Promise<ActionRecord> {
    let record = await this.load(id);
    if (!["unknown", "dispatching"].includes(record.state)) return record;
    if (
      adapter.id !== record.connectionId ||
      adapter.accountId !== record.accountId
    )
      throw new ActionPolicyError(
        "Reconciliation needs the original account and connection.",
      );
    if (record.state === "dispatching")
      record = await this.change(record, {
        state: "unknown",
        failure: "Dispatch was interrupted. External outcome is unknown.",
      });
    if (!adapter.reconcile) return record;
    const result = await adapter.reconcile({
      operationId: record.id,
      toolName: record.toolName,
      accountId: record.accountId,
      ...(record.resource ? { resource: record.resource } : {}),
      ...(record.externalId ? { externalId: record.externalId } : {}),
    });
    if (result.status === "unknown") return record;
    return this.change(record, {
      state: result.status,
      result: redact(result.data, this.options.secrets),
      ...(result.externalId ? { externalId: result.externalId } : {}),
    });
  }
}
