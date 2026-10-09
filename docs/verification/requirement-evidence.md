# Requirement evidence

Application version: `1.1.1`. Product authority: PRD 1.0 and [the user's interface update](../implementation/workspace-refinement.md).
Capability revision: `openai-2026-10-06-491c868adbdb`.

An automated fixture is a synthetic service or evidence record used by a test.
It does not prove actual speech, a provider response, a Google grant, or another person's experience.

The file manifest identifies the delivered source. The published `v1.0.0` tag identifies the preserved starting point.
The reviewed feature history and final integration branch identify the current application changes.

| ID | Implementation evidence | Local verification | Remaining external evidence |
|---|---|---|---|
| AG-01 | `apps/web/src/AgentPanel.tsx`; `apps/server/src/app.ts`; agent storage | Two agents, neutral instructions, import, and export pass server tests. | None for definition management. Actual agents need service checks. |
| CF-01 | Agent storage; `packages/agent-core/src/canonical.ts`; Versions UI | Immutable revisions, duplication, history, and differences pass unit and browser tests. | None for local revision behavior. |
| CF-02 | `packages/agent-core/src/config.ts`; `apps/server/src/voice.ts`; Applied UI | Native schema validation, model/transport restrictions, missing echoes, and mismatches pass fixtures. Draft changes preserve the snapshot. | Real provider echo and observed speech. |
| AP-01 | `packages/api-library/src/catalog.ts`; immutable source and provenance | All 354 retrieved operations are represented. Reports derive the denominator. | Lifecycle and other current official page reconciliation where network access was blocked. |
| AP-02 | `SchemaForm.tsx`; `Library.tsx`; API validator | JSON/form handling, nested unions, null versus omission, file inputs, and constraints pass local tests. | Model-specific provider acceptance. |
| AP-03 | API runner, serializers, transport; server library routes | JSON, multipart, binary, SSE, SDP, pagination, polling, WebSocket contracts, and signed webhooks pass fixtures. | Live provider execution, public callback access, and restricted account operations. |
| CN-00 | `packages/connections/src/codex.ts`; `Connections.tsx` | Actual local probe found `codex-cli 0.159.0-alpha.3`. Its app-server stopped before account discovery. Contract checks and fallback are implemented. | Compatible installed Codex runtime and same-account Calendar read/write without a new Google grant. |
| CN-01 | Connection definitions, MCP client, OAuth provider, permissions UI | Safe import, selected tools, resource restrictions, PKCE, callback state, and issuer/audience rules pass local tests. | Real Calendar authorization, discovery, audience/scope acceptance, and service permissions. |
| CN-02 | Connection binding snapshots; source/runtime/schema hashes | Account, policy, definition, and schema drift block measured dispatch. | Actual service/runtime version records. |
| VS-01 | `useVoice.ts`; shared `voice.ts`; Devices UI | Audio-only SDP, microphone setup code, and sideband contract pass synthetic checks. | Actual English/Korean microphone and spoken output on Windows/macOS Chrome. |
| VS-02 | Voice coordinator; browser media recovery | Interruption, manual turn controls, blocked playback, end, and control loss pass contract tests. | Physical mute, interruption, network/device loss, and recovery. |
| TL-01 | Shared action executor; connection adapter; voice coordinator | Trusted final participant speech after complete proposal delivery can approve one fixture write. Model text and browser approval cannot. | Real read, spoken proposal, approved Calendar write, rejection, and Korean results. |
| TL-02 | Durable CAS action journal; idempotency preparation; reconciliation | Duplicate dispatch, crash recovery, account separation, timeout/unknown results, and read reconciliation pass tests. Unsettled writes block another write. | Real service timeout and reconciliation with the selected tool schema. |
| EX-01 | Study storage; `Studies.tsx`; Notes panel | Tasks, conditions, AB/BA order, manual order, notes, custom ratings, and coded outcomes pass local tests. | Complete real study runs. |
| EV-01 | Session and protocol snapshots; evidence events and measurements | Source labels, sequence gaps, segments, monotonic clocks, fixed configuration/task/scales, and restart persistence pass tests. | Provider identifiers, speech transcripts, and heard interruption outcomes. |
| EV-02 | Comparison engine; comparison UI; JSON/CSV exports | Counts, missing data, exclusions, participation/view/revision separation, paired values, joins, and formula escaping pass tests. | Real study comparison and evidence review. |
| PT-01 | `examples/agent/`; shared core, connections, and voice coordinator | Portable configuration loads with an action-only journal. It does not open study tables or inherit service credentials. | Actual operation with an independent authorized account binding. |
| DH-01 | Study agreement; data directory; retention/deletion; `SessionCredentials`; redaction | Study agreement, withdrawal, cleanup, deletion, and canaries pass local checks. GUI key entry, removal, restart, active locks, dynamic binding, and retired-key redaction pass tests. Quick tests have no notice gate. Raw audio has no storage path. | Provider retention and actual OAuth credential behavior. Local deletion cannot remove remote or exported copies. |
| DX-01 | Setup guide; pinned workspace; release scripts; CI matrix | Locked installation, build, startup, migration, backup, restart, and archive checks run in Linux. | Independent teammate setup and Windows/macOS installation. CI configuration is not a completed CI result. |
| UX-01 | Saved workspace surfaces; autosave; condition run form | Drafts survive fast navigation. Context stays available across panels. Applicable study consent permits a direct next run. | Observed researcher activations, time, mistakes, backtracking, and assistance. |
| UX-02 | Participant toggle; consent flow; shared action policy | Participant view is optional and off by default. Handoff and reload conceal evidence. No visual agent answer or action card appears. | Supervised participant interaction and actual spoken approval. |
| UX-03 | Responsive dark layout; semantic controls; focus and recovery | 1440/1280 layouts, 640-width reflow, keyboard search, and automated WCAG scans pass browser checks. | Physical screen reader, native 200% browser zoom, device use, and representative user recovery. |
| UX-04 | Researcher workspace; study assignment fact | Researcher participants retain parameters, graphs, configurations, transcripts, and event evidence. There are no exclusive role accounts. | Real researcher participation and observed usability. |
| UX-05 | Devices/view controls; segments; protocol deviations | View/device changes are recorded. Deviations are excluded by default. Planned views remain separate in comparisons. | Physical device changes and their actual interruption outcomes. |

## Evidence files

- [Unit and integration results](unit-results.json): synthetic records and service contracts.
- [Browser results](browser-results.json): Linux headless Chromium; includes key-check and microphone-feedback fixtures.
- [Interface review](../../design-qa.md) and [rendered screen results](design-review-results.json).
- [API operation coverage](api-coverage.json) and [parameter coverage](api-parameters.json).
- [Live prerequisite results](live-results.json): local runtime checks and blocked external gates.
- [Connection feasibility](connection-feasibility.json): actual local Codex probe; no account grant or tool call.
- [Development lifecycle](development-results.json): selected browser origin, proxy, and owned-process shutdown.
- [Verification summary](verification-summary.json): commands, source identity, environment, and result disposition.
- [Release installation report](../../release/installation-report.json): archive identity and extracted-release checks.
- [Live verification procedure](live-checks.md): exact external prerequisites and required observations.

The release archive contains sanitized evidence only. Private traces, participant records, credentials, and the supplied STE standard are excluded.

## Platform check history

The baseline pull request passes automated checks on Ubuntu, Windows, and macOS.
The initial feature Windows test failed during fixture cleanup. A restarted fixture still held the same SQLite directory.
The repair closes all fixture applications before directory deletion. It preserves the test assertions.
The GitHub delivery record gives the final feature check state. These CI results are separate from physical laptop and participant checks.

## Settings feedback evidence

`WorkspaceSettings.tsx` shows the automatic key-check result and retry control.
`key-verification.ts` uses OpenAI's documented model-list request and safe error classes.
Credential and server tests cover the verification lease, reset, route protection, response validation, and secret redaction.
`key-verification.spec.ts` covers progress, result states, retry, polling, and safe transport failure.

`components.tsx` reports microphone access in Devices. `microphone-feedback.spec.ts` checks the selected device, failures, and temporary-track cleanup.
The fixtures do not verify physical microphone access or a live OpenAI key.
