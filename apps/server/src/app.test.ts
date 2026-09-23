import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '@sona/shared';
import { buildApp } from './app.js';

const apps: ReturnType<typeof buildApp>[] = [];
const testKey = 'synthetic-key-never-real';
function make(upstreamFetch = vi.fn<typeof fetch>()) {
  const app = buildApp({ upstreamFetch });
  apps.push(app);
  return { app, upstreamFetch };
}
const request = {
  method: 'POST' as const,
  url: '/api/realtime/sessions',
  headers: { origin: 'http://localhost:5173' },
  payload: { apiKey: testKey, config: defaultConfig },
};
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('session credential broker', () => {
  it('exchanges the key only with OpenAI and returns only temporary credentials', async () => {
    const { app, upstreamFetch } = make();
    upstreamFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          value: 'ek_synthetic',
          expires_at: 123,
          session: { apiKey: testKey },
        }),
      ),
    );
    const res = await app.inject(request);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      clientSecret: 'ek_synthetic',
      expiresAt: 123,
    });
    expect(res.body).not.toContain(testKey);
    expect(res.headers['cache-control']).toBe('no-store');
    const [url, init] = upstreamFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${testKey}` });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      expires_after: { seconds: 60 },
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        tools: [],
        tracing: null,
      },
    });
  });
  it.each([undefined, 'https://attacker.example', 'null'])(
    'rejects untrusted origin %s before calling OpenAI',
    async (origin) => {
      const { app, upstreamFetch } = make();
      const res = await app.inject({
        ...request,
        headers: origin ? { origin } : {},
      });
      expect(res.statusCode).toBe(403);
      expect(upstreamFetch).not.toHaveBeenCalled();
    },
  );
  it('rejects out-of-range settings and unknown body fields without echoing inputs', async () => {
    const { app, upstreamFetch } = make();
    const res = await app.inject({
      ...request,
      payload: {
        apiKey: testKey,
        config: { ...defaultConfig, threshold: 9 },
        url: 'https://attacker.example',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(testKey);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'invalid_key', 401],
    [429, 'rate_limited', 429],
    [500, 'connection_failed', 502],
  ] as const)(
    'sanitizes upstream status %s',
    async (status, code, expected) => {
      const { app, upstreamFetch } = make();
      upstreamFetch.mockResolvedValue(
        new Response(`secret:${testKey}`, { status }),
      );
      const res = await app.inject(request);
      expect(res.statusCode).toBe(expected);
      expect(res.json()).toEqual({ error: code });
    },
  );
  it('handles network failures without exposing exception text', async () => {
    const { app, upstreamFetch } = make();
    upstreamFetch.mockRejectedValue(new Error(testKey));
    const res = await app.inject(request);
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain(testKey);
  });
  it('rejects malformed upstream success payloads', async () => {
    const { app, upstreamFetch } = make();
    upstreamFetch.mockResolvedValue(new Response('{}'));
    expect((await app.inject(request)).statusCode).toBe(502);
  });
  it('does not expose wildcard cross-origin access', async () => {
    const { app } = make();
    const res = await app.inject({
      method: 'OPTIONS',
      url: request.url,
      headers: { origin: 'https://attacker.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
