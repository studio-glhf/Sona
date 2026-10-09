import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { ApiOperation, Schema } from "./types.js";

const sourceDirectory = existsSync(
  new URL("../source/openai.json.gz", import.meta.url),
)
  ? new URL("../source/", import.meta.url)
  : new URL("./api-source/", import.meta.url);
const sourceBytes = gunzipSync(
  readFileSync(new URL("openai.json.gz", sourceDirectory)),
);
export const sourceRevision = createHash("sha256")
  .update(sourceBytes)
  .digest("hex");
export const sourceProvenance = JSON.parse(
  readFileSync(new URL("provenance.json", sourceDirectory), "utf8"),
);
export const openapiDocument = JSON.parse(
  sourceBytes.toString("utf8"),
) as Record<string, any>;
const verbs = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
export function resolveReference(ref: string): any {
  if (!ref.startsWith("#/"))
    throw new Error("External schema references are not permitted.");
  let value: any = openapiDocument;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!Object.hasOwn(value ?? {}, key))
      throw new Error(`Unknown schema reference: ${ref}`);
    value = value[key];
  }
  return value;
}
export function dereference<T = any>(value: any): T {
  return value?.$ref
    ? {
        ...resolveReference(value.$ref),
        ...Object.fromEntries(
          Object.entries(value).filter(([k]) => k !== "$ref"),
        ),
      }
    : value;
}
function responseTypes(responses: Record<string, any>): string[] {
  return [
    ...new Set(
      Object.values(responses).flatMap((r) =>
        Object.keys(dereference(r).content ?? {}),
      ),
    ),
  ];
}
const operations: ApiOperation[] = Object.entries(
  openapiDocument.paths,
).flatMap(([path, item]: [string, any]) =>
  Object.entries(item)
    .filter(([method]) => verbs.has(method))
    .map(([method, value]: [string, any]) => {
      const requestBody = value.requestBody
        ? dereference<ApiOperation["requestBody"]>(value.requestBody)
        : undefined;
      const contentTypes = Object.keys(requestBody?.content ?? {});
      const family = path
        .replace(/^\/beta\//, "/")
        .split("/")[1]!
        .split("?")[0]!;
      const rTypes = responseTypes(value.responses ?? {});
      return {
        id: value.operationId ?? `${method}-${path}`,
        method: method.toUpperCase(),
        path,
        family,
        title: value.summary ?? value.operationId ?? path,
        description: value.description ?? "",
        parameters: [
          ...(item.parameters ?? []),
          ...(value.parameters ?? []),
        ].map((p) => dereference(p)),
        requestBody,
        responses: value.responses ?? {},
        contentTypes,
        responseTypes: rTypes,
        credentialClass: /^(organization|projects)$/.test(family)
          ? "admin"
          : "project",
        requiresIntent: !["get", "head", "options"].includes(method),
        destructive: method === "delete",
        deprecated: Boolean(value.deprecated),
        preview: Boolean(
          value["x-oaiMeta"]?.beta || /beta|preview/i.test(value.summary ?? ""),
        ),
        source: `${sourceProvenance.source}#/paths/${path.replace(/~/g, "~0").replace(/\//g, "~1")}/${method}`,
        sourceRevision,
        handlers: [
          "http",
          ...(contentTypes.includes("multipart/form-data")
            ? ["multipart"]
            : []),
          ...(rTypes.includes("text/event-stream") ? ["sse"] : []),
          ...(rTypes.some((t) => /audio|video|image|octet-stream/.test(t))
            ? ["binary"]
            : []),
          ...(value.parameters?.some((p: any) =>
            /^(after|before|cursor|page|offset)$/.test(p.name),
          )
            ? ["pagination"]
            : []),
          ...(/cancel/.test(path) ? ["cancel"] : []),
        ],
        lifecycle: value.deprecated ? "deprecated" : "documented",
        lifecycleVerified: false,
      } satisfies ApiOperation;
    }),
);
const byId = new Map(operations.map((op) => [op.id, op]));
if (byId.size !== operations.length)
  throw new Error("Duplicate operation identifiers in source.");
export function listOperations(query?: string): ApiOperation[] {
  if (!query?.trim()) return operations;
  const terms = query.toLowerCase().split(/\s+/);
  return operations.filter((op) =>
    terms.every((t) =>
      `${op.id} ${op.title} ${op.description} ${op.family} ${op.path}`
        .toLowerCase()
        .includes(t),
    ),
  );
}
export function getOperation(id: string): ApiOperation {
  const operation = byId.get(id);
  if (!operation) throw new Error(`Unknown API operation: ${id}`);
  return operation;
}
/** Preserve original schemas and their references; clients can resolve all returned refs without network access. */
export function getOperationSchema(id: string) {
  const operation = getOperation(id);
  const components: Record<string, any> = {};
  const visited = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (value.$ref && !visited.has(value.$ref)) {
      visited.add(value.$ref);
      const path = value.$ref.slice(2).split("/");
      let node = components;
      for (const segment of path.slice(1, -1)) node = node[segment] ??= {};
      const target = resolveReference(value.$ref);
      node[path.at(-1)!] = target;
      visit(target);
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(operation);
  return {
    operation,
    components,
    sourceRevision,
    schemaDialect: "https://json-schema.org/draft/2020-12/schema",
  };
}
export function getNamedSchema(name: string): Schema {
  return resolveReference(`#/components/schemas/${name}`);
}
export function getTransportSchemas() {
  const names = Object.keys(openapiDocument.components.schemas).filter((n) =>
    /^(Realtime.*(?:Client|Server)Event|Live(?:Client|Server|SidebandClient|SidebandServer|ForkClient|ForkServer)Event)$/.test(
      n,
    ),
  );
  return names.map((name) => ({
    name,
    schema: getNamedSchema(name),
    sourceRevision,
  }));
}
export function getWebhookSchemas() {
  return openapiDocument.webhooks as Record<string, any>;
}
export interface ParameterDescriptor {
  pointer: string;
  schema: Schema;
  required: boolean;
  defaultDocumented: boolean;
  defaultValue?: unknown;
  changeTiming: string;
  modelRestrictions: string;
  source: string;
}
export function describeParameters(id: string): ParameterDescriptor[] {
  const operation = getOperation(id);
  const fields: ParameterDescriptor[] = [];
  const walk = (
    schema: Schema,
    pointer: string,
    required: boolean,
    ancestors = new Set<string>(),
  ) => {
    const node = dereference<Record<string, any>>(schema);
    if (!node || typeof node !== "object") return;
    fields.push({
      pointer,
      schema,
      required,
      defaultDocumented: Object.hasOwn(node, "default"),
      ...(Object.hasOwn(node, "default") ? { defaultValue: node.default } : {}),
      changeTiming:
        "Next API request. A measured voice configuration stays fixed.",
      modelRestrictions:
        node.description ??
        "Not documented in this field. The provider validates account and model restrictions.",
      source: operation.source,
    });
    const next = new Set(ancestors);
    if ((schema as any).$ref) {
      if (next.has((schema as any).$ref)) return;
      next.add((schema as any).$ref);
    }
    for (const [key, child] of Object.entries(node.properties ?? {}))
      walk(
        child as Schema,
        `${pointer}/${key}`,
        node.required?.includes(key) ?? false,
        next,
      );
    if (node.items) walk(node.items, `${pointer}/*`, false, next);
    for (const type of ["oneOf", "anyOf", "allOf"])
      for (const [index, child] of (node[type] ?? []).entries())
        walk(child, `${pointer}/${type}/${index}`, false, next);
  };
  for (const parameter of operation.parameters)
    walk(
      parameter.schema ?? {},
      `/${parameter.in}/${parameter.name}`,
      !!parameter.required,
    );
  for (const [type, content] of Object.entries(
    operation.requestBody?.content ?? {},
  ))
    walk(
      content.schema ?? {},
      `/body(${type})`,
      !!operation.requestBody?.required,
    );
  return fields;
}
