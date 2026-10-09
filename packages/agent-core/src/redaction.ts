const privateKey =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|client_secret|access_token|refresh_token|id_token|api[_-]?key|credential|credentials|token|private_key)$/i;
const secretPattern =
  /\b(?:sk-(?:proj-|admin-|svcacct-)?[A-Za-z0-9_-]{12,}|ek_[A-Za-z0-9_-]{12,}|ya29\.[A-Za-z0-9._-]+|Bearer\s+[A-Za-z0-9._~+\/-]+=*)/gi;

/** Redact before persistence or display. Explicit secrets cover arbitrary credential formats. */
export function redact<T = unknown>(
  value: T,
  secrets: readonly string[] = [],
  sensitiveFields: readonly string[] = [],
): T {
  const seen = new WeakSet<object>();
  const scrub = (input: unknown, key = "", depth = 0): unknown => {
    if (privateKey.test(key) || sensitiveFields.includes(key))
      return "[REDACTED]";
    if (typeof input === "string") {
      let result = input.replace(secretPattern, "[REDACTED]");
      for (const secret of secrets)
        if (secret) result = result.split(secret).join("[REDACTED]");
      // OAuth codes, tokens and client secrets must not escape in diagnostic URLs.
      return result.replace(
        /([?&](?:code|access_token|refresh_token|client_secret|api_key|token)=)[^&#\s]*/gi,
        "$1[REDACTED]",
      );
    }
    if (input === null || typeof input !== "object") return input;
    if (depth > 40 || seen.has(input)) return "[UNAVAILABLE]";
    seen.add(input);
    const result = Array.isArray(input)
      ? input.map((item) => scrub(item, "", depth + 1))
      : Object.fromEntries(
          Object.entries(input).map(([field, item]) => [
            field,
            scrub(item, field, depth + 1),
          ]),
        );
    seen.delete(input);
    return result;
  };
  return scrub(value) as T;
}

export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
