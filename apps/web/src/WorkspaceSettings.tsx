import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, AudioLines, KeyRound } from "lucide-react";
import { api, ApiError } from "./api";

type CredentialStatus = {
  configured: boolean;
  source: "session" | "environment" | "none";
  storage: "memory";
  verification?: {
    state: "unchecked" | "checking" | "verified" | "rejected" | "unavailable";
    checkedAt: string | null;
    reason:
      | "authentication"
      | "permission"
      | "rate_limit"
      | "timeout"
      | "network"
      | "service"
      | "response"
      | null;
  };
};

export function WorkspaceSettings({
  version,
  active,
  onRefresh,
  onCredentialChange,
  onDevices,
  onLibrary,
}: {
  version: string;
  active: boolean;
  onRefresh: () => Promise<void>;
  onCredentialChange: (configured: boolean) => void;
  onDevices: () => void;
  onLibrary: () => void;
}) {
  const [credential, setCredential] = useState<CredentialStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshHint, setRefreshHint] = useState("");
  const keyInput = useRef<HTMLInputElement>(null);
  const checkingRef = useRef(false);
  const verification = credential?.verification;
  const isChecking = checking || verification?.state === "checking";
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
  useEffect(() => {
    if (verification?.state !== "checking") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api("/settings/credentials")
        .then((result) => {
          if (!cancelled) setCredential(result.openai);
        })
        .catch(() => {
          if (!cancelled) {
            setCredential((previous) =>
              previous
                ? {
                    ...previous,
                    verification: {
                      state: "unavailable",
                      checkedAt: null,
                      reason: null,
                    },
                  }
                : previous,
            );
            setCheckError("Could not complete the API key check. Try again.");
          }
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [verification]);
  const verifyKey = async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setCheckError("");
    try {
      const result = await api(
        "/settings/credentials/openai/verify",
        undefined,
        "POST",
      );
      setCredential(result.openai);
    } catch {
      // A local transport failure does not establish that OpenAI rejected the key.
      setCredential((previous) =>
        previous
          ? {
              ...previous,
              verification: {
                state: "unavailable",
                checkedAt: null,
                reason: null,
              },
            }
          : previous,
      );
      setCheckError("Could not complete the API key check. Try again.");
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };
  const changeKey = async (remove = false) => {
    if (busy || isChecking || active || !credential || (!remove && !key.trim()))
      return;
    const apiKey = key.trim();
    setKey("");
    setBusy(true);
    setError("");
    setMessage("");
    setRefreshHint("");
    setCheckError("");
    try {
      const result = await api(
        "/settings/credentials/openai",
        remove ? undefined : { apiKey },
        remove ? "DELETE" : "PUT",
      );
      setCredential(result.openai);
      onCredentialChange(result.openai.configured);
      setMessage(
        remove ? "API key removed." : "API key saved for this Sona run.",
      );
      if (!remove) await verifyKey();
      try {
        await onRefresh();
      } catch {
        setRefreshHint("Reload Sona to refresh workspace access.");
      }
    } catch (failure) {
      // Provider and server error strings can contain sensitive request values.
      setError(
        failure instanceof ApiError &&
          failure.status === 409 &&
          failure.code === "CREDENTIAL_IN_USE"
          ? "End the active test or API operation before changing your API key."
          : failure instanceof ApiError &&
              failure.status === 400 &&
              failure.code === "INVALID_PROJECT_API_KEY"
            ? "Enter an OpenAI project API key. Admin keys are not supported."
            : remove
              ? "Could not remove the API key. Try again."
              : "Could not save the API key. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const verificationMessage =
    verification?.state === "verified"
      ? "OpenAI accepted this key for the model list. Voice access and billing are checked separately."
      : verification?.state === "rejected"
        ? "OpenAI rejected this key. Replace it with an active project API key."
        : verification?.state === "unavailable"
          ? verification.reason === "permission"
            ? "This key cannot read the model list. Check its permissions; it may still have access to other APIs."
            : verification.reason === "rate_limit"
              ? "OpenAI limited the check. Try again later."
              : verification.reason === "timeout"
                ? "OpenAI did not respond in time. Try again."
                : verification.reason === "network"
                  ? "Could not reach OpenAI. Check your connection and try again."
                  : verification.reason === "service" ||
                      verification.reason === "response"
                    ? "OpenAI could not complete the check. Try again later."
                    : "The check did not complete. Try again."
          : "This key is saved. Check it to confirm OpenAI access.";
  return (
    <div className="page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Local workspace</p>
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
        <div className="credential-status" role="status" aria-live="polite">
          <span
            className={`status-dot ${credential?.configured && verification?.state === "verified" && !isChecking ? "connected" : verification?.state === "rejected" && !isChecking ? "rejected" : "unconfigured"}`}
          />
          {credential === null
            ? "Loading key settings…"
            : credential.configured
              ? isChecking
                ? "Checking API key…"
                : verification?.state === "verified"
                  ? "API key verified"
                  : verification?.state === "rejected"
                    ? "API key rejected"
                    : verification?.state === "unavailable"
                      ? "API key added · Could not verify"
                      : "API key added · Not checked"
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
              disabled={busy || isChecking || active || credential === null}
              onChange={(event) => {
                setKey(event.target.value);
                setError("");
                setMessage("");
                setRefreshHint("");
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
              disabled={
                busy ||
                isChecking ||
                active ||
                credential === null ||
                !key.trim()
              }
            >
              {busy ? "Updating…" : "Save key"}
            </button>
            {credential?.configured && (
              <button
                type="button"
                className="text-button"
                disabled={busy || isChecking || active}
                onClick={() => void changeKey(true)}
              >
                Remove key
              </button>
            )}
            {credential?.configured && (
              <button
                type="button"
                className="text-button"
                disabled={busy || isChecking}
                onClick={() => void verifyKey()}
              >
                {isChecking ? "Checking…" : "Check key"}
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
        {credential?.configured && !isChecking && (
          <p
            className={
              verification?.state === "rejected"
                ? "error-text"
                : "settings-feedback"
            }
            role={verification?.state === "rejected" ? "alert" : "status"}
          >
            {verificationMessage}
          </p>
        )}
        {checkError && (
          <p className="error-text" role="alert">
            {checkError}
          </p>
        )}
        {message && (
          <p className="settings-feedback" role="status">
            {message}
          </p>
        )}
        {refreshHint && (
          <p className="settings-footnote" role="status">
            {refreshHint}
          </p>
        )}
        <p className="settings-footnote">
          API use is billed separately from ChatGPT. The key check reads the
          model list and does not generate a model response.
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
