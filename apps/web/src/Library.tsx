import { useEffect, useState } from "react";
import { Search, Play, Download, FileUp } from "lucide-react";
import { api, downloadJson, Json, pretty } from "./api";
import { SchemaForm } from "./SchemaForm";
import { ApiStreams } from "./Streams";
import { Empty, JsonEditor, Notice } from "./components";

export function Library() {
  const [operations, setOperations] = useState<Json[]>([]),
    [query, setQuery] = useState(""),
    [family, setFamily] = useState("all"),
    [selected, setSelected] = useState<Json>(null),
    [schema, setSchema] = useState<Json>(null),
    [recipe, setRecipe] = useState<Json>({
      path: {},
      query: {},
      headers: {},
      body: {},
      credentialRef: "project",
    }),
    [result, setResult] = useState<Json>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [intent, setIntent] = useState(false),
    [tab, setTab] = useState("Request"),
    [fileField, setFileField] = useState("file"),
    [form, setForm] = useState(false),
    [validation, setValidation] = useState<Json>(null),
    [streams, setStreams] = useState(false),
    [runId, setRunId] = useState("");
  useEffect(() => {
    api("/library/operations")
      .then((data) =>
        setOperations(Array.isArray(data) ? data : (data.operations ?? [])),
      )
      .catch((e) => setError(e.message));
  }, []);
  const choose = async (op: Json) => {
    setSelected(op);
    setResult(null);
    setError("");
    setIntent(false);
    setRecipe({
      operationId: op.id,
      path: {},
      query: {},
      headers: {},
      ...(op.requestBody ? { body: {} } : {}),
      credentialRef: op.credentialClass ?? "project",
      ...(op.contentTypes?.length ? { contentType: op.contentTypes[0] } : {}),
    });
    try {
      setSchema(await api(`/library/operations/${encodeURIComponent(op.id)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const filtered = operations.filter(
    (o) =>
      (family === "all" || o.family === family) &&
      `${o.id} ${o.title} ${o.path} ${o.description ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const execute = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api("/library/execute", {
        ...recipe,
        operationId: selected.id,
        ...(intent
          ? { intent: { confirmed: true, operationId: selected.id } }
          : {}),
      });
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const observe = async (kind: "paginate" | "poll") => {
    setBusy(true);
    setError("");
    setTab("Result");
    try {
      const run = await api("/library/" + kind, {
        recipe,
        maxPages: 3,
        maxPolls: 10,
      });
      setRunId(run.id);
      for (;;) {
        const next = await api("/library/runs/" + run.id);
        if (next.status !== "running") {
          setResult(next.result ?? next);
          if (next.error) setError(next.error);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunId("");
      setBusy(false);
    }
  };
  return (
    <div className="page library">
      <header className="page-header">
        <div>
          <h1>OpenAI API library</h1>
          <p className="muted">
            Source-backed operations · Separate from voice sessions
          </p>
        </div>
        <button onClick={() => setStreams((v) => !v)}>Stream console</button>
        <button
          onClick={() => downloadJson(recipe, "sona-api-recipe.json")}
          disabled={!selected}
        >
          <Download size={16} />
          Export recipe
        </button>
      </header>
      {streams && <ApiStreams />}
      <div className="library-top">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Search API operations"
            value={query}
            placeholder="Search operations, paths, or models…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="API family"
          value={family}
          onChange={(e) => setFamily(e.target.value)}
        >
          <option value="all">All families</option>
          {[...new Set(operations.map((o) => o.family))].sort().map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>
      <p className="muted small">
        {filtered.length} of {operations.length} operations. Catalog coverage is
        not live verification. Loading this page makes no paid API call.
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="library-layout">
        <nav className="operation-list" aria-label="API operations">
          {filtered.map((o) => (
            <button
              className={selected?.id === o.id ? "selected" : ""}
              onClick={() => void choose(o)}
              key={o.id}
            >
              <span className={`method method-${o.method?.toLowerCase()}`}>
                {o.method?.toUpperCase()}
              </span>
              <span>
                <strong>{o.title ?? o.id}</strong>
                <small>{o.path}</small>
                {o.deprecated && <span className="badge">Deprecated</span>}
                {o.preview && <span className="badge">Preview</span>}
              </span>
            </button>
          ))}
        </nav>
        <div className="operation-editor">
          {!selected ? (
            <Empty title="Select an operation">
              Inspect its documented fields, source, lifecycle, and execution
              coverage. Then make an explicit request.
            </Empty>
          ) : (
            <>
              <h2>{selected.title ?? selected.id}</h2>
              <p className="muted">
                {selected.method?.toUpperCase()} {selected.path}
              </p>
              <p>{selected.description}</p>
              <div className="badges">
                <span className="badge">
                  {selected.credentialClass ?? "project"} credential
                </span>
                <span className="badge">Live verification needed</span>
                <span className="badge">
                  {selected.lifecycle ?? "Lifecycle unverified"}
                </span>
              </div>
              <div
                className="tabs"
                role="tablist"
                aria-label="Operation panels"
              >
                {["Request", "Schema and source", "Result"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Request" && (
                <>
                  <label className="field">
                    Credential reference
                    <select
                      value={recipe.credentialRef ?? "project"}
                      onChange={(e) =>
                        setRecipe({ ...recipe, credentialRef: e.target.value })
                      }
                    >
                      <option value="project">Project — OPENAI_API_KEY</option>
                      <option value="admin">
                        Administration — OPENAI_ADMIN_KEY
                      </option>
                    </select>
                    <small>
                      Credential values stay on the local server. Enter no
                      tokens in this editor.
                    </small>
                  </label>
                  <div className="row">
                    <button onClick={() => setForm((v) => !v)}>
                      {form ? "JSON view" : "Form view"}
                    </button>
                    <button
                      onClick={() =>
                        void api("/library/validate", recipe)
                          .then(setValidation)
                          .catch((e) => setError(e.message))
                      }
                    >
                      Validate request
                    </button>
                  </div>
                  {validation && (
                    <Notice error={!validation.valid}>
                      {validation.valid
                        ? "The request matches the source schema. Account and model access remain unverified."
                        : pretty(validation.issues)}
                    </Notice>
                  )}
                  {form && schema && (
                    <>
                      <label className="field">
                        Content type
                        <select
                          value={recipe.contentType ?? ""}
                          onChange={(e) =>
                            setRecipe({
                              ...recipe,
                              contentType: e.target.value,
                            })
                          }
                        >
                          {selected.contentTypes?.map((c: string) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      {["path", "query", "headers"].map((location) => (
                        <SchemaForm
                          key={location}
                          schema={{
                            type: "object",
                            properties: Object.fromEntries(
                              (schema.operation?.parameters ?? [])
                                .filter(
                                  (p: Json) =>
                                    p.in ===
                                    (location === "headers"
                                      ? "header"
                                      : location),
                                )
                                .map((p: Json) => [p.name, p.schema ?? {}]),
                            ),
                            required: (schema.operation?.parameters ?? [])
                              .filter(
                                (p: Json) =>
                                  p.required &&
                                  p.in ===
                                    (location === "headers"
                                      ? "header"
                                      : location),
                              )
                              .map((p: Json) => p.name),
                          }}
                          value={recipe[location] ?? {}}
                          onChange={(v) =>
                            setRecipe({ ...recipe, [location]: v })
                          }
                          label={location}
                          components={schema.components}
                        />
                      ))}
                      {selected.requestBody && (
                        <SchemaForm
                          schema={
                            schema.operation?.requestBody?.content?.[
                              recipe.contentType
                            ]?.schema ?? {}
                          }
                          value={recipe.body}
                          onChange={(v) => setRecipe({ ...recipe, body: v })}
                          components={schema.components}
                        />
                      )}
                    </>
                  )}
                  <JsonEditor
                    label="Request recipe"
                    rows={18}
                    value={recipe}
                    onChange={(v) => {
                      setRecipe(v);
                      setIntent(false);
                    }}
                  />
                  <p className="muted small">
                    Use path, query, headers, body, and contentType. Omit a key
                    to omit its value; use null only where the source permits
                    null. Nested objects, arrays, and union variants stay
                    intact.
                  </p>
                  {selected.contentTypes?.some((x: string) =>
                    x.includes("multipart"),
                  ) && (
                    <div className="upload">
                      <label className="field">
                        File field name
                        <input
                          value={fileField}
                          onChange={(e) => setFileField(e.target.value)}
                        />
                      </label>
                      <label className="file-button">
                        <FileUp size={16} />
                        Choose file
                        <input
                          type="file"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const data = await new Promise<string>(
                              (resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = () =>
                                  resolve(String(reader.result).split(",")[1]);
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                              },
                            );
                            setRecipe({
                              ...recipe,
                              files: {
                                ...recipe.files,
                                [fileField]: {
                                  name: file.name,
                                  mediaType:
                                    file.type || "application/octet-stream",
                                  dataBase64: data,
                                },
                              },
                            });
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {selected.requiresIntent && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={intent}
                        onChange={(e) => setIntent(e.target.checked)}
                      />
                      I intend to run this operation. It can incur costs or
                      change external resources.
                    </label>
                  )}
                  <button
                    className="primary"
                    disabled={busy || (selected.requiresIntent && !intent)}
                    onClick={() => {
                      setTab("Result");
                      void execute();
                    }}
                  >
                    <Play size={16} />
                    {busy ? "Request in progress…" : "Run request"}
                  </button>
                  {selected.method === "GET" && (
                    <div className="row">
                      <button
                        disabled={busy}
                        onClick={() => void observe("paginate")}
                      >
                        Read pages (up to 3)
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void observe("poll")}
                      >
                        Poll job (up to 10)
                      </button>
                    </div>
                  )}
                  <p className="muted small">
                    No invoice cap is implied. Inspect prices and resource IDs
                    before a paid or destructive request.
                  </p>
                </>
              )}
              {tab === "Schema and source" && (
                <>
                  <p>
                    <a
                      href={
                        selected.source ??
                        "https://developers.openai.com/api/reference"
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official source
                    </a>
                  </p>
                  <p>
                    Source revision:{" "}
                    {selected.sourceRevision ?? schema?.sourceRevision}
                  </p>
                  <p>
                    Defaults that the source does not state are not documented.
                    Model and transport restrictions apply.
                  </p>
                  <details open>
                    <summary>Operation schema</summary>
                    <pre>{pretty(schema?.operation ?? selected)}</pre>
                  </details>
                  <details>
                    <summary>Referenced schemas</summary>
                    <pre>{pretty(schema?.components)}</pre>
                  </details>
                  <details>
                    <summary>Coverage and execution handlers</summary>
                    <pre>
                      {pretty({
                        handlers: selected.handlers,
                        lifecycle: selected.lifecycle,
                        lifecycleVerified: selected.lifecycleVerified,
                        verification: "Not live verified",
                      })}
                    </pre>
                  </details>
                </>
              )}
              {tab === "Result" && runId && (
                <button
                  onClick={() =>
                    void api("/library/runs/" + runId + "/cancel", {}).catch(
                      (e) => setError(e.message),
                    )
                  }
                >
                  Stop local observation
                </button>
              )}
              {tab === "Result" &&
                (busy ? (
                  <Notice>
                    Request in progress. Long-running service jobs can continue
                    after a local connection closes.
                  </Notice>
                ) : result ? (
                  <>
                    <div className="row spread">
                      <h3>Result · {result.status ?? "Complete"}</h3>
                      <button
                        onClick={() =>
                          downloadJson(result, "sona-api-result.json")
                        }
                      >
                        <Download size={16} />
                        Export result
                      </button>
                    </div>
                    <p className="muted">
                      Request: {result.requestId ?? "Not returned"} ·{" "}
                      {result.elapsedMs ?? "Unknown"} ms
                    </p>
                    {result.binary && (
                      <button
                        onClick={() => {
                          const binary = result.binary;
                          const bytes = Uint8Array.from(
                            atob(
                              binary.dataBase64 ??
                                binary.base64 ??
                                binary.data ??
                                "",
                            ),
                            (c) => c.charCodeAt(0),
                          );
                          const url = URL.createObjectURL(
                            new Blob([bytes], {
                              type:
                                binary.mediaType ?? "application/octet-stream",
                            }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "openai-result";
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}
                      >
                        Download binary result
                      </button>
                    )}
                    <pre>{pretty(result)}</pre>
                  </>
                ) : (
                  <Empty title="No request result">
                    Run the request to see its status, output, events, and
                    identifiers.
                  </Empty>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
