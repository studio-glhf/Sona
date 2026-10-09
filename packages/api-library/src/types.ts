export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Schema = boolean | Record<string, any>;
export type ApiLocation = "path" | "query" | "header";
export interface ApiParameter {
  name: string;
  in: ApiLocation;
  required?: boolean;
  description?: string;
  schema?: Schema;
  content?: Record<string, { schema?: Schema }>;
  style?: string;
  explode?: boolean;
}
export interface ApiOperation {
  id: string;
  method: string;
  path: string;
  family: string;
  title: string;
  description: string;
  parameters: ApiParameter[];
  requestBody?: {
    required?: boolean;
    content: Record<
      string,
      { schema?: Schema; encoding?: Record<string, any> }
    >;
  };
  responses: Record<string, any>;
  contentTypes: string[];
  responseTypes: string[];
  credentialClass: "project" | "admin";
  requiresIntent: boolean;
  destructive: boolean;
  deprecated: boolean;
  preview: boolean;
  source: string;
  sourceRevision: string;
  handlers: string[];
  lifecycle: "documented" | "deprecated";
  lifecycleVerified: false;
}
export interface UploadedFile {
  name: string;
  mediaType?: string;
  data: Uint8Array;
}
export interface ApiRecipe {
  operationId: string;
  path?: Record<string, JsonValue>;
  query?: Record<string, JsonValue>;
  headers?: Record<string, JsonValue>;
  body?: JsonValue;
  contentType?: string;
  files?: Record<string, UploadedFile | UploadedFile[]>;
  credentialRef?: "project" | "admin";
  intent?: { confirmed: boolean; operationId: string };
}
export interface ValidationIssue {
  location: string;
  message: string;
  keyword?: string;
}
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
export interface Credentials {
  project?: string;
  admin?: string;
  projectId?: string;
  organizationId?: string;
}
export interface ApiStreamEvent {
  kind: "event" | "chunk";
  event?: string;
  id?: string;
  data: JsonValue | string;
}
export interface ApiRunResult {
  operationId: string;
  status: number;
  ok: boolean;
  contentType: string;
  requestId?: string;
  headers: Record<string, string>;
  body?: JsonValue | string;
  binary?: { data: Uint8Array; mediaType: string };
  events?: ApiStreamEvent[];
  elapsedMs: number;
  acceptance: "accepted" | "rejected";
  applied: "not-returned";
  verification: "live-service" | "contract-fixture";
}
export interface ApiExecutionContext {
  credentials: Credentials;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  onEvent?: (event: ApiStreamEvent) => void | Promise<void>;
  maxResponseBytes?: number;
  maxStoredEvents?: number;
  fixture?: boolean;
}
