import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, AudioLines, KeyRound } from "lucide-react";
import { api } from "./api";

type CredentialStatus = {
  configured: boolean;
  source: "session" | "environment" | "none";
  storage: "memory";
};

export function WorkspaceSettings({
  version,
  active,
  onRefresh,
  onDevices,
  onLibrary,
}: {
  version: string;
  active: boolean;
  onRefresh: () => Promise<void>;
  onDevices: () => void;
  onLibrary: () => void;
}) {
  const [credential, setCredential] = useState<CredentialStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const keyInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (credential && !credential.configured) keyInput.current?.focus();
  }, [credential?.configured]);
  useEffect(() => {
    let mounted = true;
    void api("/settings/credentials")
      .then((result) => {
        if (mounted) setCredential(result.openai);
      })
      .catch(() => {
        if (mounted)
          setError(
            "Could not load API key settings. Open Settings again to retry.",
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  const changeKey = async (remove = false) => {
    if (busy || active || !credential || (!remove && !key.trim())) return;
    const apiKey = key.trim();
    setKey("");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api(
        "/settings/credentials/openai",
        remove ? undefined : { apiKey },
        remove ? "DELETE" : "PUT",
      );
      setCredential(result.openai);
      setMessage(
        remove ? "API key removed." : "API key saved for this Sona run.",
      );
      await onRefresh();
    } catch {
      // Provider and server error strings can contain sensitive request values.
      setError(
        remove
          ? "Could not remove the API key. Try again."
          : "Could not save the API key. Check the key and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Make Sona yours.</p>
        </div>
        <span className="settings-version">Sona {version}</span>
      </header>
      <section
        className="settings-section"
        aria-labelledby="openai-access-heading"
      >
        <div className="settings-section-title">
          <span className="settings-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 id="openai-access-heading">OpenAI access</h2>
            <p className="muted">
              One key for your voice tests and API requests.
            </p>
          </div>
        </div>
        <div className="credential-status" role="status">
          <span
            className={`status-dot ${credential?.configured ? "connected" : "unconfigured"}`}
          />
          {credential === null
            ? "Loading key settings…"
            : credential.configured
              ? "API key added"
              : "No API key added"}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void changeKey();
          }}
          autoComplete="off"
        >
          <label className="field" htmlFor="openai-api-key">
            OpenAI API key
            <input
              ref={keyInput}
              id="openai-api-key"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              autoCapitalize="none"
              placeholder={
                credential?.configured
                  ? "Enter a replacement key"
                  : "Enter your API key"
              }
              value={key}
              disabled={busy || active || credential === null}
              onChange={(event) => {
                setKey(event.target.value);
                setError("");
                setMessage("");
              }}
              aria-describedby="key-storage-description"
            />
          </label>
          <p id="key-storage-description" className="muted small">
            Kept on this local server until Sona restarts. Never included in
            configurations or exports.
          </p>
          <div className="row wrap">
            <button
              className="primary"
              type="submit"
              disabled={busy || active || credential === null || !key.trim()}
            >
              {busy ? "Updating…" : "Save key"}
            </button>
            {credential?.configured && (
              <button
                type="button"
                className="text-button"
                disabled={busy || active}
                onClick={() => void changeKey(true)}
              >
                Remove key
              </button>
            )}
            <a
              className="settings-link"
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
            >
              Get an API key <ArrowUpRight size={15} />
            </a>
          </div>
        </form>
        {active && (
          <p className="muted small">
            End the voice session before changing your API key.
          </p>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="settings-feedback" role="status">
            {message}
          </p>
        )}
        <p className="settings-footnote">
          API use is billed separately from ChatGPT. Saving a key does not
          verify model access.
        </p>
      </section>
      <section
        className="settings-section"
        aria-labelledby="settings-devices-heading"
      >
        <div className="settings-section-title">
          <span className="settings-icon">
            <AudioLines size={20} />
          </span>
          <div>
            <h2 id="settings-devices-heading">Audio devices</h2>
            <p className="muted">Choose how you listen and speak.</p>
          </div>
        </div>
        <button onClick={onDevices}>Select microphone and output</button>
      </section>
      <div className="settings-bottom">
        <span className="muted small">Explore every supported OpenAI API.</span>
        <button className="text-button" onClick={onLibrary}>
          Open API library <ArrowUpRight size={15} />
        </button>
      </div>
    </div>
  );
}
