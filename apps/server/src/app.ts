import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { createSessionSchema, realtimeSession } from '@sona/shared';

export type AppOptions = {
  upstreamFetch?: typeof fetch;
  origin?: string;
  staticRoot?: string;
};

export function buildApp(options: AppOptions = {}) {
  // Request logging stays disabled: the broker receives a researcher-owned secret.
  const app = Fastify({ logger: false, bodyLimit: 32768, requestTimeout: 15000 });
  const upstreamFetch = options.upstreamFetch ?? fetch;
  const origin = options.origin ?? 'http://localhost:5173';
  const allowedOrigins = new Set([origin]);
  if (!options.origin) {
    for (const host of ['localhost', '127.0.0.1']) {
      for (const port of [5173, 3001]) allowedOrigins.add(`http://${host}:${port}`);
    }
  }
  app.register(rateLimit, { global: false });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'microphone=(self), camera=()');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.openai.com; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const status = code === 429 ? 429 : code >= 400 && code < 500 ? code : 500;
    reply.code(status).send({ error: status === 429 ? 'rate_limited' : status < 500 ? 'invalid_config' : 'connection_failed' });
  });
  app.get('/api/health', async () => ({ status: 'ok', version: '0.1.0' }));
  app.post('/api/realtime/sessions', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!request.headers.origin || !allowedOrigins.has(request.headers.origin)) {
      return reply.code(403).send({ error: 'connection_failed' });
    }
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_config' });

    // The key exists only in this request. Never include upstream bodies in errors.
    try {
      const response = await upstreamFetch('https://api.openai.com/v1/realtime/client_secrets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${parsed.data.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_after: { anchor: 'created_at', seconds: 60 }, session: realtimeSession(parsed.data.config) }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401) return reply.code(401).send({ error: 'invalid_key' });
        if (response.status === 429) return reply.code(429).send({ error: 'rate_limited' });
        return reply.code(502).send({ error: 'connection_failed' });
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('value' in result) || typeof result.value !== 'string' || !('expires_at' in result) || typeof result.expires_at !== 'number') {
        return reply.code(502).send({ error: 'connection_failed' });
      }
      return { clientSecret: result.value, expiresAt: result.expires_at };
    } catch {
      return reply.code(503).send({ error: 'connection_failed' });
    }
  });
  if (options.staticRoot) {
    app.register(staticFiles, { root: options.staticRoot, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
