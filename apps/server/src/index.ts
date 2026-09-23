import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const staticRoot = fileURLToPath(new URL('../../web/dist', import.meta.url));
const origin = process.env.SONA_ORIGIN;
if (origin) {
  const parsed = new URL(origin);
  if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('SONA_ORIGIN must be an HTTPS origin, or an HTTP localhost origin.');
  }
}
const app = buildApp({ origin, staticRoot: existsSync(staticRoot) ? staticRoot : undefined });
const host = process.env.HOST ?? '127.0.0.1';
if (!origin && !['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('Set SONA_ORIGIN before exposing the server beyond localhost.');
}
const port = Number(process.env.PORT ?? 3001);
await app.listen({ host, port });
console.info(`Sona listening at http://${host}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void app.close().then(() => process.exit(0)); });
}
