import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "./storage/index.js";
import { createApp } from "./app.js";
import { defaultAgentConfig } from "../../../packages/agent-core/src/index.js";
const pending: { app: any; dir: string }[] = [];
afterEach(async () => {
  for (const p of pending.splice(0)) {
    await p.app.close();
    rmSync(p.dir, { recursive: true, force: true });
  }
});
async function setup(key = "") {
  const dir = mkdtempSync(join(tmpdir(), "sona-http-"));
  if (key) {
    const initial = createStore(dir);
    initial.metadata.set("verifiedModels", ["gpt-realtime-2.1"]);
    initial.close();
  }
  const result = await createApp({
    dataDir: dir,
    port: 4317,
    env: { OPENAI_API_KEY: key },
  });
  pending.push({ app: result.app, dir });
  const boot = await result.app.inject({
    url: "/api/bootstrap",
    headers: { host: "127.0.0.1:4317" },
  });
  const headers = {
    host: "127.0.0.1:4317",
    "x-sona-token": boot.json().csrfToken,
    cookie: boot.headers["set-cookie"]!.toString().split(";")[0],
  };
  return {
    ...result,
    headers,
    request: (method: any, url: string, payload?: any) =>
      result.app.inject({ method, url, headers, payload }),
  };
}
describe("local server integration", { timeout: 20000 }, () => {
  it("uses only the selected local development browser origin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sona-dev-origin-"));
    const { app } = await createApp({
      dataDir: dir,
      port: 4327,
      development: true,
      env: { SONA_WEB_PORT: "5174" },
    });
    pending.push({ app, dir });
    expect(
      (
        await app.inject({
          url: "/api/bootstrap",
          headers: { host: "127.0.0.1:4327", origin: "http://127.0.0.1:5174" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/bootstrap",
          headers: { host: "127.0.0.1:4327", origin: "http://127.0.0.1:5173" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("returns a cancellable separate API observation with honest missing credentials and local-session ownership", async () => {
    const { app, request } = await setup();
    const started = await request("POST", "/api/library/poll", {
      recipe: { operationId: "listModels" },
      maxPolls: 1,
    });
    expect(started.statusCode).toBe(200);
    const run = started.json();
    expect(run.id).toBeTruthy();
    const result = (await request("GET", `/api/library/runs/${run.id}`)).json();
    expect(result.status).toBe("failed");
    expect(result.error).toContain("credential");
    const second = await app.inject({
      url: "/api/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const foreign = await app.inject({
      url: `/api/library/runs/${run.id}`,
      headers: {
        host: "127.0.0.1:4317",
        "x-sona-token": second.json().csrfToken,
        cookie: second.headers["set-cookie"]!.toString().split(";")[0],
      },
    });
    expect(foreign.statusCode).toBe(400);
  });
  it("rejects wrong Host, cross origin, missing local session, forged OAuth callback, and preserves health", async () => {
    const { app, request } = await setup();
    expect(
      (
        await app.inject({
          url: "/api/health",
          headers: { host: "evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/bootstrap",
          headers: { host: "127.0.0.1:4317", origin: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/agents",
          headers: { host: "127.0.0.1:4317" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await request("GET", "/api/oauth/callback?state=forged&code=forged"))
        .statusCode,
    ).toBe(400);
    expect((await request("GET", "/api/health")).statusCode).toBe(200);
  });
  it("creates two agents, saves drafts, freezes revisions, exports portable config, rejects invalid fields", async () => {
    const { request } = await setup();
    const a = (await request("POST", "/api/agents", { name: "First" })).json();
    expect(a.id).toBeTruthy();
    const r = (
      await request("POST", `/api/agents/${a.id}/revisions`, {
        name: "Baseline",
      })
    ).json();
    const draft = { ...a.draft, instructions: "Changed next-test draft" };
    expect(
      (await request("PATCH", `/api/agents/${a.id}`, { draft })).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", `/api/agents/${a.id}/revisions`)).json()[0]
        .configuration.instructions,
    ).toBe(r.configuration.instructions);
    expect(
      (await request("POST", `/api/agents/${a.id}/duplicate`, {})).json().id,
    ).not.toBe(a.id);
    const exported = (
      await request("GET", `/api/agents/${a.id}/export`)
    ).json();
    expect(exported.instructions).toBe(draft.instructions);
    expect(exported.participantCode).toBeUndefined();
    expect(
      (
        await request("POST", "/api/config/validate", {
          config: { ...draft, settings: { temperature: 0.7 } },
        })
      ).json().valid,
    ).toBe(false);
  });
  it("blocks voice without credentials and does not create false sessions", async () => {
    const { request, store } = await setup();
    const a = (await request("POST", "/api/agents", { name: "No key" })).json();
    const result = await request("POST", "/api/sessions", {
      agentId: a.id,
      processingAccepted: true,
    });
    expect(result.statusCode).toBe(400);
    expect(result.json().error).toMatch("OPENAI_API_KEY");
    expect(store.sessions.list()).toHaveLength(0);
  });
  it("applies consent to a researcher participant, freezes study condition, filters exports, persists outcome", async () => {
    const { request, store } = await setup(
      "unit-fixture-key-not-a-real-credential",
    );
    store.metadata.set("verifiedModels", ["gpt-realtime-2.1"]);
    const a = (
      await request("POST", "/api/agents", { name: "Study agent" })
    ).json();
    const rev = (
      await request("POST", `/api/agents/${a.id}/revisions`, {})
    ).json();
    const study = (
      await request("POST", "/api/studies", {
        name: "Consent study",
        conditions: [
          {
            id: "A",
            name: "A",
            revisionId: rev.id,
            view: "participant",
            controls: {},
          },
        ],
      })
    ).json();
    const input = {
      mode: "study",
      agentId: a.id,
      studyId: study.id,
      conditionId: "A",
      participantCode: "P01",
      researcherParticipant: true,
    };
    const blocked = await request("POST", "/api/sessions", input);
    expect(blocked.statusCode).toBe(400);
    const saved = await request("POST", "/api/sessions", {
      ...input,
      consent: { accepted: true, policyVersion: study.consentPolicy.version },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const session = saved.json();
    expect(session.initialView).toBe("participant");
    expect(session.researcherParticipant).toBe(true);
    expect(
      (
        await request("PATCH", `/api/sessions/${session.id}`, {
          view: "researcher",
          outcome: { taskSuccess: "success", notes: '=HYPERLINK("evil")' },
        })
      ).statusCode,
    ).toBe(200);
    await request("POST", `/api/sessions/${session.id}/end`, {});
    const data = (
      await request(
        "GET",
        `/api/studies/${study.id}/export?includeDeviations=true`,
      )
    ).json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].outcome.taskSuccess).toBe("success");
    const bundle = await request(
      "GET",
      `/api/studies/${study.id}/export?format=csv&includeDeviations=true`,
    );
    expect(bundle.headers["content-type"]).toMatch("application/gzip");
    expect(bundle.rawPayload[0]).toBe(31);
  });
  it("imports safe Calendar metadata, keeps missing grants visible, separates catalog from execution", async () => {
    const { request } = await setup();
    const added = await request("POST", "/api/connections/google-calendar", {});
    expect(added.statusCode).toBe(200);
    expect(added.json()[0].status).not.toBe("ready");
    const list = (await request("GET", "/api/library/operations")).json();
    expect(list.length).toBeGreaterThan(300);
    expect(
      (
        await request("POST", "/api/library/execute", {
          operationId: "listModels",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request("POST", "/api/library/streams", {
          intent: true,
          target: { kind: "realtime", model: "gpt-realtime-2.1" },
        })
      ).statusCode,
    ).toBe(400);
  });
});
