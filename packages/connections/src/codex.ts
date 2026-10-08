import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { ConnectionError, hash } from "./security.js";

type Json = Record<string, any>;
/** Official app-server JSON-RPC only. This never reads or copies Codex credentials. */
export class CodexBridge {
  private process?: ReturnType<typeof spawn>;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve(value: Json): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private threadId?: string;
  version?: string;
  hostApprovalRequired = false;
  constructor(
    private executable = "codex",
    private cwd = process.cwd(),
  ) {}
  async start(): Promise<void> {
    if (this.process) return;
    const version = await promisify(execFile)(this.executable, ["--version"], {
      timeout: 10_000,
      maxBuffer: 16_384,
    });
    this.version = version.stdout.trim().slice(0, 120);
    const child = spawn(
      this.executable,
      ["app-server", "--listen", "stdio://"],
      { cwd: this.cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    this.process = child;
    child.stderr?.resume(); // Never put host credentials or raw provider errors into Sona logs.
    child.on("error", () =>
      this.failAll(
        new ConnectionError(
          "codex-start",
          "The Codex app-server could not start. Install a compatible official release.",
        ),
      ),
    );
    child.on("exit", () => {
      this.process = undefined;
      this.failAll(
        new ConnectionError(
          "codex-exit",
          "The Codex app-server stopped. Reconnect before another run.",
        ),
      );
    });
    createInterface({ input: child.stdout! }).on("line", (line) => {
      if (line.length > 8_000_000) {
        child.kill();
        return;
      }
      let message: Json;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.method && message.id !== undefined) {
        // Host approval is not bypassed by Sona's spoken approval. A host screen is unavailable here.
        this.hostApprovalRequired = true;
        child.stdin?.write(
          JSON.stringify({
            id: message.id,
            error: {
              code: -32001,
              message:
                "Sona cannot satisfy this host approval request. Complete the host approval through its supported UI.",
            },
          }) + "\n",
        );
        return;
      }
      const call = this.pending.get(message.id);
      if (!call) return;
      clearTimeout(call.timer);
      this.pending.delete(message.id);
      if (message.error)
        call.reject(
          new ConnectionError(
            "codex-rpc",
            `The Codex interface rejected this request (${Number(message.error.code) || "unknown"}). Check runtime compatibility and host permissions.`,
          ),
        );
      else call.resolve(message.result ?? {});
    });
    await this.call("initialize", {
      clientInfo: { name: "sona", title: "Sona", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    child.stdin?.write(
      JSON.stringify({ method: "initialized", params: {} }) + "\n",
    );
  }
  private failAll(error: Error): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }
  async call(method: string, params: Json, timeout = 30_000): Promise<Json> {
    if (!this.process?.stdin)
      throw new ConnectionError(
        "codex-start",
        "Start the Codex connection first.",
      );
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ConnectionError(
            "codex-timeout",
            "The Codex request timed out. A dispatched write has an unknown outcome.",
          ),
        );
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.process!.stdin!.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  async account(): Promise<{ id: string; label: string; workspace?: string }> {
    const result = await this.call("account/read", { refreshToken: false });
    if (result.account?.type !== "chatgpt" || !result.account.email)
      throw new ConnectionError(
        "codex-account",
        "Sign in to a ChatGPT account through the official Codex runtime. API-key sign-in does not prove ChatGPT app access.",
      );
    const workspace = result.workspaceRouting?.chatgptAccountId;
    return {
      id: hash({ email: result.account.email, workspace: workspace ?? null }),
      label: result.account.email,
      ...(workspace ? { workspace } : {}),
    };
  }
  async login(): Promise<{ authorizationUrl: string }> {
    await this.start();
    const result = await this.call("account/login/start", { type: "chatgpt" });
    const url = new URL(result.authUrl);
    if (
      url.protocol !== "https:" ||
      !["auth.openai.com", "auth0.openai.com", "chatgpt.com"].includes(
        url.hostname,
      )
    )
      throw new ConnectionError(
        "codex-login",
        "The runtime did not return a recognized official HTTPS sign-in URL.",
      );
    return { authorizationUrl: url.href };
  }
  private async thread(): Promise<string> {
    if (!this.threadId) {
      const result = await this.call("thread/start", {
        ephemeral: true,
        sandbox: "read-only",
        approvalPolicy: "untrusted",
        cwd: this.cwd,
      });
      if (typeof result.thread?.id !== "string")
        throw new ConnectionError(
          "codex-thread",
          "The runtime did not return a tool-call context.",
        );
      this.threadId = result.thread.id;
    }
    return this.threadId!;
  }
  async apps(): Promise<Json[]> {
    await this.start();
    const result = await this.call("app/list", { limit: 100 });
    return result.data ?? [];
  }
  async discover(server?: string): Promise<Json[]> {
    await this.start();
    const threadId = await this.thread();
    const rows: Json[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.call("mcpServerStatus/list", {
        threadId,
        detail: "toolsAndAuthOnly",
        limit: 100,
        ...(server ? { serverName: server } : {}),
        ...(cursor ? { cursor } : {}),
      });
      rows.push(...(result.data ?? []));
      cursor = result.nextCursor ?? undefined;
      if (rows.length > 10_000)
        throw new ConnectionError(
          "codex-catalog",
          "The runtime returned too many server records.",
        );
    } while (cursor);
    return rows;
  }
  async invoke(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    timeout: number,
  ): Promise<Json> {
    const result = await this.call(
      "mcpServer/tool/call",
      { threadId: await this.thread(), server, tool, arguments: args },
      timeout,
    );
    if (this.hostApprovalRequired)
      throw new ConnectionError(
        "host-approval",
        "The host needs its own approval UI. Sona did not bypass it.",
      );
    return result;
  }
  async close(): Promise<void> {
    this.process?.kill();
    this.process = undefined;
    this.threadId = undefined;
    this.failAll(new ConnectionError("closed", "The connection closed."));
  }
}
