import type {
  ApiOperation,
  ApiParameter,
  ApiRecipe,
  JsonValue,
} from "./types.js";
const text = (value: unknown): string =>
  value === null ? "null" : String(value);
function scalar(value: JsonValue): string {
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return text(value);
}
function encoded(value: unknown): string {
  return encodeURIComponent(text(value)).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
function objectPairs(value: Record<string, JsonValue>) {
  return Object.entries(value).flatMap(([key, v]) => [key, scalar(v)]);
}
export function serializePath(
  parameter: ApiParameter,
  value: JsonValue,
): string {
  const style = parameter.style ?? "simple";
  const explode = parameter.explode ?? false;
  let result = Array.isArray(value)
    ? value
        .map((v) => encoded(scalar(v)))
        .join(style === "label" && explode ? "." : ",")
    : value && typeof value === "object"
      ? explode
        ? Object.entries(value)
            .map(([key, v]) => `${encoded(key)}=${encoded(scalar(v))}`)
            .join(",")
        : objectPairs(value).map(encoded).join(",")
      : encoded(scalar(value));
  if (style === "label") result = `.${result}`;
  if (style === "matrix") result = `;${encoded(parameter.name)}=${result}`;
  return result;
}
export function appendQuery(
  search: URLSearchParams,
  parameter: ApiParameter,
  value: JsonValue,
): void {
  const style = parameter.style ?? "form";
  const explode = parameter.explode ?? style === "form";
  const name = parameter.name;
  if (
    style === "deepObject" &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const walk = (v: JsonValue, key: string) => {
      if (v && typeof v === "object")
        for (const [k, item] of Object.entries(v)) walk(item, `${key}[${k}]`);
      else search.append(key, scalar(v));
    };
    walk(value, name);
    return;
  }
  if (Array.isArray(value)) {
    if (explode) for (const v of value) search.append(name, scalar(v));
    else
      search.append(
        name,
        value
          .map(scalar)
          .join(
            style === "spaceDelimited"
              ? " "
              : style === "pipeDelimited"
                ? "|"
                : ",",
          ),
      );
  } else if (value && typeof value === "object") {
    if (explode)
      for (const [key, v] of Object.entries(value))
        search.append(key, scalar(v));
    else search.append(name, objectPairs(value).join(","));
  } else search.append(name, scalar(value));
}
export function buildRequest(op: ApiOperation, recipe: ApiRecipe) {
  let path = op.path;
  for (const parameter of op.parameters.filter((p) => p.in === "path"))
    path = path.replace(
      `{${parameter.name}}`,
      serializePath(parameter, recipe.path![parameter.name]!),
    );
  if (/[{}]/.test(path)) throw new Error("Unresolved API path parameter.");
  const url = new URL(`https://api.openai.com/v1${path}`);
  for (const parameter of op.parameters.filter((p) => p.in === "query"))
    if (recipe.query?.[parameter.name] !== undefined)
      appendQuery(url.searchParams, parameter, recipe.query[parameter.name]!);
  const headers = new Headers();
  for (const [name, value] of Object.entries(recipe.headers ?? {})) {
    if (
      /^(authorization|cookie|host|proxy-|content-length|connection|transfer-encoding)/i.test(
        name,
      )
    )
      throw new Error("Authentication and transport headers are server-owned.");
    headers.set(
      name,
      Array.isArray(value) ? value.map(scalar).join(",") : scalar(value),
    );
  }
  // These official examples require the beta header although the operation
  // parameter list omits it. Keep the mapping limited to those source families.
  if (
    ["assistants", "threads"].includes(op.family) &&
    !headers.has("OpenAI-Beta")
  )
    headers.set("OpenAI-Beta", "assistants=v2");
  const type = recipe.contentType ?? op.contentTypes[0];
  let body: BodyInit | undefined;
  if (
    type === "multipart/form-data" &&
    (recipe.body !== undefined || recipe.files)
  ) {
    const form = new FormData();
    const encodings = op.requestBody?.content[type]?.encoding ?? {};
    const append = (name: string, value: JsonValue) => {
      const encoding = encodings[name];
      if (encoding?.contentType === "application/json") {
        form.append(
          name,
          new Blob([JSON.stringify(value)], { type: "application/json" }),
        );
        return;
      }
      if (encoding?.contentType && typeof value === "string") {
        form.append(name, new Blob([value], { type: encoding.contentType }));
        return;
      }
      if (Array.isArray(value)) {
        for (const child of value) append(`${name}[]`, child);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value))
          append(`${name}[${key}]`, child);
      } else form.append(name, scalar(value));
    };
    for (const [name, value] of Object.entries(
      (recipe.body as Record<string, JsonValue>) ?? {},
    ))
      append(name, value);
    for (const [name, input] of Object.entries(recipe.files ?? {}))
      for (const file of Array.isArray(input) ? input : [input])
        form.append(
          Array.isArray(input) ? `${name}[]` : name,
          new Blob([new Uint8Array(file.data)], {
            type: file.mediaType ?? "application/octet-stream",
          }),
          file.name,
        );
    body = form;
  } else if (recipe.body !== undefined) {
    headers.set("Content-Type", type ?? "application/json");
    body =
      type === "application/sdp"
        ? String(recipe.body)
        : JSON.stringify(recipe.body);
  }
  return {
    url,
    init: { method: op.method, headers, body, redirect: "error" as const },
  };
}
