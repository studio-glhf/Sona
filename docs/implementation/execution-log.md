# Sona execution log

## Build in progress — 6 October 2026

Authority: PRD 1.0 and execution plan 1.0. The user authorized implementation, verification, repair, and local packaging in this run. Internal gates do not need approval.

### Repository and environment

- The initial checkout had README changes and untracked specification documents. These files are preserved.
- No applicable AGENTS.md was found. The complete PRD, execution plan, build prompt, API coverage, provenance, and all three UI figures were examined.
- Node 24.19.0 and pnpm 11.19.0 are installed. The workspace pins these versions.
- The server API key, admin key, Google client ID/secret, and dedicated calendar ID are absent. No secret values were printed.
- Chromium is available in Linux. This does not establish Windows/macOS or physical microphone support.
- Official schema refresh is available through GitHub. Some official documentation pages return CONNECT 403. The source record must show those limits.

### Active work and ownership

- Root: workspace, HTTP server, WebRTC sideband, integration, release checks.
- agent_core: portable validation, translation, action executor, example runtime.
- connections: MCP/OAuth, plugin definitions, Codex bridge, resource restrictions.
- storage_studies: SQLite, studies, consent, evidence, comparison, exports.
- api_library: full source inventory, schemas, execution shapes, coverage.
- web_ui: selected researcher/participant/comparison UI and browser media.

### Decisions

- One loopback Fastify server, SQLite outside the checkout, React/Vite browser app.
- Keep the application key in server environment bindings. OAuth tokens stay in server memory unless a supported credential store is configured.
- No live paid call starts without a dated cost bound and authorized credentials.
- Use automated synthetic fixtures only as contract/browser evidence. Keep service and device checks separate.

### Next action

Complete the pinned workspace and server integration. Record tests and failures here as each package arrives. No release gate has passed yet.

## Integration checkpoint — 6 October 2026, UTC

The parallel workers stopped after a usage limit. The saved modules were kept. The primary agent continued their unfinished work.

- React workspace and all selected surfaces are implemented. Browser tests passed 5 of 5 on Linux Chromium.
- The loopback server starts. Host, Origin, local-session token, and OAuth state checks are implemented.
- Agent core, connections, API library, storage, and HTTP tests passed 112 of 112 before the new voice-coordinator tests.
- The refreshed source hash is `491c868adbdb24cf556048f996dc214181085721807bfe9ee28c60627e53d79e`. Coverage accounts for 354 operations, 227 paths, 31 families, 10 transport unions, and 26 webhook definitions. All 354 request schemas compile. Live API coverage is zero.
- A beta Responses grouping defect, field labels, and GET request content-type handling were repaired after failed checks.
- Current official transport guidance uses an audio-only browser peer connection. Browser Realtime data channels were removed. The server controls settings and tool execution.
- The portable runtime uses the same voice coordinator, validator, translation, connection adapter, and action executor. It has an independent action journal and no study tables.
- CSV export now produces real CSV files with a JSON manifest in a tar.gz archive. Study export scope follows selected filters.
- No OpenAI model call, Google write, public deployment, or purchase has occurred.

Next: complete voice-coordinator and export checks, examine final screenshots, preserve source evidence, run clean installation and packaging, and assess every release gate. Physical Windows/macOS devices, independent people, OpenAI credentials, and a Calendar grant remain unavailable.

## Local implementation complete — 6 October 2026, UTC

The primary agent completed the remaining packages. No new delegated worker was started in this continuation.
The PRD, selected figures, earlier source records, and private STE document were preserved.

### Final behavior and decisions

- Researcher view remains the default. Researcher participants retain all controls and evidence. Participant view is optional and has no visual agent answers.
- Active configuration and study protocol snapshots stay fixed. Draft edits prepare the next run. Old ratings use their original scales.
- Comparison groups separate configuration, condition snapshot, protocol, view, and participation. Different task protocols are not paired.
- Applicable study consent can be reused. Session consent is consumed once. A retention increase cannot extend an earlier accepted record.
- Safe connection import, OAuth, account/resource restrictions, schema versions, private logical bindings, and instruction review are implemented.
- The browser sends audio only. Server control checks provider settings before microphone transmission. Storage failure or configuration drift stops the session.
- Model statements and browser approval events cannot approve writes. The shared executor uses trusted final participant speech after complete proposal delivery.
- Supported idempotency fields are prepared before proposal. Unknown outcomes block another write to the same account and resource.
- The example runtime uses the same validator, connections, coordinator, and executor. Its database has only action records.
- API observation jobs have local stop controls. Signed webhook deliveries are visible in memory. Remote cancellation remains a separate documented operation.
- Custom voice objects remain intact during common-control edits. Missing provider evidence has an explicit label.
- Development uses the native Node supervisor. Selected browser ports update the proxy and Origin allowlist. Owned process groups stop together.
- Technical writing used ASD-STE100 Issue 9 with editorial judgment. No archived language checker or compliance score ran.

### Repairs and local evidence

- The final unit/integration run passed 136 tests across seven files. The report is `docs/verification/unit-results.json`.
- Type checks and the production build passed. Vite reported a large browser chunk; it did not fail the build.
- Earlier browser runs passed six workflows. The added custom-voice workflow found an accessible-name issue, which was repaired.
- Its later selector matched two legitimate Saved labels from mounted workspace surfaces. The selector now targets Agent controls. The final browser report replaces the earlier report after the rerun.
- API coverage remains 354 cataloged operations, 354 compiled schemas, 354 handler selections, and zero live operation passes. There are 19,615 parameter descriptors.
- Extracted-release verification passed seven local checks before the final documentation update. Repeat it on the final archive and keep its checksum in `release/installation-report.json`.
- Development proxy, selected Origin, and owned-process shutdown passed local lifecycle checks.
- The opt-in live prerequisite command passed two local checks, failed none, and blocked seven external gates. It made no paid model call or external write.
- The actual official-runtime probe found `codex-cli 0.159.0-alpha.3`. Its app-server stopped before account discovery. No reuse claim is made.

### External prerequisites

- An authorized OpenAI API project, model access, and dated prices for real voice.
- A usable Google OAuth client, accepted audience/scopes, authorized account, and dedicated test calendar for real tools.
- A compatible released Codex runtime and existing account grant for a ChatGPT reuse result.
- Physical Windows/macOS laptops, microphones, output devices, screen readers, and native zoom checks.
- Representative researchers, supervised participants, and an independent teammate for usability, setup, and account portability.
- Network access to current official lifecycle and pricing pages. Those pages returned CONNECT 403 in this environment.

### Delivery

Readiness disposition: **Release candidate — verification blocked**, subject to the final archive check.
All 24 requirement IDs have implementation evidence and a separate verification disposition in `docs/verification/requirement-evidence.md`.
`docs/verification/readiness.md` assesses B0 through B7. `API-SOURCE-LEDGER.md` records source hashes and limits.

The cloud onboarding configuration draft was saved with the tested installation script and startup instructions.
Existing network policy was preserved. No credentials were added. The draft is not published.

Next action in this run: finish the final browser rerun, make the verification summary, package the final tree, and repeat extracted-release checks.

## Final release checkpoint — 6 October 2026, UTC

The browser rerun passed all seven workflows. The final unit and integration run passed all 137 tests across seven files.
Type checks and the production build passed after the last privacy repair.
The repair removes ephemeral OpenAI secrets from provider evidence, API observations, and stored events.
Its fixture test passed. No live service claim follows from that test.

`docs/verification/verification-summary.json` records the final local results and external prerequisites.
All application work is complete. The release status remains **Release candidate — verification blocked**.
Real voice, Google Calendar, account reuse, physical laptops, usability, and independent teammate checks remain blocked as stated above.

The final release command is `pnpm package`. The extracted-release command is `pnpm verify:release`.
`release/installation-report.json` records the result and SHA-256 of the exact archive it tests.
This report stays outside the archive to avoid a checksum that refers to itself.
Use that report, the archive checksum, and the per-file manifest as the final delivery evidence.
The saved cloud setup draft remains unpublished. No external deployment or production resource change occurred.
