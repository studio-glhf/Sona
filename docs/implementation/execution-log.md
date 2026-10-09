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

## Version 1.0.0 starting point — 9 October 2026, Asia/Seoul

The user requested a committed and pushed GitHub baseline before feature changes.
The application version is 1.0.0. This version identifies the starting point; it does not remove the blocked live verification gates.
The GUI credential and interface updates will use separate feature branches and subagent pull requests.

## Interface and credential update — 9 October 2026, Asia/Seoul

### Product decisions

The user's later instructions replace the earlier GUI key and notice requirements.
Settings accepts an OpenAI project key. The local server keeps the key in memory until restart.
The Data policy editor and Voice processing notice are removed. A quick test records no agreement claim.
Supervised study agreement remains explicit. Raw audio storage remains off.

The existing layout remains. Neutral selections, clear type, soft input corners, and compact session controls reduce visual density.
Empty evidence panels have short messages. Notes and ratings appear when a test exists.
All researcher controls and evidence remain available. Participant view remains optional and off by default.

The starting point stays at version 1.0.0. The interface update uses application version 1.1.0.
The immutable API source revision stays dated 6 October. This update does not claim another official source retrieval.

### Subagent review

The credential subagent implemented protected GUI routes, shared dynamic credentials, active-operation locks, and exact secret redaction.
The server returns key status only. Removal disables a legacy environment seed for the current run.
Retired key values remain in memory only for diagnostic redaction.

The interface subagent implemented Settings and the visual changes.
The main agent reviewed both diffs and the combined behavior before accepting them.
The accepted UI commit is `3547a957e2bcc691bbde2fe2f2865567d9c7742d`.
The credential branch includes the Windows repair at `35f079d1ee1c06245d5c661ff610c18dc28a52fc`.

An integrated browser test found stale readiness after accepted key removal and a failed background refresh.
The repair applies the accepted status immediately. A scoped metadata refresh preserves pending drafts.
The browser fixture holds a real draft save during key entry. The draft remains visible until its save completes.

GitHub Windows CI found a fixture cleanup-order error.
Two applications used the same temporary SQLite directory. The first cleanup deleted that directory before the second application closed.
The repair closes all fixture applications before deleting unique directories. The test assertions remain unchanged.

### Local verification

Frozen installation passes with 320 dependency-policy entries verified.
Cloud commands use `XDG_DATA_HOME=/workspace/.local/share` and pnpm's default store.
The earlier custom-store installation caused pnpm to request another install during script execution. The matching writable XDG configuration resolves it.
TypeScript and the production build pass. The existing browser chunk warning remains.

All 145 unit and integration tests pass in eight files.
All nine browser workflows pass in Linux Chromium.
The isolated GUI workflow also passes after the readiness and draft repairs.
The visual review uses matched baseline and current captures at 1440 pixels.
Additional captures examine 1280 and 640 pixels. Settings has no automated accessibility violations in the selected tags.
The actual screen captures produce no console errors.

The live harness keeps GUI key presence separate from command environment bindings.
Its controlled GUI-status check passes. The final prerequisite report has two local passes and seven blocked external gates.
It starts no paid model request or external write.

The final release commands are `pnpm package` and `pnpm verify:release` with the same cloud XDG path.
The installation report stays outside the archive. It records the exact tested checksum.
The release checks now include protected GUI key entry, removal, and restart.

### GitHub delivery

The baseline commit and annotated `v1.0.0` tag were pushed before feature changes.
The remotely verified baseline commit is `4e1317471a3080cb6ba966885b6db4de9bed8a1b`.
The direct push to protected `main` was rejected. No protection was changed.

The publishing subagent created [baseline PR 16](https://github.com/studio-glhf/Sona/pull/16), [credential PR 17](https://github.com/studio-glhf/Sona/pull/17), and [interface PR 18](https://github.com/studio-glhf/Sona/pull/18).
The interface PR follows the credential PR. The main agent attached all three actual pull requests to this task.
The final reviewed integration is published to `codex/sona-refinement` and advances the UI head without a force push.

The authenticated GitHub account is also the author of each pull request. Formal self-approval is not permitted.
Local supervisor acceptance does not represent a GitHub APPROVED review. No merge occurs in this task.
The GitHub delivery record separates remote CI, local checks, and physical-device evidence.

### Cloud setup and release limits

Actual GitHub API access and pull-request creation now succeed. No further user action is necessary for that access.
An updated setup-draft save returned `stale_base` because the configuration changed after the earlier draft.
The complete proposed installation and startup instructions are preserved in `docs/setup/cloud-environment-proposal.json`.
The platform requires a new setup chat from current environment settings to reconcile that file.
Current local setup and application checks remain usable. Draft persistence is not claimed for the revised scripts.

The release status remains **Release candidate — verification blocked**.
Real voice, Calendar, ChatGPT connection reuse, physical devices, and representative-user checks retain their stated prerequisites.
No credential, participant record, private STE source, or environment file enters the release archive.

## Settings feedback update — 9 October 2026

The user reported no visible microphone-check result and requested verification after GUI key entry.
This change uses version `1.1.1`. It preserves the selected layout and the `v1.0.0` starting point.

The main agent reviewed microphone commit `feeb212a69cc045f86954c75fa8d68d45a208e80` and key-check commit `bc5927b9074713bffdf456f2fcab7125c4ca7cb9`.
Both subagents created feature pull requests. PR 19 and PR 20 pass Ubuntu, Windows, and macOS CI.
Local supervisor acceptance does not represent a formal GitHub self-approval. No merge into protected `main` occurs.

Devices now reports progress, permission success, and safe recovery guidance in the dialog.
The check uses the selected microphone and releases temporary tracks after completion or a late dialog-close response.
It does not use the active voice stream or send audio to a provider.

The official OpenAI specification supports an authenticated `GET /v1/models` read.
The server uses the official SDK, pins the API origin, limits the check to ten seconds, and disables retries.
HTTP 200 confirms acceptance for that read. HTTP 401 reports authentication rejection.
Permission, rate-limit, network, and service failures report an unavailable check.
No result establishes voice permission or billing credit. The separate model-access evidence remains unchanged.
The source record and operation excerpt are in `docs/implementation/KEY-VERIFICATION-SOURCES.md` and `key-verification-source.json`.

Settings starts the check after Save. It also provides a retry control and restores an ongoing result when reopened.
The credential and result remain in server memory. Key replacement, removal, and server restart reset verification.
The protected verification request carries no key in its browser request body.
Synthetic-key browser tests intercept verification explicitly. No test credential reaches OpenAI.

TypeScript and the production build pass. All 165 unit/integration tests pass in nine files.
All 30 Chromium workflows pass, including 11 key-check workflows, ten microphone workflows, and nine existing regressions.
The initial focused run found a test assertion that expected a boolean for the model-access list.
The corrected assertion requires an empty list. The full run passes with this contract check intact.
The baseline workflow now creates its own agent and does not depend on an empty database from test-file order.

Actual Settings captures were inspected at 1440 and 1280 pixels. The microphone dialog capture was also inspected.
Key-result and Devices accessibility checks pass in the selected automated tags.
These checks use explicit service and media fixtures. Real key validation and physical microphone operation remain unverified.
The supplied writing standard guides editorial judgment. No language checker or automated compliance score runs.

The release status remains **Release candidate — verification blocked**.
The user laptop and its browser session are not available through this cloud localhost.
No existing user server is restarted. The release archive provides the updated build and setup instructions.

The publishing subagent created [integration PR 21](https://github.com/studio-glhf/Sona/pull/21) and verified the remote branch.
The main agent attached all three Settings pull requests to this task.
The release commands are `pnpm package` and `pnpm verify:release` with the existing writable cloud XDG path.
`release/installation-report.json` records the exact archive checksum and extracted-install results.
`release/settings-github-verification.json` records final GitHub CI for the published head.
These reports remain outside the archive. The archive manifest records the final source revision and per-file hashes.
The earlier 1.0.0 and 1.1.0 archives remain available.
