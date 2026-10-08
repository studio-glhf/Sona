import { randomUUID } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { z } from "zod";
import realtimeSchema from "./realtime-schema.json" with { type: "json" };
import { canonicalHash, canonicalJson, immutableCopy } from "./canonical.js";

export const CAPABILITY_REVISION = "openai-2026-10-06-491c868adbdb";
export const toolDefinitionSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    connection: z.string().min(1),
    description: z.string().default(""),
    inputSchema: z.record(z.string(), z.unknown()),
    schemaHash: z.string().regex(/^[a-f0-9]{64}$/),
    effect: z.enum(["read", "write"]),
    resource: z.string().optional(),
    sourceVersion: z.string().optional(),
    sensitiveFields: z.array(z.string()).optional(),
  })
  .strict();
export const agentConfigSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    name: z.string().min(1).max(160),
    provider: z.literal("openai"),
    model: z.string().min(1).max(200),
    instructions: z.string().max(100_000),
    settings: z.record(z.string(), z.unknown()),
    tools: z.array(toolDefinitionSchema).max(128),
    confirmationPolicy: z
      .object({
        version: z.literal("1"),
        requireForWrites: z.literal(true),
        expiresAfterMs: z.number().int().min(1_000).max(300_000),
      })
      .strict(),
    capabilityRevision: z.string().min(1),
    instructionSources: z
      .array(
        z
          .object({
            source: z.string(),
            version: z.string(),
            hash: z.string(),
            approved: z.literal(true),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type ToolDefinition = AgentConfig["tools"][number];
export interface ValidationIssue {
  path: string;
  message: string;
}
export interface ValidationContext {
  transport?: "webrtc" | "websocket";
  measured?: boolean;
  modelVerified?: boolean;
}

const schema = structuredClone(realtimeSchema) as Record<string, any>;
// Sona accepts documented fields. Free-form objects remain free-form where the source permits them.
function restrictDocumentedFields(value: any): void {
  if (!value || typeof value !== "object") return;
  if (value.properties && value.additionalProperties === undefined)
    value.additionalProperties = false;
  for (const child of Object.values(value)) restrictDocumentedFields(child);
}
restrictDocumentedFields(schema);
// The provider descriptions explicitly allow null for these two fields.
for (const field of ["noise_reduction", "transcription"]) {
  const previous = schema.properties.audio.properties.input.properties[field];
  schema.properties.audio.properties.input.properties[field] = {
    anyOf: [previous, { type: "null" }],
  };
}
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  validateFormats: false,
});
addFormats(ajv);
const nativeValidator = ajv.compile(schema);
const reserved = new Set(["type", "model", "instructions", "tools"]);

export function toRealtimeSession(
  config: AgentConfig,
): Record<string, unknown> {
  return {
    ...structuredClone(config.settings),
    type: "realtime",
    model: config.model,
    instructions: config.instructions,
    // Hosted MCP could bypass Sona's write policy; use server-side function dispatch.
    tools: config.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
    tracing: null,
  };
}

export function validateAgentConfig(
  input: unknown,
  context: ValidationContext = {},
):
  | { success: true; data: AgentConfig; warnings: string[] }
  | { success: false; issues: ValidationIssue[] } {
  const parsed = agentConfigSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  const config = parsed.data;
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(config.settings)) {
    if (reserved.has(key) || !(key in schema.properties))
      issues.push({
        path: `settings.${key}`,
        message:
          "This is not a documented editable Realtime session field. Use its agent field or the API library.",
      });
  }
  if (config.settings.tracing != null)
    issues.push({
      path: "settings.tracing",
      message: "Provider tracing must stay disabled in voice sessions.",
    });
  const native = toRealtimeSession(config);
  if (!nativeValidator(native))
    for (const error of nativeValidator.errors ?? [])
      issues.push({
        path: `settings${error.instancePath.replaceAll("/", ".")}`,
        message: error.message ?? "Invalid provider setting.",
      });
  const audio = config.settings.audio as
    { input?: { format?: unknown }; output?: { format?: unknown } } | undefined;
  if (
    context.transport !== "websocket" &&
    (audio?.input?.format !== undefined || audio?.output?.format !== undefined)
  )
    issues.push({
      path: "settings.audio",
      message:
        "WebRTC negotiates audio formats. Remove explicit raw-audio format fields.",
    });
  const modalities = config.settings.output_modalities;
  if (
    modalities !== undefined &&
    (!Array.isArray(modalities) || modalities.length !== 1)
  )
    issues.push({
      path: "settings.output_modalities",
      message: "Choose exactly one documented output modality.",
    });
  if (
    context.measured &&
    Array.isArray(modalities) &&
    modalities[0] !== "audio"
  )
    issues.push({
      path: "settings.output_modalities",
      message: "A participant voice session needs audio output.",
    });
  const max = config.settings.max_output_tokens;
  if (
    typeof max === "number" &&
    (!Number.isInteger(max) || max < 1 || max > 4096)
  )
    issues.push({
      path: "settings.max_output_tokens",
      message: "Use an integer from 1 through 4096, or inf.",
    });
  const reasoningModel = /^gpt-realtime-2(?:\.|$)/.test(config.model);
  if (
    !reasoningModel &&
    (config.settings.reasoning !== undefined ||
      config.settings.parallel_tool_calls !== undefined)
  )
    issues.push({
      path: "settings.reasoning",
      message:
        "Reasoning and parallel tool calls need a documented reasoning Realtime model.",
    });
  if (context.measured && !context.modelVerified)
    issues.push({
      path: "model",
      message:
        "Verify model access and transport support before a measured run.",
    });
  const names = new Set<string>();
  for (const [index, tool] of config.tools.entries()) {
    if (names.has(tool.name))
      issues.push({
        path: `tools.${index}.name`,
        message: "Tool names must be unique.",
      });
    names.add(tool.name);
    if (canonicalHash(tool.inputSchema) !== tool.schemaHash)
      issues.push({
        path: `tools.${index}.schemaHash`,
        message: "The tool schema changed. Review it before another run.",
      });
    try {
      ajv.compile(tool.inputSchema);
    } catch {
      issues.push({
        path: `tools.${index}.inputSchema`,
        message: "The tool JSON Schema is invalid.",
      });
    }
  }
  if (issues.length) return { success: false, issues };
  return {
    success: true,
    data: config,
    warnings: [
      "Prompt instructions are guidance. They do not guarantee behavior.",
      "A model alias and external services can change. Identical replay is not guaranteed.",
    ],
  };
}

export function parseAgentConfig(
  input: unknown,
  context: ValidationContext = {},
): AgentConfig {
  const result = validateAgentConfig(input, context);
  if (!result.success)
    throw new Error(
      result.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("\n"),
    );
  return result.data;
}

export function defaultAgentConfig(name = "Untitled agent"): AgentConfig {
  return {
    schemaVersion: "1.0",
    name,
    provider: "openai",
    model: "gpt-realtime-2.1",
    instructions:
      "Speak naturally. Help with the user’s task. Ask when necessary. Read the complete action proposal aloud before asking for confirmation.",
    settings: {
      output_modalities: ["audio"],
      audio: {
        input: {
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
          },
          transcription: null,
        },
        output: { voice: "marin", speed: 1 },
      },
      max_output_tokens: "inf",
      tracing: null,
    },
    tools: [],
    confirmationPolicy: {
      version: "1",
      requireForWrites: true,
      expiresAfterMs: 60_000,
    },
    capabilityRevision: CAPABILITY_REVISION,
  };
}

export interface ConfigurationRevision {
  id: string;
  name: string;
  parentRevision: string | null;
  createdAt: string;
  hash: string;
  config: Readonly<AgentConfig>;
}
export function createRevision(
  config: AgentConfig,
  name: string,
  parentRevision: string | null = null,
): Readonly<ConfigurationRevision> {
  const validated = parseAgentConfig(config);
  return immutableCopy({
    id: randomUUID(),
    name,
    parentRevision,
    createdAt: new Date().toISOString(),
    hash: canonicalHash(validated),
    config: validated,
  });
}
export interface FieldDifference {
  path: string;
  before?: unknown;
  after?: unknown;
  change: "added" | "removed" | "changed";
}
export function configDiff(
  before: unknown,
  after: unknown,
  path = "",
): FieldDifference[] {
  if (
    before !== undefined &&
    after !== undefined &&
    canonicalJson(before) === canonicalJson(after)
  )
    return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      configDiff(a[key], b[key], path ? `${path}.${key}` : key),
    );
  }
  return [
    {
      path,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      change:
        before === undefined
          ? "added"
          : after === undefined
            ? "removed"
            : "changed",
    },
  ];
}

export interface AppliedSetting {
  path: string;
  requested: unknown;
  returned?: unknown;
  status: "confirmed" | "mismatch" | "sent";
  limitation?: string;
}
export function compareAppliedSettings(
  requested: Record<string, unknown>,
  returned: Record<string, unknown>,
): AppliedSetting[] {
  const records: AppliedSetting[] = [];
  function visit(
    a: Record<string, unknown>,
    b: Record<string, unknown> | undefined,
    prefix = "",
  ): void {
    for (const [key, value] of Object.entries(a)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        visit(
          value as Record<string, unknown>,
          b?.[key] as Record<string, unknown> | undefined,
          path,
        );
        continue;
      }
      if (!b || !Object.hasOwn(b, key))
        records.push({
          path,
          requested: value,
          status: "sent",
          limitation:
            "The provider did not return this field. Request acceptance does not confirm its applied value.",
        });
      else
        records.push({
          path,
          requested: value,
          returned: b[key],
          status:
            canonicalJson(value) === canonicalJson(b[key])
              ? "confirmed"
              : "mismatch",
        });
    }
  }
  visit(requested, returned);
  return records;
}

export function exportAgent(config: AgentConfig): string {
  return JSON.stringify(parseAgentConfig(config), null, 2) + "\n";
}
