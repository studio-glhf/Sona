import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { api, Json, pretty, Session } from "./api";
import {
  ActionButton,
  Empty,
  Notice,
  SaveState,
  useAutosave,
} from "./components";

export function Evidence({
  events,
  session,
  runtime,
  active = false,
  onUpdated,
}: {
  events: Json[];
  session: Session | null;
  runtime?: Json;
  active?: boolean;
  onUpdated?: () => void;
}) {
  const [tab, setTab] = useState(
      localStorage.getItem("sona-evidence-tab") ?? "Transcript",
    ),
    [notes, setNotes] = useState(""),
    [taskResult, setTaskResult] = useState("unknown"),
    [ratings, setRatings] = useState<Json>({}),
    [codes, setCodes] = useState(""),
    [error, setError] = useState(""),
    [reconciled, setReconciled] = useState<Json>({});
  const [withdrawn, setWithdrawn] = useState(false);
  const recorded = (session?.mode ?? session?.kind) === "study";
  useEffect(() => {
    setWithdrawn(Boolean(session?.snapshot?.consent?.withdrawnAt));
    setNotes(session?.outcome?.notes ?? "");
    setTaskResult(session?.outcome?.taskSuccess ?? "unknown");
    setRatings(session?.outcome?.ratings ?? {});
    setCodes(
      (session?.outcome?.codes ?? [])
        .map((c: Json) => (typeof c === "string" ? c : c.code))
        .join(", "),
    );
  }, [session?.id]);
  const [outcome, setOutcome] = useState<Json>({});
  useEffect(() => {
    setOutcome({
      outcome: {
        notes,
        taskSuccess: taskResult,
        ratings,
        codes: codes
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .map((code) => ({ code })),
      },
    });
  }, [notes, taskResult, ratings, codes]);
  const saveStatus = useAutosave(
    recorded && session ? `/sessions/${session.id}` : null,
    outcome,
  );
  const transcript = new Map<string, Json>();
  for (const event of events) {
    const p = event.payload ?? event;
    const type = event.type ?? p.type ?? "";
    const participant =
      type.includes("input_audio_transcription") ||
      event.source === "participant-transcript" ||
      type === "transcript.participant";
    const generated =
      type.includes("output_audio_transcript") ||
      (type.includes("audio_transcript") && !participant) ||
      type === "transcript.agent";
    if (!participant && !generated) continue;
    const key =
      event.item_id ??
      p.item_id ??
      event.response_id ??
      p.response_id ??
      event.id ??
      String(transcript.size);
    const previous = transcript.get(key);
    const final =
      type.endsWith(".done") ||
      type.endsWith(".completed") ||
      event.final === true;
    const text =
      p.transcript ?? p.text ?? (previous?.text ?? "") + (p.delta ?? "");
    if (text)
      transcript.set(key, {
        key,
        text,
        participant,
        final,
        time: event.receivedAt ?? event.timestamp ?? "",
        source: participant ? "Input transcription" : "Generated speech",
      });
  }
  const metrics = runtime?.metrics ?? session?.metrics ?? {};
  const points = (
    Array.isArray(metrics)
      ? metrics
          .filter((m: Json) => m.name === "response-start-latency")
          .map((m: Json) => ({ ...m, valueMs: m.value }))
      : (metrics.responseLatencies ?? [])
  )
    .filter((x: Json) => typeof x.valueMs === "number")
    .map((x: Json, i: number) => ({ turn: i + 1, seconds: x.valueMs / 1000 }));
  const measures = session?.measures ??
    session?.study?.measures ?? [
      {
        id: "clarity",
        question: "How clear was the agent?",
        min: 1,
        max: 7,
        low: "Not clear",
        high: "Very clear",
      },
      {
        id: "control",
        question: "How much control did you feel?",
        min: 1,
        max: 7,
        low: "None",
        high: "Complete",
      },
      {
        id: "usefulness",
        question: "How useful was the agent?",
        min: 1,
        max: 7,
        low: "Not useful",
        high: "Very useful",
      },
    ];
  return (
    <section className="evidence" aria-label="Session evidence">
      <div className="tabs" role="tablist" aria-label="Evidence panels">
        {["Transcript", "Events", "Charts", "Notes"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              localStorage.setItem("sona-evidence-tab", t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="evidence-body">
        {recorded && session?.snapshot?.consent && (
          <details className="evidence-caption">
            <summary>Participant agreement</summary>
            <ActionButton
              disabled={withdrawn}
              action={async () => {
                if (
                  confirm(
                    "Withdraw this consent? Sona stops sessions that use this record. Existing evidence remains under the retention policy; delete the session or study separately.",
                  )
                ) {
                  await api(
                    `/consents/${session.snapshot.consent.id}/withdraw`,
                    {},
                  );
                  setWithdrawn(true);
                  onUpdated?.();
                }
              }}
            >
              {withdrawn ? "Consent withdrawn" : "Withdraw consent"}
            </ActionButton>
          </details>
        )}
        {!recorded && session && (
          <p className="evidence-caption">Live evidence · Not saved</p>
        )}
        {!session && !events.length ? (
          <div className="evidence-welcome">
            <Activity size={22} aria-hidden="true" />
            <h3>
              {tab === "Notes"
                ? "Notes for this test"
                : "Your conversation appears here"}
            </h3>
            <p>
              {tab === "Notes"
                ? "Your notes and ratings will be ready after you start a test."
                : "Start a voice test to see the conversation, events, and measurements here."}
            </p>
          </div>
        ) : (
          <>
            {tab === "Transcript" && (
              <>
                {transcript.size === 0 ? (
                  <Empty title="Your conversation appears here">
                    Start a voice test. Participant speech appears only when
                    input transcription is on.
                  </Empty>
                ) : (
                  [...transcript.values()].map((line) => (
                    <article className="transcript-line" key={line.key}>
                      <div
                        className={`avatar ${line.participant ? "" : "agent"}`}
                      >
                        {line.participant ? "P" : "S"}
                      </div>
                      <div>
                        <div className="transcript-meta">
                          <strong>
                            {line.participant ? "Participant" : "Agent"}
                          </strong>
                          <span>
                            {line.source} · {line.final ? "Final" : "Partial"}
                          </span>
                        </div>
                        <p>{line.text}</p>
                      </div>
                    </article>
                  ))
                )}
                {transcript.size > 0 && (
                  <p className="muted small">
                    Input transcripts are independent from voice perception.
                    Generated text can include speech that was not heard.
                  </p>
                )}
              </>
            )}
            {tab === "Events" && (
              <>
                {events.length === 0 ? (
                  <Empty title="No events yet">
                    Connection, speech, tools, interruptions, and device changes
                    appear in the timeline.
                  </Empty>
                ) : (
                  <ol className="timeline">
                    {events.map((event, index) => (
                      <li key={event.id ?? event.event_id ?? index}>
                        <details>
                          <summary>
                            <time>
                              {event.receivedAt
                                ? new Date(
                                    event.receivedAt,
                                  ).toLocaleTimeString()
                                : String(index + 1).padStart(3, "0")}
                            </time>
                            <strong>
                              {event.type ?? event.payload?.type ?? "Event"}
                            </strong>
                            <span>
                              {event.source ?? event.clockSource ?? ""}
                            </span>
                          </summary>
                          <pre>{pretty(event)}</pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
            {tab === "Charts" && (
              <>
                <h3>Response-start latency · s</h3>
                <p className="muted">
                  Server speech-stop receipt to audio-stream-start receipt. This
                  does not measure physical speech-to-speaker delay.
                </p>
                {points.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={230}>
                      <LineChart data={points}>
                        <CartesianGrid stroke="#3c3c3c" />
                        <XAxis dataKey="turn" stroke="#b4b4b4" />
                        <YAxis unit=" s" stroke="#b4b4b4" />
                        <Tooltip />
                        <Line
                          dataKey="seconds"
                          stroke="#438fff"
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <table>
                      <caption>Response latency measurements</caption>
                      <thead>
                        <tr>
                          <th>Turn</th>
                          <th>Seconds</th>
                        </tr>
                      </thead>
                      <tbody>
                        {points.map((p: Json) => (
                          <tr key={p.turn}>
                            <td>{p.turn}</td>
                            <td>{p.seconds}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <Empty title="No valid measurements">
                    Missing:{" "}
                    {metrics.responseLatencyMissingReason ??
                      "The required server events or a common clock are not available."}
                  </Empty>
                )}
                <h3>Tool latency</h3>
                <p className="muted">
                  Dispatch to result or error, for each visible attempt.
                  Approval wait is separate.
                </p>
                {(runtime?.actions ?? []).length ? (
                  (runtime.actions as Json[]).map((action) => (
                    <details key={action.id}>
                      <summary>
                        {action.toolName ?? action.tool} ·{" "}
                        {action.status ?? action.state}
                      </summary>
                      <pre>{pretty(reconciled[action.id] ?? action)}</pre>
                      {(reconciled[action.id]?.state ?? action.state) ===
                        "unknown" && (
                        <>
                          <p>
                            The external result is unknown. Reconciliation uses
                            a configured read. It does not repeat the write.
                          </p>
                          <ActionButton
                            action={async () => {
                              const next = await api(
                                `/actions/${encodeURIComponent(action.id)}/reconcile`,
                                {},
                              );
                              setReconciled({
                                ...reconciled,
                                [action.id]: next,
                              });
                              onUpdated?.();
                            }}
                          >
                            Reconcile result
                          </ActionButton>
                        </>
                      )}
                    </details>
                  ))
                ) : (
                  <p className="muted">No tool attempts in this session.</p>
                )}
              </>
            )}
            {tab === "Notes" && (
              <>
                <div className="row spread">
                  <h3>Outcomes and notes</h3>
                  <SaveState
                    status={recorded ? saveStatus : "Temporary — not saved"}
                  />
                </div>
                <label className="field">
                  Task outcome
                  <select
                    value={taskResult}
                    onChange={(e) => setTaskResult(e.target.value)}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="success">Success</option>
                    <option value="partial">Partial success</option>
                    <option value="failure">Failure</option>
                  </select>
                </label>
                <label className="field">
                  Researcher notes
                  <textarea
                    value={notes}
                    rows={6}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <label className="field">
                  Error and recovery codes
                  <input
                    value={codes}
                    onChange={(e) => setCodes(e.target.value)}
                    placeholder="Separate codes with commas"
                  />
                </label>
                <h3>Participant ratings</h3>
                {measures.map((m: Json) => (
                  <label className="field" key={m.id}>
                    {m.question}
                    <select
                      value={ratings[m.id] ?? ""}
                      onChange={(e) =>
                        setRatings({
                          ...ratings,
                          [m.id]:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">Skipped / missing</option>
                      {Array.from(
                        { length: (m.max ?? 7) - (m.min ?? 1) + 1 },
                        (_, i) => i + (m.min ?? 1),
                      ).map((value) => (
                        <option key={value} value={value}>
                          {value}
                          {value === m.min
                            ? ` — ${m.lowAnchor ?? m.low}`
                            : value === m.max
                              ? ` — ${m.highAnchor ?? m.high}`
                              : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </>
            )}
            {error && <Notice error>{error}</Notice>}
          </>
        )}
      </div>
    </section>
  );
}
