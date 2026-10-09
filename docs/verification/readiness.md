# Release assessment

**Release candidate — verification blocked**

Sona local v1 is implemented. Local automated checks and release installation checks are recorded separately from real service results.
The evidence does not support the status **Production-ready local v1**.

Application version: `1.1.0`. Review date: 9 October 2026, Asia/Seoul.
Product authority: PRD 1.0 and [the user's later interface update](../implementation/workspace-refinement.md).
Capability revision: `openai-2026-10-06-491c868adbdb`. This interface update does not claim a new API source retrieval.
The archive manifest identifies all source and build files, including uncommitted work.

## Build gates

| Gate | Implemented behavior | Verification disposition |
|---|---|---|
| B0 — Foundation | Pinned workspace, loopback server, SQLite migration, shared contracts, API source record, and CI matrix. | Local checks pass. Official pricing and independent lifecycle pages were blocked by network policy. |
| B1 — Connections | Safe plugin/MCP definition import, OAuth, discovery, tool policies, private resources, and compatible Codex direct tool route. | Contract checks pass. Real Calendar grant, access, and ChatGPT account reuse are blocked. |
| B2 — Voice workspace | Audio-only WebRTC, server control, live researcher evidence, EN/KR configuration, and device controls. | Synthetic controls pass. Physical EN/KR voice on the target laptops is blocked. |
| B3 — Configurations and actions | Immutable revisions, shared validation, fixed snapshots, trusted spoken approval, durable action states, and reconciliation. | Local action and recovery checks pass. Actual Calendar read/write and heard proposal checks are blocked. |
| B4 — Studies and data | Task conditions, ordering, applicable consent, optional Participant view, persistence, retention, and deletion. | Local and browser checks pass. Supervised participant and physical device checks are blocked. |
| B5 — Evidence and portability | Descriptive comparisons, JSON/CSV export, portable configuration, and independent action-only runtime. | Local comparison/export/runtime checks pass. A complete real experiment and independent account runtime use are blocked. |
| B6 — API library | All 354 retrieved operations, source parameters, execution shapes, stream events, and signed webhooks. | 354 schemas compile. Handlers are represented. Live coverage is zero; lifecycle availability remains unverified. |
| B7 — Local delivery | Source/build archive, checksum, manifest, setup guide, automated tests, and extracted-release verification. | Linux checks pass. Windows/macOS, physical accessibility, teammate setup, and observed usability are blocked. |

See [requirement evidence](requirement-evidence.md) for all 24 PRD identifiers.
See [the source record](../implementation/API-SOURCE-LEDGER.md) for API provenance and source limits.

## Local verification

The [verification summary](verification-summary.json) contains exact commands and result counts.
The tests use isolated temporary data. They do not use participant records or a live Calendar.
Browser images show application files running in Linux Chromium. They are not generated UI concepts.

| View | 1440 × 1024 | 1280 × 800 |
|---|---|---|
| Researcher | [Image](researcher-1440.png) | [Image](researcher-1280.png) |
| Participant | [Image](participant-1440.png) | [Image](participant-1280.png) |
| Comparison | [Image](compare-1440.png) | [Image](compare-1280.png) |

The [release installation report](../../release/installation-report.json) verifies the extracted archive.
It covers locked installation, protected startup, revisions, persistence, exports, restart, backup, deletion, runtime isolation, and credential canaries.
It also checks key entry through the protected GUI routes and key removal on restart.
It does not prove installation by another person.

## Interface update

Settings accepts the OpenAI project key. The server keeps it in memory until restart.
The Data policy editor and Voice processing notice are removed. Study agreement remains explicit.
The quieter workspace keeps all researcher controls and evidence.

The [visual review](../../design-qa.md) uses actual browser captures.
The [GitHub delivery record](../implementation/github-delivery.md) identifies the baseline and feature pull requests.

## Missing external prerequisites

| Check | Missing prerequisite | Procedure |
|---|---|---|
| OpenAI voice and applied settings | Authorized API project, selected model access, dated price estimate, physical microphone, and speaker. | Live procedure: Voice and fixed configuration. |
| Calendar read, confirmed write, and recovery | Sona-authorized Google account, usable OAuth client, accepted audience/scopes, and designated test calendar. | Live procedure: Calendar and spoken approval. |
| Existing ChatGPT connection reuse | Compatible released Codex app-server, its official ChatGPT sign-in, and existing selected-account Calendar access. The available alpha runtime stopped during the probe. | Record a real read and approved write without a new grant. Otherwise retain the direct authorization fallback. |
| Full API live states | Authorized project/admin credentials and operation-specific resources or permissions. | Execute the selected operation through the API library after validation and cost admission. Record each result separately. |
| Windows/macOS support | Actual target laptops, current Chrome, and physical input/output devices. | Live procedure: Devices and recovery. |
| Accessible physical interaction | Screen reader, native 200% zoom, and representative keyboard/device use. | Live procedure: Researcher usability and teammate setup. |
| Study and agent portability | Complete real conditions and a separate authorized runtime binding. | Live procedure: Complete study and portable agent. |
| Researcher usability and teammate setup | Representative researcher, supervised participant, and independent teammate. | Record PRD task measures. Do not substitute a synthetic account. |

Start Sona, then run `pnpm test:live` with `SONA_LIVE=1` for local prerequisite checks.
That command does not start paid voice calls or external writes. Complete [the live procedures](live-checks.md) for the actual observations.
Exit code 2 means verification remains blocked. It is not a pass.

No paid model call or external write occurred in this build run. No current usage price was invented.
The unattended admission budget remains USD 10. It is not a provider invoice cap.

## Operating limits

- The browser session has audio only. Research evidence stays available in Researcher view.
- Participant view is a presentation mode, not a separate access-control account.
- Raw audio is not saved. OpenAI and tool services have separate processing and retention policies.
- OAuth tokens stay in server memory. A restart can require sign-in again.
- Source/model availability can change. The catalog and validation do not prove reproducible provider behavior.
- Task, rating, condition, and configuration snapshots stay fixed. Different task/rating protocols are not paired or pooled in a clean comparison.
- A server event can confirm generated speech delivery at the source. It cannot prove which words a person heard.
- Writes need final participant transcription, turn-start evidence, complete proposal delivery, and an unchanged binding.
- Unknown outcomes block another write to the same account and resource. Reconciliation uses a selected read tool; it never repeats the write.
- Host-required visual approval cannot be bypassed. Record it as a deviation from a voice-only approval protocol.
- Browser evidence is headless. Automated accessibility checks cover only part of WCAG 2.2 AA.
- The default voice duration is 15 minutes. Request/result limits and source constraints are documented in setup and the API library.

These limits are visible in setup and verification records. They are not mock replacements for blocked live results.

## Start the release

Use Node 24.19.0 and pnpm 11.19.0. Extract `release/sona-1.1.0-local.tar.gz`.

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open `http://127.0.0.1:4317` in desktop Chrome. Open **Settings**, enter your OpenAI project key, and select **Save key**.
Use the [setup guide](../setup/README.md) for Google authorization and optional server credentials.
Keep the terminal open. Stop Sona with Ctrl+C. Startup does not resume microphone capture.
