export type ToolEffect = "read" | "write";

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  schemaHash: string;
  effect: ToolEffect;
}

export interface ToolInvocation {
  toolName: string;
  arguments: Record<string, unknown>;
  operationId: string;
  accountId: string;
  resource?: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  data: unknown;
  externalId?: string;
}
export interface ReconcileRequest {
  operationId: string;
  toolName: string;
  accountId: string;
  resource?: string;
  externalId?: string;
}
export interface ReconcileResult {
  status: "succeeded" | "failed" | "unknown";
  data?: unknown;
  externalId?: string;
}

/** Implementations must bind one account and enforce the selected tool/resource allowlist. */
export interface ConnectionAdapter {
  id: string;
  accountId: string;
  discover(): Promise<DiscoveredTool[]>;
  invoke(request: ToolInvocation): Promise<ToolResult>;
  reconcile?(request: ReconcileRequest): Promise<ReconcileResult>;
}
