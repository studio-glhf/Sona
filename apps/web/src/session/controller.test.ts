import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig, realtimeUpdate } from '@sona/shared';
import { VoiceSessionController, type VoiceEnvironment } from './controller';

function setup() {
  const track = {
    enabled: true,
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  const remoteTrack = { stop: vi.fn() };
  const remoteStream = {
    getTracks: () => [remoteTrack],
  } as unknown as MediaStream;
  const channel = {
    readyState: 'connecting',
    onopen: null as (() => void) | null,
    onclose: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    send: vi.fn(),
    close: vi.fn(),
  };
  const peer = {
    connectionState: 'new',
    onconnectionstatechange: null as (() => void) | null,
    ontrack: null as ((event: { streams: MediaStream[] }) => void) | null,
    createDataChannel: vi.fn(() => channel),
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: 'offer', sdp: 'test-offer' })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  const audio = {
    autoplay: false,
    srcObject: null,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    remove: vi.fn(),
  };
  const analyser = {
    fftSize: 256,
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn((buffer: Uint8Array) => buffer.fill(160)),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state: 'running',
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  const frames = new Map<number, FrameRequestCallback>();
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    String(url).startsWith('/api/')
      ? new Response(
          JSON.stringify({
            clientSecret: 'temporary-secret',
            expiresAt: 9999999999,
          }),
          { status: 200 },
        )
      : new Response('test-answer', { status: 200 }),
  );
  const getUserMedia = vi.fn(async () => stream);
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = frames.size + 1;
    frames.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn();
  const environment: VoiceEnvironment = {
    fetch: fetcher,
    getUserMedia,
    createPeer: () => peer as unknown as RTCPeerConnection,
    createAudio: () => audio as unknown as HTMLAudioElement,
    createAudioContext: () => context as unknown as AudioContext,
    requestFrame,
    cancelFrame,
  };
  const controller = new VoiceSessionController(environment);
  const send = (event: Record<string, unknown>) =>
    channel.onmessage?.({ data: JSON.stringify(event) });
  const begin = async () => {
    const started = controller.start(
      'live',
      defaultConfig,
      'sk-test-do-not-persist',
    );
    await vi.advanceTimersByTimeAsync(0);
    channel.readyState = 'open';
    channel.onopen?.();
    send({ type: 'session.created' });
    await started;
  };
  return {
    controller,
    send,
    begin,
    fetcher,
    getUserMedia,
    stream,
    track,
    remoteTrack,
    remoteStream,
    channel,
    peer,
    audio,
    source,
    analyser,
    context,
    requestFrame,
    cancelFrame,
    frames,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('simulated voice sessions', () => {
  it('provides deterministic text and speech levels without a microphone, API, or real audio', async () => {
    const f = setup();
    await f.controller.start('simulation', defaultConfig);
    expect(f.controller.getSnapshot().status).toBe('listening');
    f.controller.simulateTurn();
    expect(f.controller.getSnapshot().status).toBe('thinking');
    await vi.advanceTimersByTimeAsync(500);
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'speaking',
      level: 0.3,
    });
    expect(f.controller.getSnapshot().transcript).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1350);
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      level: 0,
    });
    expect(f.getUserMedia).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.audio.play).not.toHaveBeenCalled();
    f.controller.stop();
  });

  it('interrupts speech without cancelling an in-flight configuration acknowledgement', async () => {
    const f = setup();
    await f.controller.start('simulation', defaultConfig);
    f.controller.simulateTurn();
    await vi.advanceTimersByTimeAsync(500);
    const updated = { ...defaultConfig, language: 'ko' as const };
    const applied = f.controller.apply(updated);
    f.controller.interrupt();
    await vi.advanceTimersByTimeAsync(2500);
    await applied;
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      level: 0,
      appliedConfig: updated,
    });
    f.controller.simulateTurn();
    expect(f.controller.getSnapshot().transcript.at(-1)?.text).toContain(
      '간결하게',
    );
    f.controller.simulateFailure();
    await vi.advanceTimersByTimeAsync(2500);
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'disconnected',
      level: 0,
    });
    await f.controller.start('simulation', defaultConfig);
    expect(f.controller.getSnapshot().transcript).toEqual([]);
    expect(f.controller.getSnapshot().status).toBe('listening');
    f.controller.stop();
  });
});

describe('WebRTC startup and cleanup', () => {
  it('waits for session.created and sends the key only to the broker and temporary token only to OpenAI', async () => {
    const f = setup();
    const started = f.controller.start(
      'live',
      defaultConfig,
      'sk-test-do-not-persist',
    );
    await vi.advanceTimersByTimeAsync(0);
    f.channel.readyState = 'open';
    f.channel.onopen?.();
    f.send({ type: 'session.updated', session: realtimeUpdate(defaultConfig) });
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'connecting',
      appliedConfig: null,
    });
    await expect(f.controller.apply(defaultConfig)).rejects.toThrow(
      'update_failed',
    );
    f.send({ type: 'session.created' });
    await started;
    expect(f.controller.getSnapshot().appliedConfig).toEqual(defaultConfig);
    expect(f.fetcher.mock.calls[0]?.[0]).toBe('/api/realtime/sessions');
    expect(String(f.fetcher.mock.calls[0]?.[1]?.body)).toContain(
      'sk-test-do-not-persist',
    );
    expect(f.fetcher.mock.calls[1]).toMatchObject([
      'https://api.openai.com/v1/realtime/calls',
      {
        headers: {
          Authorization: 'Bearer temporary-secret',
          'Content-Type': 'application/sdp',
        },
        body: 'test-offer',
      },
    ]);
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain('sk-test');
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain(
      'temporary-secret',
    );
    f.controller.stop();
  });

  it('handles microphone denial without calling the broker', async () => {
    const f = setup();
    f.getUserMedia.mockRejectedValue(
      new DOMException('private device details', 'NotAllowedError'),
    );
    await f.controller.start('live', defaultConfig, 'sk-test-do-not-persist');
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'permission_denied',
    });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain(
      'private device details',
    );
  });

  it('cleans up denied credentials and never exposes the upstream error body', async () => {
    const f = setup();
    f.fetcher.mockResolvedValue(
      new Response('provider response mentioning sk-test-do-not-persist', {
        status: 401,
      }),
    );
    await f.controller.start('live', defaultConfig, 'sk-test-do-not-persist');
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'invalid_key',
    });
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.peer.close).toHaveBeenCalledOnce();
    expect(f.channel.close).toHaveBeenCalledOnce();
    expect(f.audio.remove).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain('sk-test');
  });

  it('stops a microphone granted after Stop without reviving the cancelled session', async () => {
    const f = setup();
    let grant!: (stream: MediaStream) => void;
    f.getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const started = f.controller.start(
      'live',
      defaultConfig,
      'sk-test-do-not-persist',
    );
    f.controller.stop();
    await started;
    grant(f.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().status).toBe('idle');
  });

  it('aborts a pending broker request and ignores its late result', async () => {
    const f = setup();
    let reply!: (response: Response) => void;
    f.fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
    const started = f.controller.start(
      'live',
      defaultConfig,
      'sk-test-do-not-persist',
    );
    await vi.advanceTimersByTimeAsync(0);
    const signal = f.fetcher.mock.calls[0]?.[1]?.signal;
    f.controller.stop();
    await started;
    expect(signal?.aborted).toBe(true);
    reply(
      new Response(
        JSON.stringify({ clientSecret: 'temporary-secret', expiresAt: 99 }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(f.fetcher).toHaveBeenCalledOnce();
    expect(f.controller.getSnapshot().status).toBe('idle');
    expect(f.track.stop).toHaveBeenCalledOnce();
  });

  it('restarts live sessions and ignores events from the previous connection', async () => {
    const f = setup();
    await f.begin();
    const staleMessage = f.channel.onmessage;
    const restarted = f.controller.start(
      'live',
      { ...defaultConfig, voice: 'cedar' },
      'sk-test-do-not-persist',
    );
    await vi.advanceTimersByTimeAsync(0);
    staleMessage?.({ data: JSON.stringify({ type: 'session.created' }) });
    staleMessage?.({
      data: JSON.stringify({ type: 'output_audio_buffer.started' }),
    });
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'connecting',
      appliedConfig: null,
    });
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.peer.close).toHaveBeenCalledOnce();
    f.channel.readyState = 'open';
    f.channel.onopen?.();
    f.send({ type: 'session.created' });
    await restarted;
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      appliedConfig: { voice: 'cedar' },
    });
    f.controller.stop();
    expect(f.track.stop).toHaveBeenCalledTimes(2);
  });

  it('times out startup when the data channel never becomes ready', async () => {
    const f = setup();
    const started = f.controller.start(
      'live',
      defaultConfig,
      'sk-test-do-not-persist',
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await started;
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'connection_failed',
    });
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.peer.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases remote audio, context, frames and tracks on disconnect and can restart', async () => {
    const f = setup();
    await f.begin();
    f.peer.ontrack?.({ streams: [f.remoteStream] });
    f.peer.connectionState = 'disconnected';
    f.peer.onconnectionstatechange?.();
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'disconnected',
      level: 0,
    });
    expect(f.remoteTrack.stop).toHaveBeenCalledOnce();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.source.disconnect).toHaveBeenCalledOnce();
    expect(f.analyser.disconnect).toHaveBeenCalledOnce();
    expect(f.cancelFrame).toHaveBeenCalledOnce();
    expect(f.audio.srcObject).toBe(null);
    f.send({ type: 'output_audio_buffer.started' });
    expect(f.controller.getSnapshot().status).toBe('error');
    await f.controller.start('simulation', defaultConfig);
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      error: null,
    });
    f.controller.stop();
  });
});

describe('speech and configuration events', () => {
  it('uses playback completion, rather than generation completion, and reads actual audio amplitude', async () => {
    const f = setup();
    await f.begin();
    f.peer.ontrack?.({ streams: [f.remoteStream] });
    f.send({ type: 'response.created' });
    f.send({ type: 'output_audio_buffer.started' });
    f.frames.get(1)?.(0);
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'speaking',
      level: 1,
    });
    f.send({ type: 'response.done' });
    expect(f.controller.getSnapshot().status).toBe('speaking');
    f.send({ type: 'output_audio_buffer.stopped' });
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      level: 0,
    });
    f.controller.stop();
  });

  it('mutes microphone tracks and cancels active generation plus queued audio on interruption', async () => {
    const f = setup();
    await f.begin();
    f.controller.setMuted(true);
    expect(f.track.enabled).toBe(false);
    f.controller.setMuted(false);
    expect(f.track.enabled).toBe(true);
    f.send({ type: 'response.created' });
    f.send({ type: 'output_audio_buffer.started' });
    f.controller.interrupt();
    expect(
      f.channel.send.mock.calls.map(([message]) => JSON.parse(message)),
    ).toEqual([
      { type: 'response.cancel' },
      { type: 'output_audio_buffer.clear' },
    ]);
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      level: 0,
    });
    f.channel.send.mockClear();
    f.send({ type: 'output_audio_buffer.started' });
    f.send({ type: 'response.done' });
    f.controller.interrupt();
    expect(
      f.channel.send.mock.calls.map(([message]) => JSON.parse(message)),
    ).toEqual([{ type: 'output_audio_buffer.clear' }]);
    f.controller.stop();
  });

  it('accumulates voice transcripts by item and supports optional user transcription', async () => {
    const f = setup();
    await f.begin();
    f.send({
      type: 'response.output_audio_transcript.delta',
      item_id: 'a',
      delta: 'Hello ',
    });
    f.send({
      type: 'response.output_audio_transcript.delta',
      item_id: 'a',
      delta: 'there.',
    });
    f.send({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u',
      transcript: 'Hi!',
    });
    expect(f.controller.getSnapshot().transcript).toEqual([
      { id: 'a', role: 'assistant', text: 'Hello there.' },
      { id: 'u', role: 'user', text: 'Hi!' },
    ]);
    f.controller.stop();
  });

  it('keeps the applied configuration unchanged until a matching acknowledgement arrives', async () => {
    const f = setup();
    await f.begin();
    const next = {
      ...defaultConfig,
      instructions: 'Be brief.',
      turnDetection: 'server_vad' as const,
      threshold: 0.7,
    };
    const pending = f.controller.apply(next);
    expect(f.controller.getSnapshot()).toMatchObject({
      applying: true,
      appliedConfig: defaultConfig,
    });
    f.send({ type: 'session.updated', session: realtimeUpdate(defaultConfig) });
    expect(f.controller.getSnapshot().applying).toBe(true);
    f.send({
      type: 'session.updated',
      session: { ...realtimeUpdate(next), id: 'provider-session' },
    });
    await pending;
    expect(f.controller.getSnapshot()).toMatchObject({
      applying: false,
      appliedConfig: next,
      error: null,
    });
    f.controller.stop();
  });

  it('rejects concurrent updates and model or voice changes without sending unsafe updates', async () => {
    const f = setup();
    await f.begin();
    await expect(
      f.controller.apply({ ...defaultConfig, voice: 'cedar' }),
    ).rejects.toThrow('restart_required');
    await expect(
      f.controller.apply({ ...defaultConfig, model: 'gpt-realtime' }),
    ).rejects.toThrow('restart_required');
    expect(f.channel.send).not.toHaveBeenCalled();
    const next = { ...defaultConfig, instructions: 'Be brief.' };
    const first = f.controller.apply(next);
    await expect(
      f.controller.apply({ ...defaultConfig, instructions: 'Be warm.' }),
    ).rejects.toThrow('update_failed');
    expect(f.controller.getSnapshot().applying).toBe(true);
    expect(f.channel.send).toHaveBeenCalledOnce();
    f.send({ type: 'session.updated', session: realtimeUpdate(next) });
    await first;
    expect(f.controller.getSnapshot().appliedConfig).toEqual(next);
    f.controller.stop();
  });

  it('rejects a correlated error without losing the connected session or previous configuration', async () => {
    const f = setup();
    await f.begin();
    const result = f.controller
      .apply({ ...defaultConfig, instructions: 'Be brief.' })
      .catch((error: Error) => error.message);
    const request = JSON.parse(f.channel.send.mock.calls[0][0]);
    f.send({
      type: 'error',
      error: {
        event_id: request.event_id,
        message: 'do-not-expose-provider-payload',
      },
    });
    expect(await result).toBe('update_failed');
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      applying: false,
      error: 'update_failed',
      appliedConfig: defaultConfig,
    });
    expect(JSON.stringify(f.controller.getSnapshot())).not.toContain(
      'do-not-expose',
    );
    f.controller.stop();
  });

  it('times out updates and rejects pending updates on stop', async () => {
    const f = setup();
    await f.begin();
    const next = { ...defaultConfig, instructions: 'Be brief.' };
    const result = f.controller
      .apply(next)
      .catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toBe('update_timeout');
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'listening',
      appliedConfig: defaultConfig,
      applying: false,
    });
    f.send({ type: 'session.updated', session: realtimeUpdate(next) });
    expect(f.controller.getSnapshot().appliedConfig).toEqual(defaultConfig);
    const cancelled = f.controller
      .apply(next)
      .catch((error: Error) => error.message);
    f.controller.stop();
    expect(await cancelled).toBe('cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });
});
