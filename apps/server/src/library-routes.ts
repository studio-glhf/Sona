import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as library from "../../../packages/api-library/src/index.js";
import type { SonaStore } from "./storage/index.js";
import type { VoiceService } from "./voice.js";
import type { SessionCredentials } from "./credentials.js";
export async function registerLibraryTransports(
  app: FastifyInstance,
  {
    store,
    env,
    voice,
    credentials,
  }: {
    store: SonaStore;
    env: NodeJS.ProcessEnv;
    voice: VoiceService;
    credentials: SessionCredentials;
  },
) {
  const streams = new Map<
    string,
    {
      owner: string;
      events: unknown[];
      status: string;
      connection: ReturnType<typeof library.openApiStream>;
      release: () => void;
    }
  >();
  const runs = new Map<
    string,
    {
      owner: string;
      controller: AbortController;
      status: string;
      result?: unknown;
      error?: string;
    }
  >();
  const deliveries: unknown[] = [];
  app.get("/api/library/webhooks", async () => ({
    configured: Boolean(env.OPENAI_WEBHOOK_SECRET),
    deliveries,
    retention: "Memory only; cleared on server restart.",
  }));
  const decode = (input: any) => ({
    ...input,
    files: input.files
      ? Object.fromEntries(
          Object.entries(input.files).map(([k, v]: [string, any]) => [
            k,
            {
              name: v.name,
              mediaType: v.mediaType,
              data: new Uint8Array(
                Buffer.from(v.dataBase64 ?? v.base64 ?? "", "base64"),
              ),
            },
          ]),
        )
      : undefined,
  });
  const own = (req: any) => {
    const run = streams.get(req.params.id);
    if (!run || run.owner !== req.cookies.sona)
      throw new Error("This API stream belongs to another local session.");
    return run;
  };
  app.get("/api/library/transports", async () => ({
    targets: ["realtime", "live", "live-sideband", "live-fork"],
    schemas: library.getTransportSchemas(),
    webhooks: library.getWebhookSchemas(),
  }));
  app.post("/api/library/streams", async (req) => {
    const input = req.body as any;
    if (!input || input.intent !== true)
      throw new Error("Explicit intent is necessary for an API stream.");
    const target = input.target as library.StreamTarget;
    if (
      target?.kind === "realtime" &&
      target.callId &&
      [...voice.calls.values()].some((c) => c.remoteId === target.callId)
    )
      throw new Error("The API library cannot control a measured voice call.");
    const id = randomUUID(),
      events: unknown[] = [];
    let state = "connecting";
    const lease = credentials.acquire();
    let connection;
    try {
      connection = library.openApiStream(target, {
        credentials: lease.credentials,
        confirmed: true,
        maxDurationMs: 120_000,
        onEvent(event) {
          events.push(credentials.safe(event));
          if (events.length > 5000) events.shift();
          const run = streams.get(id);
          if (run) run.status = "open";
        },
        onError(error) {
          events.push({ type: "error", message: credentials.safe(error) });
          const run = streams.get(id);
          if (run) run.status = "error";
        },
        onClose() {
          lease.release();
          const run = streams.get(id);
          if (run) run.status = "closed";
        },
      });
    } catch (error) {
      lease.release();
      throw error;
    }
    streams.set(id, {
      owner: req.cookies.sona ?? "",
      events,
      status: state,
      connection,
      release: lease.release,
    });
    return { id, status: state, maxDurationMs: 120_000 };
  });
  app.get("/api/library/streams/:id", async (req) => {
    const run = own(req);
    return { events: run.events, status: run.status };
  });
  app.post("/api/library/streams/:id/events", async (req) => {
    const run = own(req);
    run.connection.send((req.body as any).event);
    return { sent: true };
  });
  app.delete("/api/library/streams/:id", async (req) => {
    const run = own(req);
    run.connection.close();
    // Keep the credential lease until the socket confirms closure.
    run.status = "closed";
    return { closed: true };
  });
  const ownRun = (req: any) => {
    const run = runs.get(req.params.id);
    if (!run || run.owner !== req.cookies.sona)
      throw new Error("This API observation belongs to another local session.");
    return run;
  };
  app.get("/api/library/runs/:id", async (req) => {
    const run = ownRun(req);
    return {
      id: (req.params as any).id,
      status: run.status,
      result: run.result,
      error: run.error,
    };
  });
  app.post("/api/library/runs/:id/cancel", async (req) => {
    const run = ownRun(req);
    run.controller.abort();
    run.status = "canceled";
    return {
      canceled: true,
      limitation:
        "Canceling local observation does not cancel a remote job. Use its documented cancellation operation.",
    };
  });
  for (const kind of ["paginate", "poll"] as const)
    app.post(`/api/library/${kind}`, async (req) => {
      const input = req.body as any;
      library.assertRecipe(decode(input.recipe));
      const id = randomUUID(),
        controller = new AbortController(),
        run = {
          owner: req.cookies.sona ?? "",
          controller,
          status: "running",
          result: undefined as unknown,
          error: undefined as string | undefined,
        };
      if (runs.size >= 100) {
        const finished = [...runs].find(([, r]) => r.status !== "running");
        if (finished) runs.delete(finished[0]);
        else
          throw new Error(
            "Too many API observations. Stop an existing observation.",
          );
      }
      const lease = credentials.acquire();
      runs.set(id, run);
      void (async () => {
        try {
          if (kind === "paginate") {
            const maxPages = Math.min(10, Math.max(1, input.maxPages ?? 3)),
              pages = [];
            for await (const page of library.paginateRecipe(
              decode(input.recipe),
              { credentials: lease.credentials, signal: controller.signal },
              maxPages,
            ))
              pages.push(page);
            run.result = credentials.safe({
              pages,
              maxPages,
              limitReached: pages.length === maxPages,
            });
          } else
            run.result = credentials.safe(
              await library.pollRecipe(
                decode(input.recipe),
                { credentials: lease.credentials, signal: controller.signal },
                {
                  maxPolls: Math.min(30, Math.max(1, input.maxPolls ?? 10)),
                  intervalMs: 1000,
                },
              ),
            );
          run.status = controller.signal.aborted ? "canceled" : "completed";
        } catch (error) {
          run.status = controller.signal.aborted ? "canceled" : "failed";
          run.error = credentials.safe(
            error instanceof Error ? error.message : "API observation failed.",
          );
        } finally {
          lease.release();
        }
      })();
      return { id, status: run.status };
    });
  // This handler verifies the exact signed bytes before JSON parsing. It does not publish an endpoint.
  await app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_req, body, done) => done(null, body),
    );
    hooks.post("/api/webhooks/openai", async (req, reply) => {
      if (!env.OPENAI_WEBHOOK_SECRET)
        return reply.code(503).send({
          error:
            "A server-side webhook signing secret is missing. A reachable HTTPS callback is also necessary.",
        });
      const headers = Object.fromEntries(
        Object.entries(req.headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      const result = await library.receiveWebhook(
        String(req.body),
        headers,
        env.OPENAI_WEBHOOK_SECRET,
        async (id) => {
          if (store.metadata.get(`webhook:${id}`)) return false;
          store.metadata.set(`webhook:${id}`, {
            receivedAt: new Date().toISOString(),
          });
          return true;
        },
      );
      if (result.accepted && !result.duplicate) {
        deliveries.push(
          credentials.safe({
            receivedAt: new Date().toISOString(),
            event: result.event,
          }),
        );
        if (deliveries.length > 100) deliveries.shift();
      }
      return { accepted: result.accepted, duplicate: result.duplicate };
    });
  });
  app.addHook("onClose", async () => {
    for (const s of streams.values()) {
      s.connection.close();
      s.release();
    }
    for (const r of runs.values()) r.controller.abort();
  });
}
