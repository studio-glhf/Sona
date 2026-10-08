import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export class ConnectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function redact(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:sk-|ya29\.)[A-Za-z0-9_.-]+/g, "[REDACTED]")
      .replace(
        /([?&](?:code|token|access_token|refresh_token|client_secret|key)=)[^&\s]+/gi,
        "$1[REDACTED]",
      );
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /authorization|cookie|token|secret|password|api.?key|code.verifier/i.test(
          key,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return value;
}
export function safeError(error: unknown): string {
  if (error instanceof ConnectionError) return error.message;
  // Provider errors can contain credentials, personal data, and entire tool results.
  return "The connection request failed. Check its permissions and network access, then reconnect.";
}
export function assertEndpoint(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ConnectionError(
      "endpoint",
      "Enter an absolute HTTPS MCP endpoint.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    isPrivateHost(url.hostname)
  )
    throw new ConnectionError(
      "endpoint",
      "The endpoint must use public HTTPS without credentials, a query, or a fragment.",
    );
  return url;
}
export function isPrivateHost(host: string): boolean {
  const h = host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    (!h.includes(".") && !h.includes(":"))
  )
    return true;
  if (h.includes(":")) {
    if (h.startsWith("::ffff:")) return true;
    return h === "::" || h === "::1" || /^(fc|fd|fe[89ab]|ff)/i.test(h);
  }
  if (!isIP(h)) return false;
  const [a = 0, b = 0] = h.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224 ||
    (a === 198 && (b === 18 || b === 19))
  );
}
/** DNS-pinned, no-redirect HTTPS fetch. OAuth discovery is restricted to selected origins. */
export function publicFetch(allowedOrigins: string[]): typeof fetch {
  const origins = new Set(allowedOrigins.map((x) => new URL(x).origin));
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !origins.has(url.origin) ||
      isPrivateHost(url.hostname)
    )
      throw new ConnectionError(
        "network-origin",
        "The connection requested an origin outside its approved HTTPS origins.",
      );
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((x) => isPrivateHost(x.address)))
      throw new ConnectionError(
        "network-address",
        "The connection resolved to a private or reserved network address.",
      );
    const address = addresses[0]!;
    const request =
      input instanceof Request && init ? new Request(input, init) : req;
    const body = request.body
      ? Buffer.from(await request.arrayBuffer())
      : undefined;
    return await new Promise<Response>((resolve, reject) => {
      const outgoing = httpsRequest(
        url,
        {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          signal: request.signal,
          lookup: ((
            _host: string,
            options: { all?: boolean },
            callback: (...args: unknown[]) => void,
          ) =>
            options?.all
              ? callback(null, [address])
              : callback(null, address.address, address.family)) as never,
          timeout: 30_000,
        },
        (incoming) => {
          if (
            incoming.statusCode &&
            incoming.statusCode >= 300 &&
            incoming.statusCode < 400
          ) {
            incoming.destroy();
            reject(
              new ConnectionError(
                "redirect",
                "The connection redirected its request. Review and import the final endpoint.",
              ),
            );
            return;
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers))
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          const status = incoming.statusCode ?? 502;
          resolve(
            new Response(
              [204, 205, 304].includes(status) || request.method === "HEAD"
                ? null
                : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>),
              { status, headers },
            ),
          );
        },
      );
      outgoing.on("timeout", () =>
        outgoing.destroy(
          new ConnectionError("timeout", "The connection request timed out."),
        ),
      );
      outgoing.on("error", reject);
      if (body) outgoing.write(body);
      outgoing.end();
    });
  }) as typeof fetch;
}
export function getPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  if (!pointer.startsWith("/"))
    throw new ConnectionError(
      "pointer",
      "Use a JSON pointer that starts with /.",
    );
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[
              key.replace(/~1/g, "/").replace(/~0/g, "~")
            ]
          : undefined,
      value,
    );
}
export function setPointer(
  value: Record<string, unknown>,
  pointer: string,
  data: unknown,
): void {
  const keys = pointer
    .slice(1)
    .split("/")
    .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (
    !pointer.startsWith("/") ||
    keys.some((k) => ["__proto__", "constructor", "prototype"].includes(k))
  )
    throw new ConnectionError("pointer", "The field pointer is invalid.");
  let node = value;
  for (const key of keys.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys.at(-1)!] = data;
}
