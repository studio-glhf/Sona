import { describe, it, expect } from 'vitest';
import { defaultConfig, sessionConfigSchema, realtimeSession, realtimeUpdate, requiresRestart } from './index.js';
describe('session contracts', () => {
  it('validates the supported control subset and rejects empty prompts', () => {
    expect(sessionConfigSchema.safeParse(defaultConfig).success).toBe(true);
    expect(sessionConfigSchema.safeParse({ ...defaultConfig, instructions:' ' }).success).toBe(false);
  });
  it('sets the selected conversation language and VAD fields', () => {
    const value = realtimeSession({ ...defaultConfig, language:'ko', turnDetection:'server_vad', silenceDurationMs:900 });
    expect(value.instructions).toContain('Korean');
    expect(value.audio.input.turn_detection).toMatchObject({ type:'server_vad', silence_duration_ms:900 });
    expect(value.audio.input.turn_detection).not.toHaveProperty('eagerness');
  });
  it('keeps immutable fields out of session updates', () => {
    const update = realtimeUpdate(defaultConfig);
    expect(update).not.toHaveProperty('model'); expect(update.audio).not.toHaveProperty('output');
    expect(requiresRestart(defaultConfig, { ...defaultConfig, voice:'cedar' })).toBe(true);
    expect(requiresRestart(defaultConfig, { ...defaultConfig, language:'ko' })).toBe(false);
  });
});
