import { useCallback, useEffect, useRef, useState } from "react";
import { api, Json, Session } from "./api";

type ConnectionState = "idle" | "connecting" | "connected" | "lost" | "ended";
export function useVoice() {
  const [session, setSession] = useState<Session | null>(null),
    [state, setState] = useState<ConnectionState>("idle"),
    [muted, setMuted] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [error, setError] = useState(""),
    [events, setEvents] = useState<Json[]>([]),
    [runtime, setRuntime] = useState<Json>({}),
    [elapsed, setElapsed] = useState(0),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [input, setInput] = useState(localStorage.getItem("sona-input") ?? ""),
    [output, setOutput] = useState(localStorage.getItem("sona-output") ?? "");
  const peer = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream | null>(null),
    channel = useRef<RTCDataChannel | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    current = useRef<Session | null>(null),
    generation = useRef(0),
    mutedRef = useRef(false),
    started = useRef(0),
    eventIds = useRef(new Set<string>()),
    seq = useRef(0);
  const append = useCallback((event: Json) => {
    const id = event.id ?? event.event_id;
    if (id && eventIds.current.has(id)) return;
    if (id) eventIds.current.add(id);
    setEvents((old) => [...old, event].slice(-5000));
  }, []);
  const sendEvent = useCallback(
    async (event: Json) => {
      append(event);
      const s = current.current;
      if (s)
        await api(`/sessions/${s.id}/events`, {
          events: [
            {
              ...event,
              source: event.source ?? "browser",
              clientTimestamp: performance.now(),
              sequence: ++seq.current,
            },
          ],
        }).catch((e) => setError(`Evidence storage: ${e.message}`));
    },
    [append],
  );
  const stopMedia = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    channel.current?.close();
    channel.current = null;
    peer.current?.close();
    peer.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    setSpeaking(false);
  }, []);
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices)
      throw new Error(
        "Microphone access needs localhost and a supported browser.",
      );
    setDevices(await navigator.mediaDevices.enumerateDevices());
  }, []);
  const end = useCallback(async () => {
    generation.current++;
    stopMedia();
    setState("ended");
    const s = current.current;
    current.current = null;
    if (s) {
      try {
        const result = await api(`/sessions/${s.id}/end`, {});
        setSession((old) => ({ ...old, ...result }));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }, [stopMedia]);
  const connect = useCallback(
    async (s: Session, token: number) => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "This browser cannot open a microphone. Use desktop Chrome on localhost.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(input ? { deviceId: { exact: input } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (token !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      media.getAudioTracks().forEach((track) => {
        track.enabled = false;
        track.onended = () => {
          setError(
            "The microphone disconnected. Select a device to repair input.",
          );
          setMuted(true);
          mutedRef.current = true;
          void sendEvent({ type: "device.lost", device: "input", gap: true });
        };
      });
      await refreshDevices();
      const pc = new RTCPeerConnection();
      peer.current = pc;
      const player = audio.current ?? new Audio();
      audio.current = player;
      player.autoplay = true;
      if (output && "setSinkId" in player)
        await (
          player as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        ).setSinkId(output);
      pc.ontrack = (event) => {
        player.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void player
          .play()
          .then(() => sendEvent({ type: "playback.ready" }))
          .catch(() => {
            setError("Audio playback is blocked. Select Resume audio.");
            void sendEvent({ type: "playback.failed" });
          });
      };
      pc.onconnectionstatechange = () => {
        if (pc !== peer.current) return;
        if (pc.connectionState === "connected") setState("connected");
        if (["failed", "disconnected"].includes(pc.connectionState)) {
          setState("lost");
          stream.current?.getTracks().forEach((t) => t.stop());
          void sendEvent({ type: "connection.lost", gap: true });
        }
      };
      media.getTracks().forEach((track) => pc.addTrack(track, media));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (token !== generation.current) return;
      const answer = await api(`/sessions/${s.id}/connect`, { sdp: offer.sdp });
      if (token !== generation.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      media.getAudioTracks().forEach((track) => {
        track.enabled = !mutedRef.current;
      });
      localStorage.setItem("sona-input", input);
      started.current = Date.now();
      await sendEvent({
        type: "device.context",
        input: media.getAudioTracks()[0]?.getSettings(),
        browser: navigator.userAgent,
        outputDevice: output || "System output",
      });
    },
    [append, input, output, refreshDevices, sendEvent],
  );
  const start = useCallback(
    async (options: Json) => {
      const token = ++generation.current;
      stopMedia();
      setError("");
      setEvents([]);
      eventIds.current.clear();
      setRuntime({});
      setElapsed(0);
      setMuted(false);
      mutedRef.current = false;
      setState("connecting");
      try {
        const result = await api("/sessions", options);
        const s = result.session ?? result;
        if (token !== generation.current) {
          await api(`/sessions/${s.id}/end`, {});
          return;
        }
        setSession(s);
        current.current = s;
        await connect(s, token);
      } catch (e) {
        stopMedia();
        setState("ended");
        setError((e as Error).message);
        if (current.current)
          await api(`/sessions/${current.current.id}/end`, {
            reason: "connection_failed",
          }).catch(() => {});
        current.current = null;
        throw e;
      }
    },
    [connect, stopMedia],
  );
  const reconnect = useCallback(async () => {
    const s = current.current ?? session;
    if (!s) return;
    const token = ++generation.current;
    stopMedia();
    setState("connecting");
    setError("");
    try {
      const result = await api(`/sessions/${s.id}/reconnect`, {});
      const linked = result.session ?? result;
      current.current = linked;
      setSession(linked);
      await connect(linked, token);
    } catch (e) {
      stopMedia();
      setState("lost");
      setError((e as Error).message);
    }
  }, [connect, session, stopMedia]);
  const mute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    stream.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
    void sendEvent({ type: "microphone.mute", muted: next });
  }, [sendEvent]);
  const changeInput = useCallback(
    async (id: string) => {
      const currentPeer = peer.current,
        token = generation.current;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setInput(id);
      try {
        if (currentPeer && current.current) {
          const media = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: id ? { exact: id } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          if (token !== generation.current || peer.current !== currentPeer) {
            media.getTracks().forEach((t) => t.stop());
            return;
          }
          const track = media.getAudioTracks()[0];
          track.enabled = !mutedRef.current;
          await currentPeer
            .getSenders()
            .find((s) => s.track?.kind === "audio")
            ?.replaceTrack(track);
          stream.current = media;
        }
        localStorage.setItem("sona-input", id);
        await refreshDevices();
        await sendEvent({
          type: "device.changed",
          device: "input",
          deviceId: id,
          label: stream.current?.getAudioTracks()[0]?.label ?? id,
          settings: stream.current?.getAudioTracks()[0]?.getSettings(),
          muted: mutedRef.current,
          gap: true,
          success: true,
        });
      } catch (e) {
        mutedRef.current = true;
        setMuted(true);
        setError(`Microphone off: ${(e as Error).message}`);
        await sendEvent({
          type: "device.changed",
          device: "input",
          success: false,
          gap: true,
        });
      }
    },
    [refreshDevices, sendEvent],
  );
  const changeOutput = useCallback(
    async (id: string) => {
      try {
        const player = audio.current ?? new Audio();
        audio.current = player;
        if (!("setSinkId" in player))
          throw new Error("Change output in system settings.");
        await (
          player as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        ).setSinkId(id);
        setOutput(id);
        localStorage.setItem("sona-output", id);
        await sendEvent({
          type: "device.changed",
          device: "output",
          deviceId: id,
          success: true,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [sendEvent],
  );
  useEffect(() => {
    if (
      !session ||
      !["connecting", "connected", "lost", "ended"].includes(state)
    )
      return;
    let disposed = false;
    const poll = async () => {
      try {
        const data = await api(`/sessions/${session.id}/runtime`);
        if (disposed) return;
        setRuntime(data);
        setSpeaking(data.speaking === true);
        (data.events ?? []).forEach(append);
        if (data.error) setError(data.error);
        if (data.status === "control-lost" && state === "connected") {
          stopMedia();
          setState("lost");
        }
        if (data.status === "ended" && state === "connected") {
          stopMedia();
          setState("ended");
          current.current = null;
          setSession(data.session);
        }
      } catch (e) {
        if (!disposed) {
          setError((e as Error).message);
          if (state === "connected") {
            stopMedia();
            setState("lost");
          }
        }
      }
    };
    void poll();
    const timer = setInterval(poll, 900);
    const clock = setInterval(() => {
      if (state !== "ended")
        setElapsed(
          started.current
            ? Math.floor((Date.now() - started.current) / 1000)
            : 0,
        );
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [append, session?.id, state, stopMedia]);
  useEffect(() => {
    const changed = () => void refreshDevices().catch(() => {});
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", changed);
  }, [refreshDevices]);
  useEffect(
    () => () => {
      generation.current++;
      stopMedia();
    },
    [stopMedia],
  );
  return {
    session,
    state,
    muted,
    speaking,
    error,
    setError,
    events,
    runtime,
    elapsed,
    devices,
    input,
    output,
    start,
    end,
    reconnect,
    mute,
    changeInput,
    changeOutput,
    refreshDevices,
    sendEvent,
    turnControl: (command: string) =>
      current.current
        ? api(`/sessions/${current.current.id}/control`, { command }).catch(
            (e) => setError(e.message),
          )
        : Promise.resolve(),
    outputSupported:
      typeof HTMLMediaElement !== "undefined" &&
      "setSinkId" in HTMLMediaElement.prototype,
    resumeAudio: () =>
      audio.current
        ?.play()
        .then(() => {
          setError("");
          return sendEvent({ type: "playback.ready" });
        })
        .catch((e) => {
          setError(e.message);
          void sendEvent({ type: "playback.failed" });
        }),
    active: ["connecting", "connected", "lost"].includes(state),
  };
}
export type Voice = ReturnType<typeof useVoice>;
