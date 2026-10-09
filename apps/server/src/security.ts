import type { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";

export async function installSecurity(
  app: FastifyInstance,
  port: number,
  development = false,
  webPort = 5173,
) {
  await app.register(cookie);
  const sessions = new Map<string, { token: string; expires: number }>();
  const hosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  if (development) {
    if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535)
      throw new Error("Select a valid local development browser port.");
    origins.add(`http://127.0.0.1:${webPort}`);
    origins.add(`http://localhost:${webPort}`);
  }
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store")
      .header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(self), speaker-selection=(self)",
    );
    if (!hosts.has(req.headers.host ?? ""))
      return reply.code(403).send({ error: "Unrecognized local host." });
    const isCallback = req.url.split("?")[0] === "/api/oauth/callback";
    if (req.headers.origin && !origins.has(req.headers.origin))
      return reply.code(403).send({ error: "Unrelated browser origin." });
    if (req.headers["sec-fetch-site"] === "cross-site" && !isCallback)
      return reply.code(403).send({ error: "Cross-site access is blocked." });
    if (
      !req.url.startsWith("/api/") ||
      req.url.startsWith("/api/bootstrap") ||
      req.url === "/api/health" ||
      isCallback ||
      req.url === "/api/webhooks/openai"
    )
      return;
    const session = sessions.get(req.cookies.sona ?? "");
    const token = req.headers["x-sona-token"];
    if (
      !session ||
      session.expires < Date.now() ||
      typeof token !== "string" ||
      token.length !== session.token.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(session.token))
    )
      return reply
        .code(401)
        .send({ error: "The local session expired. Reload Sona." });
  });
  return {
    bootstrap(req: any, reply: any) {
      for (const [key, s] of sessions)
        if (s.expires < Date.now()) sessions.delete(key);
      let id = req.cookies.sona,
        session = sessions.get(id);
      if (!session) {
        if (sessions.size >= 1000)
          sessions.delete(sessions.keys().next().value!);
        id = randomBytes(32).toString("hex");
        session = {
          token: randomBytes(32).toString("hex"),
          expires: Date.now() + 12 * 3600_000,
        };
        sessions.set(id, session);
      }
      reply.setCookie("sona", id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 3600,
      });
      return session.token;
    },
  };
}
