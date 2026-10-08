import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { request as httpRequest } from "node:http";

// Local release verification. No model request, OAuth grant, or tool invocation occurs.
const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const archive = path.resolve(
  argument("--archive") ?? `release/sona-${pkg.version}-local.tar.gz`,
);
const output = path.resolve(
  argument("--report") ?? "release/installation-report.json",
);
const temporary = await mkdtemp(path.join(os.tmpdir(), "sona-release-check-"));
const checks: { id: string; status: "passed" | "failed"; detail: string }[] =
  [];
const processes = new Set<ChildProcess>();
const canary = `sona-private-fixture-${randomBytes(20).toString("hex")}`;
const logs: string[] = [];
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const environment = {
  ...process.env,
  OPENAI_API_KEY: "",
  OPENAI_ADMIN_KEY: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  GOOGLE_CALENDAR_ID: "",
  OPENAI_WEBHOOK_SECRET: "",
  NODE_ENV: "test",
};
let archiveSha = "",
  manifest: any;
async function check(id: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    checks.push({ id, status: "passed", detail });
    console.log(`${id}: passed`);
  } catch (error) {
    checks.push({
      id,
      status: "failed",
      detail: error instanceof Error ? error.message : "The check failed.",
    });
    throw error;
  }
}
function launch(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = environment,
) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.add(child);
  child.stdout?.on("data", (data) => logs.push(String(data)));
  child.stderr?.on("data", (data) => logs.push(String(data)));
  child.on("exit", () => processes.delete(child));
  return child;
}
async function complete(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Local command exited with code ${code}.`)),
    );
  });
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const limit = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5000);
    child.once("exit", () => {
      clearTimeout(limit);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
async function ready(base: string, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("The local server exited before readiness.");
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("The local server did not become ready.");
}
async function client(base: string) {
  const response = await fetch(`${base}/api/bootstrap`);
  if (!response.ok) throw new Error("Bootstrap failed.");
  const data = (await response.json()) as any;
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie || !data.csrfToken)
    throw new Error("Local session protection is missing.");
  const request = async (
    route: string,
    body?: any,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const r = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        Cookie: cookie,
        "X-Sona-Token": data.csrfToken,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok)
      throw new Error(`Local ${method} ${route} failed with HTTP ${r.status}.`);
    return r;
  };
  return { data, request };
}
try {
  const bytes = await readFile(archive);
  archiveSha = sha(bytes);
  await check("archive-integrity", async () => {
    const expected = (await readFile(`${archive}.sha256`, "utf8"))
      .trim()
      .split(/\s+/)[0];
    if (expected !== archiveSha) throw new Error("Archive checksum differs.");
    const tar = gunzipSync(bytes);
    let offset = 0;
    const extracted = new Map<string, Buffer>();
    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every((byte) => byte === 0)) break;
      const string = (start: number, length: number) =>
        header
          .subarray(start, start + length)
          .toString("utf8")
          .split("\0")[0];
      const prefix = string(345, 155),
        name = [prefix, string(0, 100)].filter(Boolean).join("/"),
        size = parseInt(string(124, 12).trim(), 8),
        type = string(156, 1);
      if (
        !Number.isSafeInteger(size) ||
        size < 0 ||
        !["0", ""].includes(type) ||
        path.isAbsolute(name) ||
        name.split("/").some((part) => part === ".." || part.includes("\\"))
      )
        throw new Error("Unsafe archive entry.");
      const content = tar.subarray(offset + 512, offset + 512 + size);
      if (content.length !== size) throw new Error("Truncated archive entry.");
      const relative = name.split("/").slice(1).join("/");
      if (!relative || extracted.has(relative))
        throw new Error("Invalid or duplicate archive path.");
      extracted.set(relative, content);
      const target = path.join(temporary, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    manifest = JSON.parse(
      extracted.get("RELEASE-MANIFEST.json")!.toString("utf8"),
    );
    for (const file of manifest.files) {
      const data = extracted.get(file.path);
      if (!data || data.length !== file.bytes || sha(data) !== file.sha256)
        throw new Error(`File identity differs: ${file.path}`);
    }
    if (extracted.size !== manifest.files.length + 1)
      throw new Error("Archive contains unlisted files.");
    const forbidden = [...extracted.keys()].filter(
      (name) =>
        /(^|\/)(\.env(?:\.|$)|node_modules|release|archive)(\/|$)|\.(sqlite|sqlite3|db)(-wal|-shm)?$|ASD-STE100_ISSUE9/.test(
          name,
        ) && name !== ".env.example",
    );
    if (forbidden.length)
      throw new Error("Private or excluded release files occurred.");
    return `${manifest.files.length} file identities agree; no private database, environment file, dependency directory, or STE standard occurs.`;
  });
  const root = path.join(temporary, `sona-${pkg.version}`);
  await check("clean-locked-install", async () => {
    await complete(
      launch(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        [
          "install",
          "--frozen-lockfile",
          ...(process.env.SONA_PNPM_STORE
            ? ["--store-dir", process.env.SONA_PNPM_STORE]
            : []),
        ],
        root,
      ),
    );
    return "Frozen-lockfile installation succeeded in the extracted archive.";
  });
  const dataDir = path.join(temporary, "private-data"),
    port = argument("--port") ?? "4340",
    base = `http://127.0.0.1:${port}`;
  const start = () =>
    launch(process.execPath, ["dist/server.mjs"], root, {
      ...environment,
      SONA_DATA_DIR: dataDir,
      SONA_PORT: port,
      OPENAI_API_KEY: canary,
    });
  let server = start();
  await ready(base, server);
  let local = await client(base);
  let agent: any, study: any, session: any;
  await check("built-server-security", async () => {
    const noToken = await fetch(`${base}/api/agents`),
      origin = await fetch(`${base}/api/bootstrap`, {
        headers: { Origin: "https://unrelated.invalid" },
      }),
      host = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          `${base}/api/health`,
          { headers: { Host: "unrelated.invalid" } },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode ?? 0));
          },
        );
        request.on("error", reject);
        request.setTimeout(10_000, () =>
          request.destroy(new Error("Host check timed out.")),
        );
        request.end();
      });
    if (noToken.status !== 401 || origin.status !== 403 || host !== 403)
      throw new Error(
        `Local access protection failed: token ${noToken.status}, origin ${origin.status}, host ${host}.`,
      );
    const page = await fetch(base);
    if (!page.ok || !page.headers.get("content-security-policy"))
      throw new Error("Built browser delivery or security headers failed.");
    return "Built page, bootstrap, host/origin restrictions, and local token checks passed.";
  });
  await check("configuration-study-export", async () => {
    agent = await (
      await local.request("/agents", { name: "Release verification fixture" })
    ).json();
    const revision = (await (
      await local.request(`/agents/${agent.id}/revisions`, {
        name: "Fixed fixture",
      })
    ).json()) as any;
    study = await (
      await local.request("/studies", {
        name: "Release verification fixture",
        question: "Local persistence check",
        task: "No live voice or external action",
        conditions: [
          {
            id: "a",
            name: "A",
            revisionId: revision.id,
            view: "researcher",
            controls: {},
          },
        ],
        order: ["a"],
      })
    ).json();
    await local.request(`/studies/${study.id}/consent`, {
      participantCode: "FIXTURE",
      accepted: true,
      policyVersion: study.consentPolicy.version,
    });
    let blocked = false;
    try {
      await local.request("/sessions", {
        kind: "study",
        agentId: agent.id,
        studyId: study.id,
        conditionId: "a",
        participantCode: "FIXTURE",
        researcherParticipant: true,
      });
    } catch (error) {
      blocked = error instanceof Error && error.message.includes("HTTP 400");
    }
    if (!blocked)
      throw new Error(
        "A measured session started without provider model verification.",
      );
    session = await (
      await local.request("/sessions", {
        kind: "quick",
        agentId: agent.id,
        researcherParticipant: true,
        processingAccepted: true,
      })
    ).json();
    const changed = structuredClone(agent.draft);
    changed.instructions = "Next-test fixture only";
    await local.request(`/agents/${agent.id}`, { draft: changed }, "PATCH");
    const record = (await (
      await local.request(`/sessions/${session.id}`)
    ).json()) as any;
    if (record.snapshot.configuration.instructions === changed.instructions)
      throw new Error("The measured snapshot changed.");
    const json = await (
      await local.request(
        `/studies/${study.id}/export?format=json&includeDeviations=true`,
      )
    ).text();
    const csv = Buffer.from(
      await (
        await local.request(
          `/studies/${study.id}/export?format=csv&includeDeviations=true`,
        )
      ).arrayBuffer(),
    );
    if (
      !json.includes(study.id) ||
      json.includes(session.id) ||
      !gunzipSync(csv).includes(Buffer.from("sessions.csv"))
    )
      throw new Error("Study export is incomplete.");
    const portable = await (
      await local.request(`/agents/${agent.id}/export`)
    ).text();
    await writeFile(path.join(temporary, "sona-agent.json"), portable);
    for (const value of [
      JSON.stringify(local.data),
      JSON.stringify(record),
      json,
      portable,
    ])
      if (value.includes(canary))
        throw new Error("Credential canary reached a client or export.");
    return "Agent revision, synthetic consent record, immutable quick snapshot, blocked unverified measured run, scoped JSON/CSV export, and portable configuration passed without a provider connection.";
  });
  await stop(server);
  server = start();
  await ready(base, server);
  local = await client(base);
  await check("restart-migration-backup-delete", async () => {
    const recovered = (await (
      await local.request(`/sessions/${session.id}`)
    ).json()) as any;
    if (recovered.state !== "interrupted")
      throw new Error(
        "Crash recovery did not preserve an interrupted session.",
      );
    const draft = (await (
      await local.request(`/agents/${agent.id}`)
    ).json()) as any;
    if (draft.draft.instructions !== "Next-test fixture only")
      throw new Error("The draft did not survive restart.");
    await local.request(`/studies/${study.id}`, undefined, "DELETE");
    await local.request(`/sessions/${session.id}`, undefined, "DELETE");
    const remaining = (await (
      await local.request("/sessions")
    ).json()) as any[];
    if (remaining.some((s) => s.id === session.id))
      throw new Error("Study deletion left its session.");
    const db = new DatabaseSync(path.join(dataDir, "sona.sqlite"));
    try {
      db.exec(
        `VACUUM INTO '${path.join(temporary, "backup.sqlite").replaceAll("'", "''")}'`,
      );
    } finally {
      db.close();
    }
    const backup = new DatabaseSync(path.join(temporary, "backup.sqlite"), {
      readOnly: true,
    });
    try {
      const integrity = backup.prepare("PRAGMA integrity_check").get() as any;
      if (integrity.integrity_check !== "ok")
        throw new Error("Backup integrity failed.");
    } finally {
      backup.close();
    }
    return "Restart, supported migration, interrupted recovery, draft persistence, consistent SQLite backup, and study deletion passed.";
  });
  await stop(server);
  await check("portable-runtime-isolation", async () => {
    const runtimePort = String(Number(port) + 1),
      runtimeBase = `http://127.0.0.1:${runtimePort}`,
      runtimeData = path.join(temporary, "runtime-actions");
    const runtime = launch(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "examples/agent/src/index.ts",
        "--config",
        path.join(temporary, "sona-agent.json"),
        "--port",
        runtimePort,
      ],
      root,
      { ...environment, SONA_AGENT_DATA_DIR: runtimeData },
    );
    await ready(runtimeBase, runtime);
    const app = await client(runtimeBase);
    if (app.data.configured !== false)
      throw new Error("The runtime received a credential binding.");
    const denied = await fetch(`${runtimeBase}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"processingAccepted":true}',
    });
    if (denied.ok)
      throw new Error("Runtime capture started without credentials.");
    await stop(runtime);
    const db = new DatabaseSync(path.join(runtimeData, "actions.sqlite"), {
      readOnly: true,
    });
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((row) => row.name);
      if (tables.length !== 1 || tables[0] !== "actions")
        throw new Error("The portable runtime opened study tables.");
    } finally {
      db.close();
    }
    return "Exported configuration loads with an independent action-only journal; no study database or inherited service credential is used. Real voice and independent account operation remain blocked.";
  });
  await check("credential-canary", async () => {
    for (const file of manifest.files.filter((f: any) =>
      f.path.startsWith("dist/"),
    )) {
      const data = await readFile(path.join(root, file.path));
      if (data.includes(Buffer.from(canary)))
        throw new Error("The credential canary occurred in a built asset.");
    }
    if (logs.join("").includes(canary))
      throw new Error("The credential canary occurred in logs.");
    return "Configured synthetic canary is absent from built assets, local responses, exports, and captured logs.";
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Release verification failed.",
  );
  process.exitCode = 1;
} finally {
  for (const child of [...processes]) await stop(child);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        format: "sona-release-install/v1",
        timestamp: new Date().toISOString(),
        applicationVersion: pkg.version,
        archive: path.basename(archive),
        archiveSha256: archiveSha,
        environment: `${os.platform()} ${os.release()} ${os.arch()}`,
        node: process.version,
        accountClass: "Synthetic local records; no service grant",
        serviceRequests: 0,
        externalWrites: 0,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  await rm(temporary, { recursive: true, force: true });
  console.log(`Report: ${path.relative(process.cwd(), output)}`);
}
