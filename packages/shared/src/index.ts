import { z } from 'zod';

export const models = ['gpt-realtime-2.1', 'gpt-realtime'] as const;
export const voices = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
] as const;
export const sessionConfigSchema = z
  .object({
    model: z.enum(models),
    voice: z.enum(voices),
    language: z.enum(['en', 'ko']),
    instructions: z.string().trim().min(1).max(12000),
    turnDetection: z.enum(['semantic_vad', 'server_vad']),
    eagerness: z.enum(['low', 'medium', 'high', 'auto']),
    threshold: z.number().min(0).max(1),
    silenceDurationMs: z.number().int().min(200).max(2000),
  })
  .strict();

export type SessionConfig = z.infer<typeof sessionConfigSchema>;
export const defaultConfig: SessionConfig = {
  model: 'gpt-realtime-2.1',
  voice: 'marin',
  language: 'en',
  instructions:
    'You are Sona, a thoughtful voice companion. Be concise, warm, and curious. Listen carefully and ask one question at a time.',
  turnDetection: 'semantic_vad',
  eagerness: 'auto',
  threshold: 0.5,
  silenceDurationMs: 600,
};
export const createSessionSchema = z
  .object({
    apiKey: z
      .string()
      .min(10)
      .max(512)
      .regex(/^[\x21-\x7e]+$/),
    config: sessionConfigSchema,
  })
  .strict();

export function realtimeInstructions(config: SessionConfig): string {
  return `${config.instructions}\n\nRespond in ${config.language === 'ko' ? 'Korean' : 'English'} unless the user explicitly asks to switch language.`;
}
export function realtimeUpdate(config: SessionConfig) {
  return {
    type: 'realtime' as const,
    instructions: realtimeInstructions(config),
    audio: {
      input: {
        turn_detection:
          config.turnDetection === 'semantic_vad'
            ? {
                type: 'semantic_vad' as const,
                eagerness: config.eagerness,
                create_response: true,
                interrupt_response: true,
              }
            : {
                type: 'server_vad' as const,
                threshold: config.threshold,
                silence_duration_ms: config.silenceDurationMs,
                create_response: true,
                interrupt_response: true,
              },
      },
    },
  };
}
export function realtimeSession(config: SessionConfig) {
  const update = realtimeUpdate(config);
  return {
    ...update,
    model: config.model,
    output_modalities: ['audio'],
    audio: { ...update.audio, output: { voice: config.voice } },
    tools: [],
    tracing: null,
  };
}
export function requiresRestart(
  applied: SessionConfig,
  draft: SessionConfig,
): boolean {
  return applied.model !== draft.model || applied.voice !== draft.voice;
}
export type SessionMode = 'simulation' | 'live';
export type SessionStatus =
  'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export type SessionError =
  | 'invalid_key'
  | 'permission_denied'
  | 'device_unavailable'
  | 'response_failed'
  | 'connection_failed'
  | 'disconnected'
  | 'update_failed'
  | 'update_timeout'
  | 'restart_required'
  | 'rate_limited'
  | 'playback_failed'
  | 'invalid_config';
export type TranscriptItem = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};
export type TrialEvent = {
  id: string;
  at: string;
  type: string;
  detail?: string;
};
export type SessionSnapshot = {
  status: SessionStatus;
  mode: SessionMode;
  muted: boolean;
  level: number;
  transcript: TranscriptItem[];
  error: SessionError | null;
  appliedConfig: SessionConfig | null;
  applying: boolean;
  events: TrialEvent[];
};
export const initialSnapshot: SessionSnapshot = {
  status: 'idle',
  mode: 'simulation',
  muted: false,
  level: 0,
  transcript: [],
  error: null,
  appliedConfig: null,
  applying: false,
  events: [],
};

// Registry entries are explicit capability claims; planned integrations must never execute.
export type CapabilityDefinition = {
  id: string;
  service: string;
  label: string;
  status: 'live' | 'simulation' | 'planned' | 'unavailable';
  effect: 'read' | 'write';
  verifiedAt: string | null;
  referencePlan: 'plus' | 'pro' | 'both' | null;
};
export type ToolExecutionRequest = {
  callId: string;
  capabilityId: string;
  arguments: Record<string, unknown>;
  mode: SessionMode;
  confirmation: 'immediate' | 'spoken' | 'screen';
};
export type TrialManifest = {
  schemaVersion: 1;
  capabilityVersion: string;
  config: SessionConfig;
  mode: SessionMode;
  events: TrialEvent[];
};
