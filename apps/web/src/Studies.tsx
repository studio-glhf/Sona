import { useEffect, useState } from "react";
import { Plus, Copy, Download, Play, Trash2 } from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Agent,
  api,
  collection,
  download,
  Json,
  pretty,
  Session,
  Study,
} from "./api";
import {
  ActionButton,
  Empty,
  JsonEditor,
  Modal,
  Notice,
  useAutosave,
} from "./components";

export function StudyPage({
  study,
  agents,
  onChange,
  onRun,
  onSession,
  onDelete,
  visible,
  sessionRevision,
}: {
  study: Study;
  agents: Agent[];
  onChange: (s: Study) => void;
  onRun: (s: Study, condition: Json) => void;
  onSession: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  visible: boolean;
  sessionRevision: string;
}) {
  const [tab, setTab] = useState("Prepare"),
    [sessions, setSessions] = useState<Session[]>([]),
    [comparison, setComparison] = useState<Json>({}),
    [participation, setParticipation] = useState("researcher"),
    [view, setView] = useState("researcher"),
    [includeDeviations, setIncludeDeviations] = useState(false),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState(""),
    [selectedCondition, setSelectedCondition] = useState("all"),
    [revisions, setRevisions] = useState<Json>({}),
    [difference, setDifference] = useState<Json>(null);
  const saved = useAutosave(`/studies/${study.id}`, study);
  useEffect(() => {
    void Promise.all(
      agents.map(async (agent) => [
        agent.id,
        await api(`/agents/${agent.id}/revisions`),
      ]),
    )
      .then((rows) => setRevisions(Object.fromEntries(rows)))
      .catch((e) => setError(e.message));
  }, [agents, study.id, study.conditions.map((c) => c.revisionId).join(":")]);
  const update = (key: string, value: Json) => {
    if (key === "conditions") {
      const previous = study.order ?? [],
        order = [
          ...previous.filter((id: string) =>
            value.some((c: Json) => c.id === id),
          ),
          ...value
            .filter((c: Json) => !previous.includes(c.id))
            .map((c: Json) => c.id),
        ];
      onChange({
        ...study,
        conditions: value,
        order,
        ordering:
          study.ordering === "abba" && value.length !== 2
            ? "manual"
            : study.ordering,
      });
    } else if (key === "minutesPerSession")
      onChange({
        ...study,
        minutesPerSession: value,
        conditions: study.conditions.map((c) => ({
          ...c,
          estimatedMinutes: value,
        })),
      });
    else onChange({ ...study, [key]: value });
  };
  useEffect(() => {
    if (tab !== "Compare" || !visible) return;
    api(
      `/studies/${study.id}/compare?researcherParticipant=${participation === "researcher" ? "true" : participation === "participant" ? "false" : "all"}&view=${view}&includeDeviations=${includeDeviations}`,
    )
      .then((data) => {
        setComparison(data);
        setSessions(data.sessions ?? []);
      })
      .catch((e) => setError(e.message));
  }, [
    study.id,
    tab,
    participation,
    view,
    includeDeviations,
    visible,
    sessionRevision,
  ]);
  const conditions = study.conditions ?? [];
  const visibleSessions = sessions.filter(
    (s) => selectedCondition === "all" || s.conditionId === selectedCondition,
  );
  const groups = conditions
    .filter(
      (c: Json) => selectedCondition === "all" || c.id === selectedCondition,
    )
    .map((condition: Json, index: number) => {
      const records = visibleSessions.filter(
        (s) => s.conditionId === condition.id,
      );
      const values = records
        .map((s) => ({
          x:
            s.metrics?.responseLatencyMedianMs == null
              ? null
              : s.metrics.responseLatencyMedianMs / 1000,
          y: index,
          id: s.id,
        }))
        .filter((x) => x.x !== null);
      return {
        condition,
        index,
        records,
        values,
        missing: records.length - values.length,
        missingRatings: records.filter(
          (s) =>
            !s.outcome?.ratings || Object.keys(s.outcome.ratings).length === 0,
        ).length,
        success: records.filter((s) => s.outcome?.taskSuccess === "success")
          .length,
      };
    });
  return (
    <div className="page study-page">
      <header className="page-header">
        <div>
          <h1>{study.name}</h1>
          <p className="muted">
            Researcher view · <span role="status">{saved}</span>
          </p>
        </div>
        <div className="row">
          <button onClick={() => setExporting(true)}>
            <Download size={17} />
            Export
          </button>
          <button
            aria-label="Delete study"
            onClick={() => {
              if (
                confirm(
                  "Delete this study, its local sessions, and consent records? Exports and external actions remain separate.",
                )
              )
                void onDelete(study.id).catch((e) => setError(e.message));
            }}
          >
            <Trash2 size={17} />
            Delete study
          </button>
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Study panels">
        {["Prepare", "Compare"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {error && <Notice error>{error}</Notice>}
      {tab === "Prepare" ? (
        <div className="study-form">
          <label className="field">
            Study name
            <input
              value={study.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </label>
          <label className="field">
            Research question
            <textarea
              rows={2}
              value={study.question ?? ""}
              onChange={(e) => update("question", e.target.value)}
            />
          </label>
          <label className="field">
            Task scenario
            <textarea
              rows={3}
              value={study.task ?? ""}
              onChange={(e) => update("task", e.target.value)}
            />
          </label>
          <div className="section-heading">
            <h2>Conditions</h2>
            <button
              onClick={async () => {
                const agent = agents[0];
                if (!agent) {
                  setError("Add an agent first.");
                  return;
                }
                try {
                  const r = await api(`/agents/${agent.id}/revisions`, {
                    config: agent.draft,
                    name: `${study.name} condition`,
                  });
                  update("conditions", [
                    ...conditions,
                    {
                      id: crypto.randomUUID(),
                      name: `Condition ${conditions.length + 1}`,
                      agentId: agent.id,
                      revisionId: r.id ?? r.revision?.id,
                      view: "researcher",
                      controls: {},
                    },
                  ]);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Plus size={16} />
              Add condition
            </button>
          </div>
          {conditions.length === 0 && (
            <Empty title="Add the first condition">
              Each condition uses a fixed configuration revision.
            </Empty>
          )}
          {conditions.map((c: Json, index: number) => (
            <div className="condition" key={c.id}>
              <div className="row">
                <input
                  aria-label={`Condition ${index + 1} name`}
                  value={c.name}
                  onChange={(e) =>
                    update(
                      "conditions",
                      conditions.map((item: Json) =>
                        item.id === c.id
                          ? { ...item, name: e.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <button
                  aria-label={`Duplicate ${c.name}`}
                  title="Duplicate condition"
                  onClick={() =>
                    update("conditions", [
                      ...conditions,
                      { ...c, id: crypto.randomUUID(), name: `${c.name} copy` },
                    ])
                  }
                >
                  <Copy size={17} />
                </button>
                <button
                  aria-label={`Delete ${c.name}`}
                  onClick={() =>
                    update(
                      "conditions",
                      conditions.filter((item: Json) => item.id !== c.id),
                    )
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="grid-two">
                <label className="field">
                  Agent
                  <select
                    value={c.agentId}
                    onChange={async (e) => {
                      const agent = agents.find((a) => a.id === e.target.value);
                      if (!agent) return;
                      try {
                        const r = await api(`/agents/${agent.id}/revisions`, {
                          config: agent.draft,
                          name: c.name,
                        });
                        update(
                          "conditions",
                          conditions.map((item: Json) =>
                            item.id === c.id
                              ? {
                                  ...item,
                                  agentId: agent.id,
                                  revisionId: r.id ?? r.revision?.id,
                                }
                              : item,
                          ),
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Planned session view
                  <select
                    value={c.view ?? "researcher"}
                    onChange={(e) =>
                      update(
                        "conditions",
                        conditions.map((item: Json) =>
                          item.id === c.id
                            ? { ...item, view: e.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="researcher">Researcher view</option>
                    <option value="participant">Participant view</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Configuration revision
                <select
                  value={c.revisionId}
                  onChange={async (e) => {
                    const next = e.target.value;
                    const diff = await api(
                      `/revisions/diff?before=${c.revisionId}&after=${next}`,
                    );
                    setDifference(diff);
                    update(
                      "conditions",
                      conditions.map((item: Json) =>
                        item.id === c.id ? { ...item, revisionId: next } : item,
                      ),
                    );
                  }}
                >
                  {(revisions[c.agentId] ?? []).map((r: Json) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · Version {r.number}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={async () => {
                  try {
                    const a = agents.find((a) => a.id === c.agentId);
                    if (!a) return;
                    const revision = await api(`/agents/${a.id}/revisions`, {
                      config: a.draft,
                      name: `${c.name} next revision`,
                    });
                    setDifference(
                      await api(
                        `/revisions/diff?before=${c.revisionId}&after=${revision.id}`,
                      ),
                    );
                    setRevisions((prev: Json) => ({
                      ...prev,
                      [a.id]: [revision, ...(prev[a.id] ?? [])],
                    }));
                    update(
                      "conditions",
                      conditions.map((item: Json) =>
                        item.id === c.id
                          ? { ...item, revisionId: revision.id }
                          : item,
                      ),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Use current agent draft
              </button>
              <div className="row spread">
                <small>
                  Fixed revision: {c.revisionId?.slice(0, 10) ?? "Not assigned"}
                </small>
                <button className="primary" onClick={() => onRun(study, c)}>
                  <Play size={15} />
                  Start run
                </button>
              </div>
            </div>
          ))}
          <div className="grid-two">
            <label className="field">
              Condition order
              <select
                value={study.ordering ?? "manual"}
                onChange={(e) =>
                  onChange({
                    ...study,
                    ordering: e.target.value,
                    order: conditions.map((c: Json) => c.id),
                  })
                }
              >
                <option value="manual">Manual selection</option>
                <option value="abba" disabled={conditions.length !== 2}>
                  AB/BA counterbalance
                </option>
              </select>
            </label>
            <label className="field">
              Estimated minutes per session
              <input
                type="number"
                min="1"
                value={study.minutesPerSession ?? 5}
                onChange={(e) =>
                  update("minutesPerSession", Number(e.target.value))
                }
              />
            </label>
          </div>
          {study.ordering === "manual" && (
            <section aria-label="Condition order">
              <h3>Condition order</h3>
              {(study.order?.length
                ? study.order
                : conditions.map((c: Json) => c.id)
              ).map((id: string, index: number, order: string[]) => (
                <div className="row spread" key={id}>
                  <span>
                    {index + 1}.{" "}
                    {conditions.find((c: Json) => c.id === id)?.name ?? id}
                  </span>
                  <div className="row">
                    <button
                      disabled={index === 0}
                      aria-label={
                        "Move " +
                        (conditions.find((c: Json) => c.id === id)?.name ??
                          id) +
                        " up"
                      }
                      onClick={() => {
                        const next = [...order];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        update("order", next);
                      }}
                    >
                      Move up
                    </button>
                    <button
                      disabled={index === order.length - 1}
                      aria-label={
                        "Move " +
                        (conditions.find((c: Json) => c.id === id)?.name ??
                          id) +
                        " down"
                      }
                      onClick={() => {
                        const next = [...order];
                        [next[index + 1], next[index]] = [
                          next[index],
                          next[index + 1],
                        ];
                        update("order", next);
                      }}
                    >
                      Move down
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          <p className="muted">
            {conditions.length} conditions · About{" "}
            {conditions.length * (study.minutesPerSession ?? 5)} minutes per
            participant, before breaks. Focus on one comparison before adding
            combinations.
          </p>
          <label className="field">
            Consent policy
            <textarea
              rows={4}
              value={
                study.consentPolicy?.text ??
                "OpenAI processes speech. Selected external services receive tool requests. Sona saves transcripts, events, ratings, and notes locally for 30 days. Raw audio is not saved. Provider retention is separate."
              }
              onChange={(e) =>
                update("consentPolicy", {
                  ...study.consentPolicy,
                  text: e.target.value,
                  version: study.consentPolicy?.version ?? "1",
                  scope: "session",
                  rawAudio: false,
                })
              }
            />
          </label>
          <JsonEditor
            label="Measures and rating anchors"
            value={
              study.measures ?? [
                {
                  id: "clarity",
                  question: "How clear was the agent?",
                  min: 1,
                  max: 7,
                  lowAnchor: "Not clear",
                  highAnchor: "Very clear",
                },
                {
                  id: "control",
                  question: "How much control did you feel?",
                  min: 1,
                  max: 7,
                  lowAnchor: "None",
                  highAnchor: "Complete",
                },
              ]
            }
            onChange={(v) => update("measures", v)}
            rows={10}
          />
          <small className="muted">
            These suggested scales are not validated questionnaires.
          </small>
        </div>
      ) : (
        <div className="compare">
          <h2>Compare conditions</h2>
          <div className="filters">
            <label className="field">
              Conditions
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
              >
                <option value="all">All conditions</option>
                {conditions.map((c: Json) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Participation
              <select
                value={participation}
                onChange={(e) => setParticipation(e.target.value)}
              >
                <option value="researcher">Researchers</option>
                <option value="participant">Other participants</option>
                <option value="all">Combined groups</option>
              </select>
            </label>
            <label className="field">
              View
              <select value={view} onChange={(e) => setView(e.target.value)}>
                <option value="researcher">Researcher view</option>
                <option value="participant">Participant view</option>
                <option value="all">Combined views</option>
              </select>
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={includeDeviations}
              onChange={(e) => setIncludeDeviations(e.target.checked)}
            />
            Include protocol deviations
          </label>
          {(view === "all" || participation === "all" || includeDeviations) && (
            <Notice>
              Combined groups or protocol deviations are included. This
              selection is recorded in exports.
            </Notice>
          )}
          <p className="muted">
            {new Set(visibleSessions.map((s) => s.participantCode)).size}{" "}
            participants · {visibleSessions.length} sessions ·{" "}
            {comparison.turnCount ?? "Unknown"} turns
          </p>
          <h3>Response-start latency · s</h3>
          <p className="muted">
            One dot per session median. Server event receipt timing; not
            physical speech-to-speaker delay.
          </p>
          {groups.some((g) => g.values.length) ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart>
                  <CartesianGrid stroke="#3c3c3c" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    name="Response latency"
                    unit=" s"
                    stroke="#b4b4b4"
                  />
                  <YAxis
                    dataKey="y"
                    type="number"
                    ticks={groups.map((g) => g.index)}
                    tickFormatter={(v) => groups[v]?.condition.name ?? ""}
                    width={100}
                    stroke="#b4b4b4"
                  />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  {groups.map((g, i) => (
                    <Scatter
                      key={g.condition.id}
                      data={g.values}
                      fill={i % 2 ? "#10cfa6" : "#438fff"}
                      onClick={(point) =>
                        onSession(
                          (point as any).payload?.id ?? (point as any).id,
                        )
                      }
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="No valid latency measurements">
              A missing measurement is not zero. Complete consented sessions
              with the required server events.
            </Empty>
          )}
          <div className="table-scroll">
            <table>
              <caption>
                Condition results. These are descriptive results, not a
                significance test.
              </caption>
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>Sessions</th>
                  <th>Latency missing</th>
                  <th>Ratings missing</th>
                  <th>Task completed</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.condition.id}>
                    <td>{g.condition.name}</td>
                    <td>{g.records.length}</td>
                    <td>{g.missing}</td>
                    <td>{g.missingRatings}</td>
                    <td>
                      {g.success} of {g.records.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Separate comparison groups</h3>
          <p className="muted">
            Tool-active responses and other responses stay separate. Ratings use
            one value per saved session. Missing values stay missing.
          </p>
          <div className="table-scroll">
            <table>
              <caption>Session medians and missing values</caption>
              <thead>
                <tr>
                  <th>Condition / view / participation</th>
                  <th>Participants / sessions / turns</th>
                  <th>Response with tools · s</th>
                  <th>Response without tools · s</th>
                  <th>Tool latency · s</th>
                  <th>Ratings</th>
                </tr>
              </thead>
              <tbody>
                {(comparison.groups ?? [])
                  .filter(
                    (g: Json) =>
                      selectedCondition === "all" ||
                      g.conditionId === selectedCondition,
                  )
                  .map((g: Json) => (
                    <tr
                      key={
                        g.conditionId +
                        g.configurationHash +
                        g.protocolHash +
                        g.conditionSnapshotHash +
                        g.view +
                        g.researcherParticipant
                      }
                    >
                      <td>
                        {g.conditionName}
                        <br />
                        Snapshot {g.configurationHash.slice(0, 8)}
                        <details>
                          <summary>
                            Protocol {g.protocolHash?.slice(0, 8) ?? "Missing"}
                          </summary>
                          <pre>{pretty(g.protocol)}</pre>
                        </details>
                        <br />
                        {g.view} ·{" "}
                        {g.researcherParticipant
                          ? "Researcher participant"
                          : "Other participant"}
                      </td>
                      <td>
                        {g.participantCount} / {g.sessionCount} / {g.turnCount}
                      </td>
                      {[
                        g.responseLatencyWithTools,
                        g.responseLatencyWithoutTools,
                        g.toolLatency,
                      ].map((d: Json, i: number) => (
                        <td key={i}>
                          {d.median === null
                            ? "Missing"
                            : (d.median / 1000).toFixed(3)}
                          <br />
                          {d.count} observed · {d.missing} missing
                        </td>
                      ))}
                      <td>
                        {Object.entries(g.ratings ?? {}).map(
                          ([id, d]: [string, any]) => (
                            <div key={id}>
                              {id}: {d.median ?? "Missing"} · {d.count} observed
                              · {d.missing} missing
                            </div>
                          ),
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>
              {comparison.excluded?.length ?? 0} excluded sessions
            </summary>
            {(comparison.excluded ?? []).map((e: Json) => (
              <p key={e.sessionId}>
                <button onClick={() => onSession(e.sessionId)}>
                  {e.sessionId.slice(0, 8)}
                </button>{" "}
                · {e.reasons.join("; ")}
              </p>
            ))}
          </details>
          <details>
            <summary>Paired participant differences</summary>
            <p>
              Differences are descriptive. Repeated turns do not add
              participants.
            </p>
            <pre>{pretty(comparison.pairedDifferences ?? [])}</pre>
          </details>
          <h2>Sessions</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Participant</th>
                  <th>Condition</th>
                  <th>View</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button onClick={() => onSession(s.id)}>
                        {s.id.slice(0, 8)}
                      </button>
                    </td>
                    <td>{s.participantCode}</td>
                    <td>
                      {conditions.find((c: Json) => c.id === s.conditionId)
                        ?.name ?? s.conditionId}
                    </td>
                    <td>{s.view ?? s.initialView}</td>
                    <td>{s.outcome?.taskSuccess ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {difference && (
        <Modal
          title="Configuration differences"
          onClose={() => setDifference(null)}
        >
          <p>
            This condition uses the selected immutable revision for its next
            run. Active sessions keep their original snapshot.
          </p>
          <pre>{pretty(difference)}</pre>
        </Modal>
      )}
      {exporting && (
        <Modal
          title="Export study evidence"
          onClose={() => setExporting(false)}
        >
          <p>
            Scope: this study, selected condition and comparison filters.
            Exports contain pseudonyms, redacted events, configurations, and
            outcomes. Credentials and raw audio are excluded.
          </p>
          <ActionButton
            action={() =>
              download(
                `/studies/${study.id}/export?format=json&researcherParticipant=${participation === "researcher" ? "true" : participation === "participant" ? "false" : "all"}&view=${view}&includeDeviations=${includeDeviations}&conditionId=${selectedCondition}`,
                `${study.name}.json`,
              )
            }
          >
            Download JSON
          </ActionButton>
          <ActionButton
            action={() =>
              download(
                `/studies/${study.id}/export?format=csv&researcherParticipant=${participation === "researcher" ? "true" : participation === "participant" ? "false" : "all"}&view=${view}&includeDeviations=${includeDeviations}&conditionId=${selectedCondition}`,
                `${study.name}-csv.tar.gz`,
              )
            }
          >
            Download CSV
          </ActionButton>
        </Modal>
      )}
    </div>
  );
}
export function RunForm({
  study,
  condition,
  initial,
  differences,
  retentionDays = 30,
  onStart,
  onClose,
}: {
  study: Study;
  condition: Json;
  initial?: Json;
  differences?: Json[];
  retentionDays?: number;
  onStart: (values: Json) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initial?.participantCode ?? ""),
    [researcher, setResearcher] = useState(
      initial?.researcherParticipant !== false,
    ),
    [consent, setConsent] = useState(false),
    [useDraft, setUseDraft] = useState(false),
    [assignments, setAssignments] = useState<Json[]>([]),
    [consentStatus, setConsentStatus] = useState<Json>({ applicable: false });
  useEffect(() => {
    void api(`/studies/${study.id}/assignments`)
      .then(setAssignments)
      .catch(() => {});
  }, [study.id]);
  useEffect(() => {
    setConsentStatus({ applicable: false });
    if (!code.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      void api(
        `/studies/${study.id}/consent?participantCode=${encodeURIComponent(code.trim())}`,
      )
        .then((value) => {
          if (active) setConsentStatus(value);
        })
        .catch(() => {});
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code, study.id, retentionDays]);
  const existing = assignments.find((a) => a.participantCode === code.trim());
  const base = study.order?.length
    ? study.order
    : study.conditions.map((c) => c.id);
  const order =
    existing?.order ??
    (study.ordering === "abba" && assignments.length % 2
      ? [...base].reverse()
      : base);
  return (
    <Modal title="Start study run" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if ((consentStatus.applicable || consent) && code.trim())
            onStart({
              useDraft,
              participantCode: code.trim(),
              researcherParticipant: researcher,
              consent: consentStatus.applicable
                ? undefined
                : {
                    accepted: true,
                    policy: study.consentPolicy?.text,
                    policyVersion: study.consentPolicy?.version ?? "1",
                    scope: study.consentPolicy?.scope ?? "session",
                    timestamp: new Date().toISOString(),
                  },
              view: condition.view ?? "researcher",
            });
        }}
      >
        <p>
          <strong>{condition.name}</strong> ·{" "}
          {condition.view === "participant"
            ? "Participant view"
            : "Researcher view"}
        </p>
        <p>Fixed revision: {condition.revisionId?.slice(0, 10)}.</p>
        {!!differences?.length && (
          <details>
            <summary>Next-test draft changes ({differences.length})</summary>
            <pre>{pretty(differences)}</pre>
            <label className="check">
              <input
                type="checkbox"
                checked={useDraft}
                onChange={(e) => setUseDraft(e.target.checked)}
              />
              Use this reviewed draft. Start saves and assigns a new revision.
            </label>
          </details>
        )}
        <p>{study.task}</p>
        <p>
          Planned order:{" "}
          {order
            .map(
              (id: string) =>
                study.conditions.find((c) => c.id === id)?.name ?? id,
            )
            .join(" → ")}
          . Actual runs are recorded. Manual selection can differ.
        </p>
        <label className="field">
          Participant study code
          <input
            required
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="For example, P01"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={researcher}
            onChange={(e) => setResearcher(e.target.checked)}
          />
          The participant is also a researcher
        </label>
        <Notice>
          {study.consentPolicy?.text ??
            "OpenAI processes speech. Sona saves transcripts, events, notes, and ratings locally under the workspace retention policy. Raw audio is not saved. Selected tools use external services; their retention policies are separate."}
        </Notice>
        <p>
          Local retention: {retentionDays} days. A later increase does not
          extend this record.
        </p>
        {consentStatus.applicable ? (
          <Notice>
            Existing consent applies to this participant, study policy, and
            retention period.
          </Notice>
        ) : (
          <label className="check">
            <input
              required
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            The participant gives consent for the{" "}
            {study.consentPolicy?.scope ?? "session"} and this policy.
          </label>
        )}
        <button
          className="primary"
          disabled={(!consent && !consentStatus.applicable) || !code.trim()}
          type="submit"
        >
          Start
        </button>
      </form>
    </Modal>
  );
}
