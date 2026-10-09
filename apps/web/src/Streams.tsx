import { useEffect, useState } from "react";
import { api, Json, pretty } from "./api";
import { ActionButton, JsonEditor, Notice } from "./components";
export function ApiStreams() {
  const [target, setTarget] = useState<Json>({
      kind: "realtime",
      model: "gpt-realtime-2.1",
    }),
    [intent, setIntent] = useState(false),
    [id, setId] = useState(""),
    [status, setStatus] = useState("Closed"),
    [events, setEvents] = useState<Json[]>([]),
    [event, setEvent] = useState<Json>({ type: "response.create" }),
    [error, setError] = useState(""),
    [webhooks, setWebhooks] = useState<Json>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    const timer = setInterval(() => {
      void api(`/library/streams/${id}`)
        .then((data) => {
          if (active) {
            setEvents(data.events);
            setStatus(data.status);
          }
        })
        .catch((e) => setError(e.message));
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  return (
    <section className="stream-console">
      <h2>Bidirectional API console</h2>
      <Notice>
        This API run is separate from measured voice sessions. It can incur
        costs. No audio is captured automatically. Send documented events
        explicitly.
      </Notice>
      <JsonEditor
        label="Stream target"
        value={target}
        onChange={setTarget}
        rows={5}
      />
      <p className="muted">
        Targets: realtime (model, callId, or transcription intent), live,
        live-sideband, and live-fork (sessionId).
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={intent}
          onChange={(e) => setIntent(e.target.checked)}
        />
        I intend to open this billable API stream.
      </label>
      <ActionButton
        action={async () => {
          if (!intent) throw new Error("Confirm this stream first.");
          const r = await api("/library/streams", { target, intent: true });
          setId(r.id);
          setStatus(r.status);
        }}
      >
        Open stream
      </ActionButton>
      {id && (
        <>
          <p role="status">{status} · Maximum duration: 120 seconds</p>
          <JsonEditor
            label="Client event"
            value={event}
            onChange={setEvent}
            rows={6}
          />
          <ActionButton
            action={() => api(`/library/streams/${id}/events`, { event })}
          >
            Send validated event
          </ActionButton>
          <ActionButton
            action={async () => {
              await api(`/library/streams/${id}`, undefined, "DELETE");
              setStatus("closed");
            }}
          >
            Close stream
          </ActionButton>
          <details>
            <summary>Events ({events.length})</summary>
            <pre>{pretty(events)}</pre>
          </details>
        </>
      )}
      {error && <Notice error>{error}</Notice>}
      <p className="muted">
        Webhooks use /api/webhooks/openai with OPENAI_WEBHOOK_SECRET on the
        server. Provider delivery needs a separately authorized, reachable HTTPS
        endpoint. Sona does not publish one.
      </p>
      <ActionButton
        action={async () => setWebhooks(await api("/library/webhooks"))}
      >
        Inspect webhook deliveries
      </ActionButton>
      {webhooks && (
        <details open>
          <summary>
            {webhooks.configured
              ? "Signing secret configured"
              : "Signing secret missing"}{" "}
            · {webhooks.deliveries.length} verified deliveries
          </summary>
          <p>{webhooks.retention}</p>
          <pre>{pretty(webhooks.deliveries)}</pre>
        </details>
      )}
    </section>
  );
}
