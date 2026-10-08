import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { DiscoveredTool } from "@sona/agent-core";
import type { ConnectionDefinition } from "./types.js";
import { ConnectionError, hash, publicFetch } from "./security.js";
import { MemoryOAuthProvider } from "./oauth.js";

export class McpConnection {
  private client?: Client;
  private transport?: StreamableHTTPClientTransport;
  readonly auth: MemoryOAuthProvider;
  readonly fetcher: typeof fetch;
  runtimeVersion?: string;
  constructor(
    readonly definition: ConnectionDefinition,
    callbackUrl: string,
    env: NodeJS.ProcessEnv = process.env,
    fetcher?: typeof fetch,
  ) {
    this.auth = new MemoryOAuthProvider(definition, callbackUrl, env);
    this.fetcher =
      fetcher ??
      publicFetch([
        new URL(definition.endpoint!).origin,
        ...(definition.oauth?.allowedOrigins ?? []),
      ]);
  }
  async connect(): Promise<DiscoveredTool[]> {
    await this.client?.close();
    const client = new Client(
      { name: "sona", version: "1.0.0" },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(this.definition.endpoint!),
      {
        authProvider: this.auth,
        fetch: this.fetcher,
        reconnectionOptions: {
          maxReconnectionDelay: 1000,
          initialReconnectionDelay: 1000,
          reconnectionDelayGrowFactor: 1,
          maxRetries: 0,
        },
      },
    );
    this.client = client;
    this.transport = transport;
    await client.connect(transport, { timeout: this.definition.timeoutMs });
    this.runtimeVersion = client.getServerVersion()?.version;
    const tools: DiscoveredTool[] = [];
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, {
        timeout: this.definition.timeoutMs,
      });
      tools.push(
        ...page.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          schemaHash: hash(tool.inputSchema),
          effect:
            tool.annotations?.readOnlyHint === true
              ? ("read" as const)
              : ("write" as const),
        })),
      );
      cursor = page.nextCursor;
      if ((cursor && cursors.has(cursor)) || tools.length > 10_000)
        throw new ConnectionError(
          "catalog",
          "The tool catalog is incomplete. The server returned an invalid page sequence.",
        );
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return tools;
  }
  async finishAuth(code: string): Promise<void> {
    if (!this.transport)
      throw new ConnectionError(
        "oauth-start",
        "Start sign-in before the callback.",
      );
    await this.transport.finishAuth(code);
  }
  async identity(): Promise<{ id: string; label: string; verified: boolean }> {
    const identity = this.definition.oauth?.identity;
    if (identity) {
      const token = this.auth.tokens()?.access_token;
      if (!token)
        throw new ConnectionError(
          "identity",
          "The connection has no identity token. Reconnect.",
        );
      const response = await this.fetcher(identity.url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.definition.timeoutMs),
      });
      if (!response.ok)
        throw new ConnectionError(
          "identity",
          "The service account identity could not be verified. Check the identity scope and reconnect.",
        );
      const result = (await response.json()) as Record<string, unknown>;
      if (typeof result[identity.subjectField] !== "string")
        throw new ConnectionError(
          "identity",
          "The identity response has no stable subject.",
        );
      return {
        id: hash({
          issuer: this.definition.oauth?.issuer,
          subject: result[identity.subjectField],
        }),
        label: String(
          identity.labelField
            ? (result[identity.labelField] ?? "Authorized account")
            : "Authorized account",
        ),
        verified: true,
      };
    }
    return {
      id: hash({
        binding: this.definition.id,
        token: this.auth.tokens()?.access_token ?? "anonymous",
      }),
      label: this.definition.accountLabel ?? "Local authorization binding",
      verified: false,
    };
  }
  async invoke(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.client)
      throw new ConnectionError(
        "not-connected",
        "Reconnect this MCP server before the run.",
      );
    const result = await this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: this.definition.timeoutMs, signal },
    );
    if (result.isError)
      throw new ConnectionError(
        "tool-failure",
        "The external tool returned a failure. No successful result was recorded.",
      );
    return result.structuredContent ?? result.content ?? result;
  }
  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.transport = undefined;
    this.auth.invalidateCredentials("all");
  }
}
