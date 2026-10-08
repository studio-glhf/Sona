import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  Clock3,
  Code2,
  Download,
  Link,
  Menu,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  UserRound,
  X,
  Copy,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Agent,
  api,
  collection,
  download,
  Json,
  Session,
  setLocalToken,
  Study,
} from "./api";
import { AgentPanel } from "./AgentPanel";
import { Connections } from "./Connections";
import { Evidence } from "./Evidence";
import { Library } from "./Library";
import { RunForm, StudyPage } from "./Studies";
import {
  ActionButton,
  Clock,
  Devices,
  Modal,
  Notice,
  Orb,
  SessionControls,
  Toggle,
  useAutosave,
} from "./components";
import { useVoice } from "./useVoice";
import { WorkspaceSettings } from "./WorkspaceSettings";

export default function App() {
  const [data, setData] = useState<Json>(null),
    [agents, setAgents] = useState<Agent[]>([]),
    [studies, setStudies] = useState<Study[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [connections, setConnections] = useState<Json[]>([]),
    [selected, setSelected] = useState(
      localStorage.getItem("sona-agent") ?? "",
    ),
    [page, setPage] = useState("workspace"),
    [studyId, setStudyId] = useState(""),
    [error, setError] = useState(""),
    [devices, setDevices] = useState(false),
    [run, setRun] = useState<Json>(null),
    [view, setView] = useState<"researcher" | "participant" | "handoff">(() =>
      sessionStorage.getItem("sona-view") === "participant"
        ? "handoff"
        : "researcher",
    ),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [sidebar, setSidebar] = useState(false),
    [controls, setControls] = useState(false),
    [history, setHistory] = useState<Session | null>(null),
    [rename, setRename] = useState(false),
    [nextCondition, setNextCondition] = useState<Json>(null);
  const voice = useVoice();
  const agent = agents.find((a) => a.id === selected) ?? agents[0];
  const study = studies.find((s) => s.id === studyId);
  const saved = useAutosave(
    agent ? `/agents/${agent.id}` : null,
    agent ? { name: agent.name, draft: agent.draft } : null,
  );
  const refresh = async () => {
    const result = await api("/bootstrap");
    setLocalToken(result.csrfToken);
    setData(result);
    setAgents(collection(result.agents, "agents"));
    setStudies(collection(result.studies, "studies"));
    setSessions(collection(result.sessions, "sessions"));
    setConnections(collection(result.connections, "connections"));
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (selected) localStorage.setItem("sona-agent", selected);
  }, [selected]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        view === "researcher"
      ) {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view]);
  const changeView = (next: "researcher" | "participant" | "handoff") => {
    setView(next);
    sessionStorage.setItem(
      "sona-view",
      next === "researcher" ? "researcher" : "participant",
    );
    if (voice.active && next !== "handoff")
      void voice.sendEvent({ type: "view.changed", view: next });
  };
  const choose = (id: string) => {
    setSelected(id);
    setPage("workspace");
    setHistory(null);
    setSidebar(false);
  };
  const update = (draft: Json) =>
    setAgents((old) =>
      old.map((a) =>
        a.id === agent?.id ? { ...a, draft, name: draft.name ?? a.name } : a,
      ),
    );
  const createAgent = async (config?: Json) => {
    try {
      const next = await api("/agents", {
        name: config?.name ?? `Agent ${agents.length + 1}`,
        config: config ?? {
          ...data.defaultConfig,
          name: `Agent ${agents.length + 1}`,
        },
      });
      setAgents((old) => [next, ...old]);
      choose(next.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const start = async () => {
    try {
      if (!agent) return;
      await api(
        `/agents/${agent.id}`,
        { name: agent.name, draft: agent.draft },
        "PATCH",
      );
      setHistory(null);
      changeView("researcher");
      await voice.start({
        agentId: agent.id,
        config: agent.draft,
        mode: "quick",
        researcherParticipant: true,
        view: "researcher",
        devices: { input: voice.input, output: voice.output },
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onStudyRun = async (s: Study, condition: Json, initial?: Json) => {
    try {
      const saved = await api(`/studies/${s.id}`, s, "PATCH"),
        a = agents.find((a) => a.id === condition.agentId),
        versions = a ? await api(`/agents/${a.id}/revisions`) : [],
        before = versions.find(
          (r: Json) => r.id === condition.revisionId,
        )?.configuration,
        differences =
          before && a
            ? await api("/config/diff", { before, after: a.draft })
            : [];
      const context = {
        study: saved,
        condition,
        initial,
        draft: a?.draft,
        differences,
      };
      if (
        initial &&
        !differences.length &&
        (
          await api(
            `/studies/${s.id}/consent?participantCode=${encodeURIComponent(initial.participantCode)}`,
          )
        ).applicable
      )
        await startRun(
          { ...initial, view: condition.view ?? "researcher" },
          context,
        );
      else setRun(context);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const startRun = async (values: Json, override?: Json) => {
    const context = override ?? run;
    if (!context) return;
    try {
      setRun(null);
      let condition = context.condition;
      if (values.useDraft && context.draft) {
        const revision = await api(`/agents/${condition.agentId}/revisions`, {
          config: context.draft,
          name: condition.name + " next run",
        });
        condition = { ...condition, revisionId: revision.id };
        context.study = await api(
          `/studies/${context.study.id}`,
          {
            ...context.study,
            conditions: context.study.conditions.map((c: Json) =>
              c.id === condition.id ? condition : c,
            ),
          },
          "PATCH",
        );
      }
      const chosen =
        condition.agentId ?? agents.find((a) => a.id === agent?.id)?.id;
      setPage("workspace");
      setHistory(null);
      choose(chosen);
      changeView(values.view);
      await voice.start({
        ...values,
        mode: "study",
        studyId: context.study.id,
        conditionId: condition.id,
        agentId: chosen,
        devices: { input: voice.input, output: voice.output },
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setRun({ ...context, initial: values });
    }
  };
  const openSession = async (id: string) => {
    try {
      setHistory(await api(`/sessions/${id}`));
      setPage("workspace");
      setSidebar(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const shown = history ?? voice.session;
  const status =
    voice.runtime.status === "approval-needed"
      ? "Approval needed"
      : voice.speaking
        ? "Speaking"
        : voice.runtime.status === "tool-running"
          ? "Tool running"
          : voice.active
            ? voice.muted
              ? "Microphone muted"
              : voice.state === "connecting"
                ? "Connecting"
                : voice.state === "lost"
                  ? "Connection lost"
                  : "Listening"
            : shown
              ? "Session ended"
              : "Ready when you are";
  const evidence = history?.events ?? voice.events;
  const recorded = (shown?.kind ?? shown?.mode) === "study";
  const activeStudy = recorded
    ? studies.find((s) => s.id === shown?.studyId)
    : undefined;
  useEffect(() => {
    setNextCondition(null);
    if (!activeStudy || !shown?.participantCode || voice.active) return;
    let disposed = false;
    void Promise.all([
      api(`/studies/${activeStudy.id}/assignments`),
      api("/sessions"),
    ])
      .then(([assignments, records]) => {
        if (disposed) return;
        const assignment = assignments.find(
          (a: Json) => a.participantCode === shown.participantCode,
        );
        const completed = new Set(
          records
            .filter(
              (s: Json) =>
                s.studyId === activeStudy.id &&
                s.participantCode === shown.participantCode &&
                s.state === "ended",
            )
            .map((s: Json) => s.conditionId),
        );
        const next = assignment?.order?.find(
          (id: string) => !completed.has(id),
        );
        setNextCondition(
          activeStudy.conditions.find((c: Json) => c.id === next) ?? null,
        );
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
    };
  }, [shown?.id, voice.state, activeStudy?.id]);
  const sessionWithMeasures = shown
    ? {
        ...shown,
        measures: shown.snapshot.protocol?.measures ?? activeStudy?.measures,
      }
    : null;
  if (!data)
    return (
      <main className="loading">
        <h1>Sona</h1>
        {error ? (
          <Notice error>{error}</Notice>
        ) : (
          <p>Opening the local workspace…</p>
        )}
      </main>
    );
  if (view !== "researcher")
    return (
      <main className="participant">
        <header>
          <strong className="brand">Sona</strong>
          <div className="row">
            <span>
              {view === "handoff" ? "Researcher handoff" : "Participant view"}
            </span>
            {view === "participant" && (
              <button onClick={() => changeView("handoff")}>
                <UserRound size={18} />
                Researcher
              </button>
            )}
          </div>
        </header>
        <div className="participant-status">
          <p>
            {recorded ? "Transcript saved" : "Live transcript · Not saved"} ·
            Raw audio not saved
          </p>
          <Clock seconds={voice.elapsed} />
        </div>
        {view === "handoff" ? (
          <div className="handoff">
            <h1>Return to the researcher</h1>
            <p>
              Research evidence stays hidden until the researcher resumes
              control.
            </p>
            <button
              className="primary"
              onClick={() => changeView("researcher")}
            >
              Return to researcher view
            </button>
          </div>
        ) : (
          <div className="participant-voice">
            <Orb active={voice.active && !voice.muted} />
            <h1 aria-live="polite">{status}</h1>
            {!voice.active && recorded && activeStudy && (
              <ParticipantRatings
                session={shown!}
                measures={activeStudy.measures ?? []}
              />
            )}
          </div>
        )}
        {voice.error && <Notice error>{voice.error}</Notice>}
        <SessionControls
          voice={voice}
          onStart={() => changeView("handoff")}
          startLabel="Return to researcher"
          onDevices={() => setDevices(true)}
        />
        {devices && <Devices voice={voice} onClose={() => setDevices(false)} />}
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <aside
        className={`sidebar ${sidebar ? "open" : ""}`}
        aria-label="Workspace navigation"
      >
        <header>
          <strong className="brand">Sona</strong>
          <button
            className="icon sidebar-close"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          >
            <X />
          </button>
        </header>
        <button className="new-agent" onClick={() => void createAgent()}>
          <Plus size={19} />
          New agent
        </button>
        <label className="import-agent">
          <Upload size={16} />
          <span>Import agent</span>
          <input
            type="file"
            aria-label="Import agent"
            accept=".json,application/json"
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (f) await createAgent(JSON.parse(await f.text()));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
        <nav>
          <div className="nav-group">
            <h2>Agents</h2>
            {agents.map((a) => (
              <button
                key={a.id}
                className={
                  page === "workspace" && agent?.id === a.id && !history
                    ? "selected"
                    : ""
                }
                onClick={() => choose(a.id)}
              >
                <Activity size={19} />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
          <div className="nav-group">
            <div className="section-heading">
              <h2>Studies</h2>
              <button
                className="icon"
                aria-label="New study"
                onClick={async () => {
                  try {
                    const s = await api("/studies", {
                      name: `Study ${studies.length + 1}`,
                      question: "",
                      task: "",
                      conditions: [],
                    });
                    setStudies((old) => [s, ...old]);
                    setStudyId(s.id);
                    setPage("study");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            {studies.map((s) => (
              <button
                key={s.id}
                className={
                  page === "study" && studyId === s.id ? "selected" : ""
                }
                onClick={() => {
                  setStudyId(s.id);
                  setPage("study");
                  setSidebar(false);
                }}
              >
                <BookOpen size={18} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <div className="nav-group">
            <h2>Recent sessions</h2>
            {sessions.slice(0, 8).map((s) => (
              <button key={s.id} onClick={() => void openSession(s.id)}>
                <Clock3 size={18} />
                <span>
                  Session {s.id.slice(0, 6)}
                  <small>
                    {s.startedAt
                      ? new Date(s.startedAt).toLocaleTimeString()
                      : ""}{" "}
                    · {s.kind === "quick" ? "Quick test" : "Study"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div className="nav-bottom">
          <button
            onClick={() => setPage("library")}
            className={page === "library" ? "selected" : ""}
          >
            <Code2 size={19} />
            API library
          </button>
          <button
            onClick={() => setPage("connections")}
            className={page === "connections" ? "selected" : ""}
          >
            <Link size={19} />
            Connections
          </button>
          <button
            onClick={() => setPage("settings")}
            className={page === "settings" ? "selected" : ""}
          >
            <Settings size={19} />
            Settings
          </button>
          <button onClick={() => setSearch(true)}>
            <Search size={18} />
            Search <kbd>⌘/Ctrl K</kbd>
          </button>
        </div>
      </aside>
      <main id="main" className="main">
        <div className="mobile-toolbar">
          <button aria-label="Open navigation" onClick={() => setSidebar(true)}>
            <Menu size={19} />
          </button>
          <span>Sona</span>
          {page === "workspace" && agent && (
            <button onClick={() => setControls((v) => !v)}>
              <SlidersHorizontal size={18} />
              Agent controls
            </button>
          )}
        </div>
        {error && <Notice error>{error}</Notice>}
        {
          <div className="surface" hidden={page !== "workspace"}>
            {agent ? (
              <>
                <header className="workspace-header">
                  <div>
                    <button
                      className="title-button"
                      onClick={() => setRename(true)}
                      disabled={Boolean(shown)}
                    >
                      <h1>
                        {shown?.snapshot?.configuration?.name ?? agent.name}
                      </h1>
                    </button>
                    <span className="badge">
                      {recorded ? "Study run" : "Quick test"}
                    </span>
                    <p>
                      Researcher view
                      {shown
                        ? ` · Snapshot ${shown.snapshot?.configurationHash?.slice(0, 8) ?? shown.id.slice(0, 8)}`
                        : ""}
                    </p>
                  </div>
                  <Toggle
                    label="Participant view"
                    checked={false}
                    onChange={() => changeView("participant")}
                  />
                </header>
                <section className="voice-area" aria-label="Voice session">
                  <Orb active={voice.active && !voice.muted} />
                  <h2 aria-live="polite">
                    {history ? "Saved session" : status}
                  </h2>
                  <Clock seconds={voice.elapsed} />
                  <p className="recording-state">
                    <span className="status-dot" />
                    {recorded
                      ? "Study transcript saved"
                      : "Live transcript · Not saved"}
                    <span className="recording-detail">
                      Raw audio not saved
                      {(shown?.snapshot?.configuration ?? agent.draft).settings
                        ?.audio?.input?.transcription
                        ? " · Input transcription on"
                        : " · Input transcription off"}
                    </span>
                  </p>
                  {!voice.active && !data.readiness.openaiConfigured && (
                    <button
                      className="readiness-link"
                      onClick={() => setPage("settings")}
                    >
                      Add API key
                    </button>
                  )}
                  {voice.error && (
                    <Notice error>
                      {voice.error}
                      <button onClick={() => void voice.resumeAudio()}>
                        Resume audio
                      </button>
                    </Notice>
                  )}
                  <SessionControls
                    voice={voice}
                    onStart={() => void start()}
                    onDevices={() => setDevices(true)}
                  />
                  {shown && !voice.active && (
                    <div className="row center">
                      {recorded && nextCondition && activeStudy && (
                        <button
                          className="primary"
                          onClick={() =>
                            void onStudyRun(activeStudy, nextCondition, {
                              participantCode: shown.participantCode,
                              researcherParticipant:
                                shown.researcherParticipant,
                            })
                          }
                        >
                          Start next run · {nextCondition.name}
                        </button>
                      )}
                      {recorded && (
                        <ActionButton
                          action={() =>
                            download(
                              `/sessions/${shown.id}/export`,
                              "sona-session.json",
                            )
                          }
                        >
                          <Download size={16} />
                          Export session
                        </ActionButton>
                      )}
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              "Delete this local session record? Exports and external actions are separate.",
                            )
                          ) {
                            try {
                              await api(
                                `/sessions/${shown.id}`,
                                undefined,
                                "DELETE",
                              );
                              setHistory(null);
                              await refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }
                        }}
                      >
                        Delete session
                      </button>
                    </div>
                  )}
                </section>
                <Evidence
                  events={evidence}
                  session={sessionWithMeasures}
                  runtime={
                    history
                      ? { metrics: history.metrics, actions: history.actions }
                      : voice.runtime
                  }
                  active={voice.active}
                />
              </>
            ) : (
              <div className="welcome">
                <Orb />
                <h1>A workspace for voice experiments</h1>
                <p>
                  Create a use-case-neutral agent, connect tools, then test its
                  behavior with your voice.
                </p>
                <button className="primary" onClick={() => void createAgent()}>
                  <Plus size={18} />
                  Create an agent
                </button>
              </div>
            )}
          </div>
        }
        <div className="surface" hidden={page !== "connections"}>
          <Connections connections={connections} onRefresh={refresh} />
        </div>
        <div className="surface" hidden={page !== "library"}>
          <Library />
        </div>
        {studies.map((item) => (
          <div
            className="surface"
            key={item.id}
            hidden={page !== "study" || studyId !== item.id}
          >
            <StudyPage
              study={item}
              agents={agents}
              visible={page === "study" && studyId === item.id}
              sessionRevision={sessions
                .map((s) => `${s.id}:${s.state}`)
                .join(":")}
              onChange={(next) =>
                setStudies((old) =>
                  old.map((s) => (s.id === next.id ? next : s)),
                )
              }
              onRun={(s, c) => void onStudyRun(s, c)}
              onSession={(id) => void openSession(id)}
              onDelete={async (id) => {
                if (voice.active && voice.session?.studyId === id)
                  await voice.end();
                await api(`/studies/${id}`, undefined, "DELETE");
                setStudyId("");
                setPage("workspace");
                await refresh();
              }}
            />
          </div>
        ))}
        {page === "settings" && (
          <WorkspaceSettings
            version={data.version}
            active={voice.active}
            onRefresh={refresh}
            onCredentialChange={(configured) =>
              setData((previous: Json) =>
                previous
                  ? {
                      ...previous,
                      readiness: {
                        ...previous.readiness,
                        openaiConfigured: configured,
                        modelsVerified: [],
                      },
                    }
                  : previous,
              )
            }
            onDevices={() => setDevices(true)}
            onLibrary={() => setPage("library")}
          />
        )}
      </main>
      {agent && (
        <div
          hidden={page !== "workspace"}
          className={`controls-wrap ${controls ? "open" : ""}`}
        >
          <button className="controls-close" onClick={() => setControls(false)}>
            Close controls
          </button>
          <AgentPanel
            agent={agent}
            onChange={update}
            saving={saved}
            active={voice.active}
            applied={
              history?.providerEvidence ?? voice.runtime.providerEvidence
            }
            connections={connections}
            onConnections={() => setPage("connections")}
          />
        </div>
      )}
      {devices && <Devices voice={voice} onClose={() => setDevices(false)} />}{" "}
      {run && (
        <RunForm
          study={run.study}
          condition={run.condition}
          initial={run.initial}
          differences={run.differences}
          retentionDays={data.settings.retentionDays}
          onStart={(values) => void startRun(values)}
          onClose={() => setRun(null)}
        />
      )}{" "}
      {rename && agent && (
        <Modal title="Agent details" onClose={() => setRename(false)}>
          <label className="field">
            Agent name
            <input
              value={agent.name}
              onChange={(e) => update({ ...agent.draft, name: e.target.value })}
            />
          </label>
          <ActionButton
            action={async () => {
              const next = await api(`/agents/${agent.id}/duplicate`, {
                name: `${agent.name} copy`,
              });
              await refresh();
              choose(next.id);
              setRename(false);
            }}
          >
            <Copy size={16} />
            Duplicate agent
          </ActionButton>
          <ActionButton
            action={async () => {
              await api(`/agents/${agent.id}`, undefined, "DELETE");
              setRename(false);
              await refresh();
            }}
          >
            <Trash2 size={16} />
            Delete agent
          </ActionButton>
        </Modal>
      )}
      {search && (
        <Modal title="Workspace search" onClose={() => setSearch(false)}>
          <label className="field">
            Search agents and studies
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {agents
            .filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
            .map((a) => (
              <button
                className="full"
                key={a.id}
                onClick={() => {
                  choose(a.id);
                  setSearch(false);
                }}
              >
                {a.name}
              </button>
            ))}
          {studies
            .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
            .map((s) => (
              <button
                className="full"
                key={s.id}
                onClick={() => {
                  setStudyId(s.id);
                  setPage("study");
                  setSearch(false);
                }}
              >
                {s.name}
              </button>
            ))}
        </Modal>
      )}
    </div>
  );
}
function ParticipantRatings({
  session,
  measures,
}: {
  session: Session;
  measures: Json[];
}) {
  const [ratings, setRatings] = useState<Json>(session.outcome?.ratings ?? {});
  const saved = useAutosave(`/sessions/${session.id}`, {
    outcome: { ratings },
  });
  return (
    <section className="participant-ratings">
      <h2>Session ratings</h2>
      {measures.map((m) => (
        <label className="field" key={m.id}>
          {m.question}
          <select
            value={ratings[m.id] ?? ""}
            onChange={(e) =>
              setRatings({
                ...ratings,
                [m.id]: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          >
            <option value="">Skip / missing</option>
            {Array.from({ length: m.max - m.min + 1 }, (_, i) => i + m.min).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                  {n === m.min
                    ? ` — ${m.lowAnchor}`
                    : n === m.max
                      ? ` — ${m.highAnchor}`
                      : ""}
                </option>
              ),
            )}
          </select>
        </label>
      ))}
      <span role="status">{saved}</span>
    </section>
  );
}
