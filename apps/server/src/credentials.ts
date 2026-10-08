import { redact } from "../../../packages/agent-core/src/index.js";

/** Project credentials belong to this server run, never the study database. */
export class SessionCredentials {
  private project?: string;
  private source: "session" | "environment" | "none";
  private retired = new Set<string>();
  private leases = 0;
  private isBusy = () => false;
  constructor(private readonly env: NodeJS.ProcessEnv) {
    this.project = env.OPENAI_API_KEY || undefined;
    this.source = this.project ? "environment" : "none";
    if (this.project) this.retired.add(this.project);
  }
  setBusyCheck(check: () => boolean) {
    this.isBusy = check;
  }
  get apiKey() {
    return this.project;
  }
  get secrets() {
    return [
      ...this.retired,
      this.env.OPENAI_ADMIN_KEY ?? "",
      this.env.GOOGLE_CLIENT_SECRET ?? "",
      this.env.OPENAI_WEBHOOK_SECRET ?? "",
    ].filter(Boolean);
  }
  safe<T>(value: T): T {
    return redact(value, this.secrets);
  }
  status() {
    return {
      openai: {
        configured: Boolean(this.project),
        source: this.source,
        storage: "memory" as const,
      },
    };
  }
  private assertIdle() {
    if (this.leases || this.isBusy())
      throw Object.assign(
        new Error(
          "End the active test or API operation before changing the API key.",
        ),
        { statusCode: 409, code: "CREDENTIAL_IN_USE" },
      );
  }
  set(apiKey: unknown) {
    this.assertIdle();
    if (typeof apiKey === "string") apiKey = apiKey.trim();
    if (
      typeof apiKey !== "string" ||
      apiKey.startsWith("sk-admin-") ||
      !/^sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{12,1024}$/.test(apiKey)
    )
      throw Object.assign(
        new Error(
          "Enter an OpenAI project API key. Sona checks its format here, not its access.",
        ),
        { statusCode: 400, code: "INVALID_PROJECT_API_KEY" },
      );
    this.project = apiKey;
    this.retired.add(apiKey);
    this.source = "session";
    return this.status();
  }
  remove() {
    this.assertIdle();
    // Never fall back to a preseeded environment key after an explicit removal.
    this.project = undefined;
    this.source = "none";
    return this.status();
  }
  acquire() {
    this.leases++;
    let released = false;
    return {
      credentials: {
        project: this.project,
        admin: this.env.OPENAI_ADMIN_KEY,
        projectId: this.env.OPENAI_PROJECT_ID,
      },
      release: () => {
        if (released) return;
        released = true;
        this.leases--;
      },
    };
  }
  clear() {
    this.project = undefined;
    this.retired.clear();
    this.source = "none";
  }
}
