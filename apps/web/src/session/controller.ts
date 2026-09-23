import {
  initialSnapshot,
  realtimeUpdate,
  requiresRestart,
  sessionConfigSchema,
  type SessionConfig,
  type SessionError,
  type SessionMode,
  type SessionSnapshot,
} from '@sona/shared';

const CONNECT_TIMEOUT_MS = 20_000;
const UPDATE_TIMEOUT_MS = 8_000;
type JsonObject = Record<string, unknown>;

export class SessionFault extends Error {
  constructor(readonly code: SessionError | 'cancelled') {
    super(code);
    this.name = 'SessionFault';
  }
}

/** Browser resources are injected so lifecycle tests never need a microphone or API key. */
export interface VoiceEnvironment {
  fetch: typeof fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeer: () => RTCPeerConnection;
  createAudio: () => HTMLAudioElement;
  createAudioContext: () => AudioContext;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
}

const browserEnvironment: VoiceEnvironment = {
  fetch: (...args) => fetch(...args),
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  createPeer: () => new RTCPeerConnection(),
  createAudio: () => new Audio(),
  createAudioContext: () => new AudioContext(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

type PendingUpdate = {
  id: string;
  config: SessionConfig;
  expected: ReturnType<typeof realtimeUpdate>;
  resolve: () => void;
  reject: (error: SessionFault) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Run = {
  id: number;
  mode: SessionMode;
  abort: AbortController;
  timers: Set<ReturnType<typeof setTimeout>>;
  turnTimers: Set<ReturnType<typeof setTimeout>>;
  peer?: RTCPeerConnection;
  channel?: RTCDataChannel;
  stream?: MediaStream;
  remoteStreams: Set<MediaStream>;
  audio?: HTMLAudioElement;
  context?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  analyser?: AnalyserNode;
  frame?: number;
  responseActive: boolean;
  playing: boolean;
  created: boolean;
  connected: boolean;
  ready: () => void;
  cancel: (error: SessionFault) => void;
  pending?: PendingUpdate;
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

// Realtime acknowledgements contain additional server defaults. Compare only requested fields.
function contains(actual: unknown, expected: unknown): boolean {
  const fields = object(expected);
  if (!fields) return actual === expected;
  const received = object(actual);
  return (
    !!received &&
    Object.entries(fields).every(([key, value]) =>
      contains(received[key], value),
    )
  );
}

function safeError(error: unknown): SessionError {
  if (error instanceof SessionFault && error.code !== 'cancelled')
    return error.code;
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return 'permission_denied';
    if (
      ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(
        error.name,
      )
    ) {
      return 'device_unavailable';
    }
  }
  return 'connection_failed';
}

export class VoiceSessionController {
  private snapshot: SessionSnapshot = {
    ...initialSnapshot,
    transcript: [],
    events: [],
  };
  private listeners = new Set<() => void>();
  private run?: Run;
  private serial = 0;
  private turn = 0;

  constructor(private readonly env: VoiceEnvironment = browserEnvironment) {}

  getSnapshot = (): SessionSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(value: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }

  private event(type: string, detail?: string) {
    this.patch({
      events: [
        ...this.snapshot.events,
        {
          id: `event-${++this.serial}`,
          at: new Date().toISOString(),
          type,
          ...(detail ? { detail } : {}),
        },
      ].slice(-500),
    });
  }

  private active(run: Run) {
    return this.run === run && !run.abort.signal.aborted;
  }

  private schedule(
    run: Run,
    callback: () => void,
    delay: number,
    turn = false,
  ) {
    const timer = setTimeout(() => {
      run.timers.delete(timer);
      run.turnTimers.delete(timer);
      if (this.active(run)) callback();
    }, delay);
    run.timers.add(timer);
    if (turn) run.turnTimers.add(timer);
    return timer;
  }

  private clearTimers(run: Run) {
    run.timers.forEach(clearTimeout);
    run.timers.clear();
    run.turnTimers.clear();
  }

  private rejectUpdate(run: Run, code: SessionError | 'cancelled') {
    const pending = run.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    run.timers.delete(pending.timer);
    run.pending = undefined;
    this.patch({
      applying: false,
      ...(code !== 'cancelled' ? { error: code } : {}),
    });
    pending.reject(new SessionFault(code));
    if (code !== 'cancelled') this.event('configuration_rejected', code);
  }

  private release(run: Run) {
    // Detach first: synchronous close events and late async results cannot revive the session.
    if (this.run === run) this.run = undefined;
    run.abort.abort();
    run.cancel(new SessionFault('cancelled'));
    this.rejectUpdate(run, 'cancelled');
    this.clearTimers(run);
    if (run.frame !== undefined) this.env.cancelFrame(run.frame);
    run.channel?.close();
    run.peer?.close();
    run.stream?.getTracks().forEach((track) => track.stop());
    run.remoteStreams.forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop()),
    );
    if (run.audio) {
      run.audio.pause();
      run.audio.srcObject = null;
      run.audio.remove();
    }
    run.source?.disconnect();
    run.analyser?.disconnect();
    if (run.context && run.context.state !== 'closed')
      void run.context.close().catch(() => undefined);
  }

  private fail(run: Run, code: SessionError) {
    if (!this.active(run)) return;
    this.release(run);
    this.patch({ status: 'error', error: code, level: 0, applying: false });
    this.event('session_failed', code);
  }

  start = async (
    mode: SessionMode,
    config: SessionConfig,
    apiKey?: string,
  ): Promise<void> => {
    if (this.run) this.release(this.run);
    this.patch({ ...initialSnapshot, mode, transcript: [], events: [] });
    const parsed = sessionConfigSchema.safeParse(config);
    if (!parsed.success) {
      this.patch({ status: 'error', error: 'invalid_config' });
      return;
    }
    if (mode === 'live' && !apiKey?.trim()) {
      this.patch({ status: 'error', error: 'invalid_key' });
      return;
    }

    let resolveReady!: () => void;
    let rejectReady!: (error: SessionFault) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // Cancellation may happen before connect reaches its final await.
    void ready.catch(() => undefined);
    const run: Run = {
      id: ++this.serial,
      mode,
      abort: new AbortController(),
      timers: new Set(),
      turnTimers: new Set(),
      remoteStreams: new Set(),
      responseActive: false,
      playing: false,
      created: false,
      connected: false,
      ready: resolveReady,
      cancel: rejectReady,
    };
    this.run = run;
    this.turn = 0;
    this.patch({ status: 'connecting' });
    this.event('session_starting', mode);
    if (mode === 'simulation') {
      run.created = true;
      run.connected = true;
      run.ready();
      this.patch({ status: 'listening', appliedConfig: parsed.data });
      this.event('session_connected', 'simulation');
      return;
    }

    const timeout = this.schedule(
      run,
      () => {
        run.cancel(new SessionFault('connection_failed'));
      },
      CONNECT_TIMEOUT_MS,
    );
    try {
      await Promise.race([
        this.connect(run, parsed.data, apiKey!.trim()),
        ready.then(() => undefined),
      ]);
      if (!this.active(run)) return;
      await ready;
      clearTimeout(timeout);
      run.timers.delete(timeout);
    } catch (error) {
      if (!this.active(run)) return;
      this.fail(run, safeError(error));
    }
  };

  private async connect(run: Run, config: SessionConfig, apiKey: string) {
    if (
      typeof navigator !== 'undefined' &&
      !navigator.mediaDevices &&
      this.env === browserEnvironment
    ) {
      throw new SessionFault('device_unavailable');
    }
    const stream = await this.env.getUserMedia({ audio: true });
    if (!this.active(run)) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    run.stream = stream;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !this.snapshot.muted;
    });
    const peer = this.env.createPeer();
    run.peer = peer;
    const audio = this.env.createAudio();
    audio.autoplay = true;
    run.audio = audio;
    peer.ontrack = (event) => {
      if (!this.active(run)) return;
      const remote = event.streams[0];
      if (!remote) return;
      run.remoteStreams.add(remote);
      audio.srcObject = remote;
      void audio.play().catch(() => this.fail(run, 'playback_failed'));
      this.analyse(run, remote);
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
        this.fail(run, 'disconnected');
      }
    };
    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream);
      track.onended = () => this.fail(run, 'device_unavailable');
    });
    const channel = peer.createDataChannel('oai-events');
    run.channel = channel;
    channel.onmessage = (event) => {
      if (!this.active(run) || typeof event.data !== 'string') return;
      try {
        const message: unknown = JSON.parse(event.data);
        const value = object(message);
        if (value) this.receive(run, value, config);
      } catch {
        // Ignore malformed transport events; never surface provider payloads or credentials.
      }
    };
    channel.onopen = () => this.connected(run, config);
    channel.onclose = () => this.fail(run, 'disconnected');
    channel.onerror = () => this.fail(run, 'connection_failed');

    const credentials = await this.env.fetch('/api/realtime/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, config }),
      signal: run.abort.signal,
      cache: 'no-store',
    });
    if (!this.active(run)) return;
    if (!credentials.ok) {
      throw new SessionFault(
        credentials.status === 401 || credentials.status === 403
          ? 'invalid_key'
          : credentials.status === 429
            ? 'rate_limited'
            : 'connection_failed',
      );
    }
    const payload = object(await credentials.json());
    if (!this.active(run)) return;
    if (
      typeof payload?.clientSecret !== 'string' ||
      typeof payload.expiresAt !== 'number'
    ) {
      throw new SessionFault('connection_failed');
    }
    const offer = await peer.createOffer();
    if (!this.active(run)) return;
    await peer.setLocalDescription(offer);
    if (!this.active(run)) return;
    const response = await this.env.fetch(
      'https://api.openai.com/v1/realtime/calls',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
        signal: run.abort.signal,
        cache: 'no-store',
      },
    );
    if (!this.active(run)) return;
    if (!response.ok)
      throw new SessionFault(
        response.status === 429 ? 'rate_limited' : 'connection_failed',
      );
    const sdp = await response.text();
    if (!this.active(run)) return;
    await peer.setRemoteDescription({ type: 'answer', sdp });
  }

  private connected(run: Run, config: SessionConfig) {
    if (
      !this.active(run) ||
      !run.created ||
      run.channel?.readyState !== 'open' ||
      run.connected
    )
      return;
    run.connected = true;
    this.patch({
      status: 'listening',
      appliedConfig: { ...config },
      error: null,
    });
    this.event('session_connected', 'live');
    run.ready();
  }

  private analyse(run: Run, stream: MediaStream) {
    try {
      run.source?.disconnect();
      run.analyser?.disconnect();
      const context = run.context ?? this.env.createAudioContext();
      run.context = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      run.source = source;
      run.analyser = analyser;
      void context.resume().catch(() => undefined);
      if (run.frame !== undefined) this.env.cancelFrame(run.frame);
      const data = new Uint8Array(analyser.fftSize);
      const draw = () => {
        if (!this.active(run)) return;
        if (run.playing) {
          analyser.getByteTimeDomainData(data);
          const energy =
            data.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
            data.length;
          this.patch({ level: Math.min(1, Math.sqrt(energy) * 4) });
        }
        run.frame = this.env.requestFrame(draw);
      };
      run.frame = this.env.requestFrame(draw);
    } catch {
      // Audio playback still works when the optional Web Audio visualizer is unavailable.
    }
  }

  private transcript(
    id: string,
    role: 'user' | 'assistant',
    text: string,
    append = false,
  ) {
    const previous = this.snapshot.transcript.find((entry) => entry.id === id);
    const item = {
      id,
      role,
      text: append ? (previous?.text ?? '') + text : text,
    };
    this.patch({
      transcript: previous
        ? this.snapshot.transcript.map((entry) =>
            entry.id === id ? item : entry,
          )
        : [...this.snapshot.transcript, item],
    });
  }

  private receive(run: Run, event: JsonObject, initialConfig: SessionConfig) {
    switch (event.type) {
      case 'session.created':
        run.created = true;
        this.connected(run, initialConfig);
        break;
      case 'session.updated': {
        const pending = run.pending;
        if (!pending || !contains(event.session, pending.expected)) break;
        clearTimeout(pending.timer);
        run.timers.delete(pending.timer);
        run.pending = undefined;
        this.patch({
          appliedConfig: { ...pending.config },
          applying: false,
          error: null,
        });
        this.event('configuration_applied');
        pending.resolve();
        break;
      }
      case 'input_audio_buffer.speech_started':
        if (!run.playing) this.patch({ status: 'listening' });
        break;
      case 'input_audio_buffer.speech_stopped':
        if (!run.playing) this.patch({ status: 'thinking' });
        break;
      case 'response.created':
        run.responseActive = true;
        if (!run.playing) this.patch({ status: 'thinking' });
        break;
      case 'output_audio_buffer.started':
        run.playing = true;
        this.patch({ status: 'speaking' });
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        run.playing = false;
        this.patch({
          status: run.responseActive ? 'thinking' : 'listening',
          level: 0,
        });
        break;
      case 'response.done':
        run.responseActive = false;
        if (!run.playing) this.patch({ status: 'listening', level: 0 });
        break;
      case 'response.output_audio_transcript.delta':
      case 'response.output_text.delta':
        if (typeof event.delta === 'string') {
          this.transcript(
            String(event.item_id ?? event.response_id ?? 'assistant'),
            'assistant',
            event.delta,
            true,
          );
        }
        break;
      case 'response.output_audio_transcript.done':
        if (typeof event.transcript === 'string') {
          this.transcript(
            String(event.item_id ?? event.response_id ?? 'assistant'),
            'assistant',
            event.transcript,
          );
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof event.transcript === 'string') {
          this.transcript(
            String(event.item_id ?? 'user'),
            'user',
            event.transcript,
          );
        }
        break;
      case 'error': {
        const error = object(event.error);
        if (run.pending && error?.event_id === run.pending.id)
          this.rejectUpdate(run, 'update_failed');
        else if (!run.connected) this.fail(run, 'connection_failed');
        else {
          this.patch({
            error:
              error?.code === 'rate_limit_exceeded'
                ? 'rate_limited'
                : 'connection_failed',
          });
          this.event('provider_error');
        }
        break;
      }
    }
  }

  stop = () => {
    if (this.run) this.release(this.run);
    this.patch({
      status: 'idle',
      level: 0,
      error: null,
      muted: false,
      appliedConfig: null,
      applying: false,
    });
    this.event('session_stopped');
  };

  setMuted = (muted: boolean) => {
    this.run?.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.patch({ muted });
  };

  interrupt = () => {
    const run = this.run;
    if (!run?.connected) return;
    if (run.mode === 'simulation') {
      // Configuration acknowledgements continue when only speech is interrupted.
      run.turnTimers.forEach((timer) => {
        clearTimeout(timer);
        run.timers.delete(timer);
      });
      run.turnTimers.clear();
    } else if (run.channel?.readyState === 'open') {
      try {
        if (run.responseActive)
          run.channel.send(JSON.stringify({ type: 'response.cancel' }));
        if (run.playing || run.responseActive)
          run.channel.send(
            JSON.stringify({ type: 'output_audio_buffer.clear' }),
          );
      } catch {
        this.fail(run, 'disconnected');
        return;
      }
    }
    run.responseActive = false;
    run.playing = false;
    this.patch({ status: 'listening', level: 0 });
    this.event('response_interrupted');
  };

  apply = (config: SessionConfig): Promise<void> => {
    const run = this.run;
    const parsed = sessionConfigSchema.safeParse(config);
    let problem: SessionError | undefined;
    if (!parsed.success) problem = 'invalid_config';
    else if (!run?.connected || !this.snapshot.appliedConfig || run.pending)
      problem = 'update_failed';
    else if (requiresRestart(this.snapshot.appliedConfig, parsed.data))
      problem = 'restart_required';
    if (problem || !run || !parsed.success) {
      const code = problem ?? 'update_failed';
      this.patch({ error: code });
      return Promise.reject(new SessionFault(code));
    }
    const next = parsed.data;
    const expected = realtimeUpdate(next);
    const id = `sona-update-${++this.serial}`;
    this.patch({ applying: true, error: null });
    return new Promise<void>((resolve, reject) => {
      const timer = this.schedule(
        run,
        () => this.rejectUpdate(run, 'update_timeout'),
        UPDATE_TIMEOUT_MS,
      );
      run.pending = { id, config: next, expected, resolve, reject, timer };
      if (run.mode === 'simulation') {
        this.schedule(
          run,
          () =>
            this.receive(
              run,
              { type: 'session.updated', session: expected },
              next,
            ),
          30,
        );
        return;
      }
      try {
        if (run.channel?.readyState !== 'open')
          throw new SessionFault('disconnected');
        run.channel.send(
          JSON.stringify({
            type: 'session.update',
            event_id: id,
            session: expected,
          }),
        );
      } catch {
        this.rejectUpdate(run, 'update_failed');
      }
    });
  };

  simulateTurn = () => {
    const run = this.run;
    if (
      !run ||
      run.mode !== 'simulation' ||
      !run.connected ||
      this.snapshot.muted ||
      run.responseActive
    )
      return;
    const korean = this.snapshot.appliedConfig?.language === 'ko';
    const turns = korean
      ? [
          [
            '이번 대화에서 무엇을 시험해 볼까요?',
            '말투와 응답 속도를 함께 살펴볼 수 있어요. 어떤 느낌을 원하시나요?',
          ],
          ['조금 더 간결하게 대답해 주세요.', '좋아요. 핵심만 짧게 말할게요.'],
        ]
      : [
          [
            'What can we explore in this conversation?',
            'We can explore tone and pacing together. What would you like the conversation to feel like?',
          ],
          [
            'Please make your replies a little shorter.',
            'Of course. I will keep it brief.',
          ],
        ];
    const index = this.turn++;
    const [question, answer] = turns[index % turns.length];
    this.transcript(`simulation-user-${index}`, 'user', question);
    run.responseActive = true;
    this.patch({ status: 'thinking', error: null });
    this.event('simulated_turn');
    this.schedule(
      run,
      () => {
        this.transcript(`simulation-assistant-${index}`, 'assistant', answer);
        run.playing = true;
        this.patch({ status: 'speaking', level: 0.3 });
      },
      500,
      true,
    );
    [0.7, 0.25, 0.55, 0.85, 0.4, 0.65, 0.2].forEach((level, offset) => {
      this.schedule(run, () => this.patch({ level }), 650 + offset * 150, true);
    });
    this.schedule(
      run,
      () => {
        run.responseActive = false;
        run.playing = false;
        this.patch({ status: 'listening', level: 0 });
      },
      1850,
      true,
    );
  };

  simulateFailure = () => {
    if (this.run?.mode === 'simulation') this.fail(this.run, 'disconnected');
  };
}
