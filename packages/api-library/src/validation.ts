import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import { getOperation, openapiDocument } from "./catalog.js";
import type {
  ApiRecipe,
  Schema,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

// OpenAPI's retained nullable keyword is not a JSON Schema 2020-12 keyword.
// This explicit compatibility layer adds the documented null branch. It does not
// apply defaults, strip fields, coerce values, or change the published source.
function nullableSchema(value: any): any {
  if (Array.isArray(value)) return value.map(nullableSchema);
  if (!value || typeof value !== "object") return value;
  const node = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "nullable")
      .map(([key, child]) => [key, nullableSchema(child)]),
  );
  return value.nullable === true ? { anyOf: [node, { type: "null" }] } : node;
}
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  inlineRefs: false,
  validateFormats: true,
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
});
addFormats(ajv);
ajv.addFormat("binary", true);
ajv.addFormat("byte", true);
const schemaId = "https://sona.local/schemas/openai";
ajv.addSchema({ ...nullableSchema(openapiDocument), $id: schemaId });
const validators = new Map<string, ValidateFunction>();
function externalRefs(schema: any): any {
  if (Array.isArray(schema)) return schema.map(externalRefs);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      key === "$ref" && typeof value === "string" && value.startsWith("#/")
        ? `${schemaId}${value}`
        : externalRefs(value),
    ]),
  );
}
export function validateSchema(
  schema: Schema,
  value: unknown,
): ValidationResult {
  const key = JSON.stringify(schema);
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile(externalRefs(nullableSchema(schema)));
    validators.set(key, validate);
  }
  const valid = validate(value) as boolean;
  return {
    valid,
    issues: valid
      ? []
      : (validate.errors ?? []).map((error: ErrorObject) => ({
          location: error.instancePath || "/",
          message: error.message ?? "Invalid value",
          keyword: error.keyword,
        })),
  };
}
export function validateNamedSchema(
  name: string,
  value: unknown,
): ValidationResult {
  return validateSchema({ $ref: `#/components/schemas/${name}` }, value);
}
export function validateRecipe(recipe: ApiRecipe): ValidationResult {
  const issues: ValidationIssue[] = [];
  let op;
  try {
    op = getOperation(recipe.operationId);
  } catch {
    return {
      valid: false,
      issues: [{ location: "/operationId", message: "Unknown API operation." }],
    };
  }
  for (const location of ["path", "query", "header"] as const) {
    const source =
      location === "header" ? (recipe.headers ?? {}) : (recipe[location] ?? {});
    const parameters = op.parameters.filter((p) => p.in === location);
    const declared = new Set(
      parameters.map((p) =>
        location === "header" ? p.name.toLowerCase() : p.name,
      ),
    );
    for (const key of Object.keys(source))
      if (!declared.has(location === "header" ? key.toLowerCase() : key))
        issues.push({
          location: `/${location}/${key}`,
          message: "This parameter is not in the official operation schema.",
        });
    for (const parameter of parameters) {
      const actualKey =
        location === "header"
          ? Object.keys(source).find(
              (k) => k.toLowerCase() === parameter.name.toLowerCase(),
            )
          : parameter.name;
      const value = actualKey ? source[actualKey] : undefined;
      if (value === undefined) {
        if (parameter.required)
          issues.push({
            location: `/${location}/${parameter.name}`,
            message: "A value is necessary.",
          });
        continue;
      }
      const schema =
        parameter.schema ??
        Object.values(parameter.content ?? {})[0]?.schema ??
        {};
      const result = validateSchema(schema, value);
      issues.push(
        ...result.issues.map((issue) => ({
          ...issue,
          location: `/${location}/${parameter.name}${issue.location === "/" ? "" : issue.location}`,
        })),
      );
    }
  }
  const type = recipe.contentType ?? op.contentTypes[0];
  if (recipe.contentType && !op.contentTypes.includes(recipe.contentType))
    issues.push({
      location: "/contentType",
      message: "This request content type is not documented for the operation.",
    });
  let body = recipe.body;
  if (recipe.files && Object.keys(recipe.files).length) {
    if (type !== "multipart/form-data")
      issues.push({
        location: "/files",
        message: "File inputs need a multipart operation.",
      });
    if (
      body !== undefined &&
      (!body || typeof body !== "object" || Array.isArray(body))
    )
      issues.push({
        location: "/body",
        message: "A multipart body must be an object.",
      });
    const fileBody: Record<string, any> = {
      ...((body as Record<string, any>) ?? {}),
    };
    for (const [name, files] of Object.entries(recipe.files)) {
      if (Object.hasOwn(fileBody, name))
        issues.push({
          location: `/files/${name}`,
          message: "Do not send a file and a body value under the same name.",
        });
      for (const file of Array.isArray(files) ? files : [files]) {
        if (
          !(file.data instanceof Uint8Array) ||
          !file.name ||
          /[\r\n\0]/.test(file.name)
        )
          issues.push({
            location: `/files/${name}`,
            message: "Invalid file input.",
          });
      }
      // binary schema values are strings on the wire, not JSON file metadata.
      fileBody[name] = Array.isArray(files)
        ? files.map((f) => f.name)
        : files.name;
    }
    body = fileBody;
  }
  if (body === undefined) {
    if (op.requestBody?.required)
      issues.push({
        location: "/body",
        message: "A request body is necessary.",
      });
  } else if (!op.requestBody)
    issues.push({
      location: "/body",
      message: "This operation does not accept a request body.",
    });
  else if (type && op.requestBody.content[type]) {
    const result = validateSchema(
      op.requestBody.content[type]!.schema ?? {},
      body,
    );
    issues.push(
      ...result.issues.map((issue) => ({
        ...issue,
        location: `/body${issue.location === "/" ? "" : issue.location}`,
      })),
    );
  }
  if (recipe.credentialRef && recipe.credentialRef !== op.credentialClass)
    issues.push({
      location: "/credentialRef",
      message: `This operation needs the ${op.credentialClass} credential binding.`,
    });
  return { valid: issues.length === 0, issues };
}
export function assertRecipe(recipe: ApiRecipe): void {
  const result = validateRecipe(recipe);
  if (!result.valid) throw new ApiValidationError(result.issues);
}
export class ApiValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super("The API request has invalid fields.");
    this.name = "ApiValidationError";
  }
}
export function compileAllOperationSchemas() {
  const result: { operationId: string; valid: boolean; error?: string }[] = [];
  for (const item of Object.values(openapiDocument.paths) as any[])
    for (const op of Object.values(item) as any[]) {
      if (!op.operationId) continue;
      try {
        for (const param of op.parameters ?? [])
          validateSchema(param.schema ?? {}, undefined);
        for (const content of Object.values(
          op.requestBody?.content ?? {},
        ) as any[])
          validateSchema(content.schema ?? {}, undefined);
        result.push({ operationId: op.operationId, valid: true });
      } catch (error) {
        result.push({
          operationId: op.operationId,
          valid: false,
          error:
            error instanceof Error
              ? error.message
              : "Schema compilation failed",
        });
      }
    }
  return result;
}
