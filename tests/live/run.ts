import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type Check = {
  id: string;
  requirements: string[];
  status: "passed" | "failed" | "blocked";
  scope: string;
  prerequisite?: string;
  detail: string;
};
const checks: Check[] = [];
const optedIn = process.env.SONA_LIVE === "1";
const base = process.env.SONA_LIVE_URL ?? "http://127.0.0.1:4317";
const url = new URL(base);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.protocol !== "http:"
)
  throw new Error("Live verification must use a local Sona server.");
const out = path.resolve(
  process.env.SONA_LIVE_REPORT ?? "docs/verification/live-results.json",
);
const budget = Number(process.env.SONA_LIVE_BUDGET_USD ?? 10);
if (!Number.isFinite(budget) || budget < 0 || budget > 10)
  throw new Error(
    "This unattended harness accepts a budget from USD 0 through USD 10.",
  );
const metadata = {
  format: "sona-live-verification/v1",
  timestamp: new Date().toISOString(),
  environment: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.version,
  appVersion: JSON.parse(await readFile("package.json", "utf8")).version,
  scope:
    "Prerequisite checks and opt-in local runtime checks. Physical voice, OAuth grants, external writes, and teammate observations need their own evidence.",
  credentials: Object.fromEntries(
    [
      "OPENAI_API_KEY",
      "OPENAI_ADMIN_KEY",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_CALENDAR_ID",
    ].map((name) => [name, Boolean(process.env[name])]),
  ),
  credentialStatusScope:
    "The credentials fields describe this command's environment only. Server key presence is recorded separately and does not verify provider access.",
  serverCredential: {
    openaiConfigured: null as boolean | null,
    source: null as "session" | "environment" | "none" | null,
  },
  admissionBudgetUSD: budget,
  estimatedChargesUSD: 0,
  observedChargesUSD: null,
  costNotice:
    "No billable call starts from this harness. A local admission budget is not a provider invoice cap.",
};
let headers: Record<string, string> | undefined;
if (optedIn) {
  try {
    const response = await fetch(`${base}/api/bootstrap`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Bootstrap returned HTTP ${response.status}.`);
    const data = (await response.json()) as {
      csrfToken?: string;
      token?: string;
      credentials?: {
        openai?: {
          configured?: boolean;
          source?: "session" | "environment" | "none";
        };
      };
    };
    const token = data.csrfToken ?? data.token;
    if (!token)
      throw new Error("Bootstrap did not return a local session token.");
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    if (!cookie)
      throw new Error("Bootstrap did not return a local session cookie.");
    metadata.serverCredential = {
      openaiConfigured: data.credentials?.openai?.configured ?? null,
      source: data.credentials?.openai?.source ?? null,
    };
    headers = { "X-Sona-Token": token, Cookie: cookie };
    checks.push({
      id: "local-runtime",
      requirements: ["DX-01"],
      status: "passed",
      scope: "Local server bootstrap only",
      detail:
        "Sona returned its own local session. This does not prove a service connection or teammate setup.",
    });
    const health = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    checks.push({
      id: "local-health",
      requirements: ["DX-01"],
      status: health.ok ? "passed" : "failed",
      scope: "Local server health only",
      detail: `HTTP ${health.status}`,
    });
  } catch {
    checks.push({
      id: "local-runtime",
      requirements: ["DX-01"],
      status: "blocked",
      scope: "Local runtime",
      prerequisite: "Start the built local Sona server at SONA_LIVE_URL.",
      detail:
        "The local runtime did not complete its bootstrap. No provider request started.",
    });
  }
} else
  checks.push({
    id: "local-runtime",
    requirements: ["DX-01"],
    status: "blocked",
    scope: "Opt-in runtime check",
    prerequisite: "Start Sona, then set SONA_LIVE=1 in the local shell.",
    detail: "The default command does not open a service connection.",
  });

if (headers && process.env.SONA_LIVE_CONNECTION_ID) {
  const id = process.env.SONA_LIVE_CONNECTION_ID;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    throw new Error("SONA_LIVE_CONNECTION_ID has an invalid format.");
  // Discovery is deliberately read-only. A tool invocation or write is not implied.
  try {
    const response = await fetch(
      `${base}/api/connections/${encodeURIComponent(id)}/discover`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      },
    );
    const record = (await response.json()) as {
      status?: string;
      discoveredTools?: unknown[];
    };
    const ready = response.ok && record.status === "ready";
    checks.push({
      id: "connection-discovery",
      requirements: ["CN-01", "CN-02"],
      status: ready ? "passed" : "blocked",
      scope: "Sona connection discovery only",
      detail: `HTTP ${response.status}; connection ${record.status ?? "unknown"}; discovery is not a Calendar read/write or ChatGPT-reuse result.`,
      ...(!ready
        ? {
            prerequisite:
              "Authorize this Sona connection through its supported route, then repeat discovery.",
          }
        : {}),
    });
  } catch {
    checks.push({
      id: "connection-discovery",
      requirements: ["CN-01", "CN-02"],
      status: "blocked",
      scope: "Sona connection discovery only",
      prerequisite: "An authorized and reachable connection in Sona.",
      detail: "Discovery could not finish. No tool invocation started.",
    });
  }
}
const blocked: [string, string[], string, string][] = [
  [
    "voice-en-kr",
    ["VS-01", "VS-02", "CF-02"],
    "An authorized OpenAI project, a supported selected model, dated prices, and actual laptop microphone/speaker access.",
    "Complete the English and Korean voice protocol in docs/verification/live-checks.md.",
  ],
  [
    "calendar-read-write",
    ["CN-01", "TL-01", "TL-02"],
    "A Sona-authorized Google account and an explicitly designated test calendar with no attendees or invitations.",
    "Complete the read, spoken approval, rejection, duplicate, and unknown-outcome protocol.",
  ],
  [
    "chatgpt-reuse",
    ["CN-00"],
    "A compatible released Codex app-server, its supported ChatGPT login, and an existing Calendar grant in the selected account.",
    "Prove a same-account read and approved write without a new Google grant. Discovery alone is insufficient.",
  ],
  [
    "independent-runtime",
    ["PT-01"],
    "An exported sona-agent.json and a different authorized local binding.",
    "Operate the example runtime without the Sona study database.",
  ],
  [
    "physical-laptops",
    ["VS-01", "VS-02", "UX-03", "UX-05"],
    "Actual Windows and macOS laptops with current Chrome and physical microphones and speakers.",
    "Do microphone, output, interruption, device-loss, output-selection, and recovery checks. Headless Chromium is insufficient.",
  ],
  [
    "researcher-usability",
    ["UX-01", "UX-03", "UX-04"],
    "A representative researcher and supervised participant.",
    "Record activations, time, mistakes, backtracking, and assistance for the PRD tasks.",
  ],
  [
    "teammate-setup",
    ["DX-01", "PT-01"],
    "An independent teammate with a laptop and their own authorized credentials.",
    "Install the release, run the study procedure, and operate the portable agent. An automated clean install is insufficient.",
  ],
];
for (const [id, requirements, prerequisite, detail] of blocked)
  checks.push({
    id,
    requirements,
    status: "blocked",
    scope: "Mandatory real-service/device/person gate",
    prerequisite,
    detail,
  });
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ ...metadata, checks }, null, 2) + "\n");
console.log(
  `Live verification: ${checks.filter((c) => c.status === "passed").length} passed, ${checks.filter((c) => c.status === "failed").length} failed, ${checks.filter((c) => c.status === "blocked").length} blocked.`,
);
console.log(`Report: ${path.relative(process.cwd(), out)}`);
console.log(
  "Blocked checks are not passes. No paid model request or external write ran.",
);
process.exitCode = checks.some((c) => c.status === "failed")
  ? 1
  : checks.some((c) => c.status === "blocked")
    ? 2
    : 0;
