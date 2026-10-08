import { useEffect, useRef, useState } from "react";
import { Plus, Link, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { api, Json, pretty } from "./api";
import { ActionButton, Empty, JsonEditor, Modal, Notice } from "./components";

export function Connections({
  connections,
  onRefresh,
}: {
  connections: Json[];
  onRefresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false),
    [manifest, setManifest] = useState<Json>({
      name: "My MCP server",
      version: "1",
      mcpServers: {
        "my-server": { type: "http", url: "https://example.com/mcp" },
      },
    }),
    [error, setError] = useState(""),
    [bridge, setBridge] = useState<Json>(null),
    [selected, setSelected] = useState<Json>(null),
    [policy, setPolicy] = useState<Json>({}),
    [bindings, setBindings] = useState<Json>({}),
    [instructionsApproved, setInstructionsApproved] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    const refresh = () =>
      void refreshRef.current().catch((e) => setError(e.message));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="page connections">
      <header className="page-header">
        <div>
          <h1>Connections</h1>
          <p className="muted">
            Real tools · Authorized accounts · Explicit permissions
          </p>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus size={17} />
          Add plugin or MCP
        </button>
      </header>
      {error && <Notice error>{error}</Notice>}
      {authorizationUrl && (
        <Notice>
          <a href={authorizationUrl} target="_blank" rel="noopener noreferrer">
            Continue provider sign-in
          </a>
          . Return here after sign-in. Discover tools to verify access.
        </Notice>
      )}
      <div className="connection-options">
        <button
          onClick={() =>
            void run(async () => {
              const data = await api("/connections/bridge", {});
              setBridge(data);
              if (data.authorizationUrl)
                window.open(
                  data.authorizationUrl,
                  "_blank",
                  "noopener,noreferrer",
                );
            })
          }
        >
          <Link size={20} />
          <span>
            Use ChatGPT connections
            <small>Check the official local runtime</small>
          </span>
        </button>
        <button
          onClick={() =>
            void run(() => api("/connections/google-calendar", {}))
          }
        >
          <Plus size={20} />
          <span>
            Add Google Calendar<small>Direct MCP authorization</small>
          </span>
        </button>
      </div>
      {bridge && (
        <Notice>
          {bridge.message ??
            bridge.reason ??
            bridge.status ??
            "Runtime check complete. Inspect the connection state before use."}
          {bridge.available &&
            bridge.servers?.map((server: Json) => (
              <div className="row" key={server.name}>
                <span>
                  {server.name} · {server.toolCount} tools ·{" "}
                  {server.authStatus ?? "Authorization not confirmed"}
                </span>
                <ActionButton
                  action={async () => {
                    await run(async () => {
                      const content = JSON.stringify({
                        server,
                        version: bridge.version,
                      });
                      const digest = await crypto.subtle.digest(
                        "SHA-256",
                        new TextEncoder().encode(content),
                      );
                      await api("/connections/import", {
                        manifest: {
                          id: `codex-${server.name}`,
                          name: server.name,
                          route: "codex",
                          codexServer: server.name,
                          source: "Official local Codex app-server discovery",
                          sourceVersion: bridge.version,
                          sourceHash: Array.from(new Uint8Array(digest))
                            .map((byte) => byte.toString(16).padStart(2, "0"))
                            .join(""),
                          expectedAccountId: bridge.account?.id,
                          instructionsApproved: false,
                          tools: {},
                        },
                      });
                    });
                  }}
                >
                  Add connection
                </ActionButton>
              </div>
            ))}
          <details>
            <summary>Runtime evidence</summary>
            <pre>{pretty(bridge)}</pre>
          </details>
        </Notice>
      )}
      <p className="muted">
        ChatGPT account connections are reused only through a compatible
        official runtime. API billing and app authorization are separate. A
        directory link alone does not install a connection.
      </p>
      {connections.length === 0 && (
        <Empty title="No connections yet">
          Add a connection definition, sign in, discover its tools, then select
          the tools and resources that the agent may use.
        </Empty>
      )}
      {connections.map((c) => (
        <section className="connection-card" key={c.id}>
          <div className="section-heading">
            <div>
              <h2>{c.name}</h2>
              <span className="badge">{c.status ?? "Needs verification"}</span>
            </div>
            <button
              aria-label={`Delete ${c.name}`}
              onClick={() => {
                if (
                  confirm(
                    `Remove ${c.name} from this workspace? Remote resources and provider grants remain separate.`,
                  )
                )
                  void run(() =>
                    api(`/connections/${c.id}`, undefined, "DELETE"),
                  );
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <dl>
            <dt>Route</dt>
            <dd>{c.route}</dd>
            <dt>Account</dt>
            <dd>{c.accountLabel ?? c.accountId ?? "Not verified"}</dd>
            <dt>Source</dt>
            <dd>
              {c.source ?? c.endpoint ?? "Not provided"} ·{" "}
              {c.sourceVersion ?? "Version not available"}
            </dd>
            <dt>Tools</dt>
            <dd>
              {(c.discoveredTools ?? []).length} discovered ·{" "}
              {Object.keys(c.tools ?? {}).length} selected
            </dd>
            <dt>Last check</dt>
            <dd>{c.lastCheckAt ?? "Not checked"}</dd>
          </dl>
          {c.error && <Notice error>{c.error}</Notice>}
          <div className="row wrap">
            <button
              onClick={() =>
                void run(async () => {
                  const result = await api(`/connections/${c.id}/auth`, {});
                  const url = result.authorizationUrl ?? result.url;
                  if (url) {
                    setAuthorizationUrl(url);
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                })
              }
            >
              Sign in / reconnect
            </button>
            <button
              onClick={() =>
                void run(() => api(`/connections/${c.id}/discover`, {}))
              }
            >
              <RefreshCw size={16} />
              Discover tools
            </button>
            <button
              onClick={() => {
                setSelected(c);
                setPolicy(c.tools ?? {});
                setBindings(c.resourceBindings ?? {});
                setInstructionsApproved(c.instructionsApproved === true);
              }}
            >
              <ShieldCheck size={16} />
              Tools and permissions
            </button>
          </div>
        </section>
      ))}
      {adding && (
        <Modal
          title="Add plugin or MCP definition"
          onClose={() => setAdding(false)}
        >
          <p>
            Import declarative metadata and remote MCP definitions. Sona does
            not execute installation scripts, hooks, or widgets.
          </p>
          <label className="field">
            Import JSON file
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (f) setManifest(JSON.parse(await f.text()));
                } catch {
                  setError("The file must contain valid JSON.");
                }
              }}
            />
          </label>
          <JsonEditor
            value={manifest}
            onChange={setManifest}
            label="Connection definition"
          />
          <ActionButton
            action={async () => {
              await api("/connections/import", { manifest });
              await onRefresh();
              setAdding(false);
            }}
          >
            Import definition
          </ActionButton>
        </Modal>
      )}
      {selected && (
        <Modal
          title={`${selected.name} — tools and permissions`}
          onClose={() => setSelected(null)}
        >
          <p>
            Only selected tools can run. A write needs the exact resource
            binding and spoken approval. A schema change needs a new review.
          </p>
          {(selected.discoveredTools ?? []).map((t: Json) => (
            <div className="tool-select" key={t.name}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!policy[t.name]}
                  onChange={(e) => {
                    const next = { ...policy };
                    if (e.target.checked)
                      next[t.name] = {
                        effect: t.effect ?? "write",
                        schemaHash: t.schemaHash,
                      };
                    else delete next[t.name];
                    setPolicy(next);
                  }}
                />
                {t.name}
              </label>
              <small>{t.description}</small>
              <details>
                <summary>Tool schema</summary>
                <pre>{pretty(t.inputSchema)}</pre>
              </details>
            </div>
          ))}
          <JsonEditor
            value={policy}
            onChange={setPolicy}
            label="Allowlist and resource restrictions"
          />
          <JsonEditor
            value={bindings}
            onChange={setBindings}
            label="Local resource bindings"
            rows={5}
          />
          <p className="muted">
            Map logical agent resources to permitted service identifiers. Set
            resourcePointer to a field in the discovered schema. These private
            bindings stay outside agent exports.
          </p>
          {selected.instructions && (
            <details>
              <summary>Plugin instructions</summary>
              <pre>{selected.instructions}</pre>
              <label className="check">
                <input
                  type="checkbox"
                  checked={instructionsApproved}
                  onChange={(e) => setInstructionsApproved(e.target.checked)}
                />
                I reviewed these instructions for use by the agent.
              </label>
            </details>
          )}
          <p className="muted">
            For Calendar tests, set the dedicated calendar ID. Do not use
            primary calendars, attendees, or invitations. The server checks
            actual tool schemas before dispatch.
          </p>
          <ActionButton
            action={async () => {
              await api(
                `/connections/${selected.id}`,
                {
                  tools: policy,
                  resourceBindings: bindings,
                  instructionsApproved,
                },
                "PATCH",
              );
              await onRefresh();
              setSelected(null);
            }}
          >
            Apply reviewed policy
          </ActionButton>
        </Modal>
      )}
    </div>
  );
}
