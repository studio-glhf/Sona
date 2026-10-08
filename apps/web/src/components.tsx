import { useEffect, useRef, useState, ReactNode } from "react";
import { X, Volume2, Mic, MicOff, Square, Play, RotateCcw } from "lucide-react";
import { api, Json, pretty } from "./api";
import { Voice } from "./useVoice";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const source = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.querySelector<HTMLElement>("button,input,select,textarea")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const nodes = [
          ...(dialog?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
          ) ?? []),
        ];
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      source?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function JsonEditor({
  value,
  onChange,
  label = "JSON",
  rows = 16,
}: {
  value: Json;
  onChange: (v: Json) => void;
  label?: string;
  rows?: number;
}) {
  const [text, setText] = useState(pretty(value)),
    [error, setError] = useState("");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(pretty(value));
  }, [value]);
  return (
    <label className="field">
      {label}
      <textarea
        className="code"
        rows={rows}
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
        }}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            setError("");
            onChange(parsed);
          } catch {
            setError("Enter valid JSON. The last valid draft stays saved.");
          }
        }}
        spellCheck={false}
      />
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch-label">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}
export function Devices({
  voice,
  onClose,
}: {
  voice: Voice;
  onClose: () => void;
}) {
  useEffect(() => {
    void voice.refreshDevices().catch((e) => voice.setError(e.message));
  }, []);
  return (
    <Modal title="Devices" onClose={onClose}>
      <label className="field">
        Microphone
        <select
          value={voice.input}
          onChange={(e) => void voice.changeInput(e.target.value)}
        >
          <option value="">System microphone</option>
          {voice.devices
            .filter((d) => d.kind === "audioinput")
            .map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
        </select>
      </label>
      {voice.outputSupported ? (
        <label className="field">
          Output
          <select
            value={voice.output}
            onChange={(e) => void voice.changeOutput(e.target.value)}
          >
            <option value="">System output</option>
            {voice.devices
              .filter((d) => d.kind === "audiooutput")
              .map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Output ${i + 1}`}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <label className="field">
          Output<div className="static-field">System output</div>
          <small>Change output in system settings.</small>
        </label>
      )}
      <p className="muted">
        A device change during a study is recorded. Device names appear after
        microphone permission.
      </p>
      <button
        onClick={async () => {
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            s.getTracks().forEach((t) => t.stop());
            await voice.refreshDevices();
          } catch (e) {
            voice.setError((e as Error).message);
          }
        }}
      >
        Check microphone permission
      </button>
    </Modal>
  );
}
export function SessionControls({
  voice,
  onStart,
  onDevices,
  startLabel = "Start quick test",
}: {
  voice: Voice;
  onStart: () => void;
  onDevices: () => void;
  startLabel?: string;
}) {
  return (
    <div className="call-controls">
      <button disabled={!voice.active} onClick={voice.mute}>
        {voice.muted ? <MicOff /> : <Mic />}
        <span>{voice.muted ? "Unmute" : "Mute"}</span>
      </button>
      <button onClick={onDevices}>
        <Volume2 />
        <span>Devices</span>
      </button>
      {voice.active &&
        (voice.runtime.controls ?? []).map((command: string) => (
          <button key={command} onClick={() => void voice.turnControl(command)}>
            {command === "finish-turn"
              ? "Finish turn"
              : command === "respond"
                ? "Request response"
                : "Stop speech"}
          </button>
        ))}
      {voice.state === "lost" ? (
        <button className="primary" onClick={() => void voice.reconnect()}>
          <RotateCcw size={18} />
          Reconnect
        </button>
      ) : null}
      {voice.active ? (
        <button className="danger" onClick={() => void voice.end()}>
          <Square size={18} />
          <span>End session</span>
        </button>
      ) : (
        <button className="primary" onClick={onStart}>
          <Play size={18} />
          <span>{startLabel}</span>
        </button>
      )}
    </div>
  );
}
export function Clock({ seconds }: { seconds: number }) {
  return (
    <span className="clock">
      {Math.floor(seconds / 60)
        .toString()
        .padStart(2, "0")}
      :{(seconds % 60).toString().padStart(2, "0")}
    </span>
  );
}
export function Orb({ active = false }: { active?: boolean }) {
  return (
    <div className={`orb ${active ? "orb-active" : ""}`} aria-hidden="true">
      <span />
    </div>
  );
}
export function ActionButton({
  children,
  action,
  onDone,
  disabled = false,
}: {
  children: ReactNode;
  action: () => Promise<unknown>;
  onDone?: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await action();
            onDone?.();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Please wait…" : children}
      </button>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
export function SaveState({ status }: { status: string }) {
  return (
    <span
      className={`save-state ${status.includes("failed") ? "error-text" : ""}`}
      role="status"
    >
      {status}
    </span>
  );
}
const saveQueues = new Map<string, Promise<unknown>>();
function saveDraft(path: string, value: Json) {
  const prior = saveQueues.get(path) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(() => api(path, value, "PATCH"));
  saveQueues.set(path, next);
  void next
    .finally(() => {
      if (saveQueues.get(path) === next) saveQueues.delete(path);
    })
    .catch(() => {});
  return next;
}
export function useAutosave(path: string | null, value: Json, delay = 700) {
  const [status, setStatus] = useState("Saved"),
    first = useRef(true),
    latest = useRef(""),
    pending = useRef<{ path: string; value: Json; json: string } | null>(null);
  useEffect(() => {
    first.current = true;
    latest.current = "";
    setStatus("Saved");
    return () => {
      const item = pending.current;
      if (item?.path === path) {
        pending.current = null;
        void saveDraft(item.path, item.value).catch(() => {});
      }
    };
  }, [path]);
  useEffect(() => {
    if (!path) return;
    const json = pretty(value);
    if (first.current) {
      first.current = false;
      latest.current = json;
      return;
    }
    if (json === latest.current) return;
    pending.current = { path, value, json };
    setStatus("Saving…");
    const timer = setTimeout(() => {
      const item = pending.current;
      if (!item || item.path !== path) return;
      pending.current = null;
      void saveDraft(path, item.value)
        .then(() => {
          latest.current = item.json;
          if (!pending.current) setStatus("Saved");
        })
        .catch((e) => {
          pending.current = item;
          setStatus("Save failed: " + e.message);
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [path, value, delay]);
  return status;
}
