# GitHub delivery

Repository: [studio-glhf/Sona](https://github.com/studio-glhf/Sona).
Review date: 9 October 2026, Asia/Seoul.

## Default-branch delivery

The user authorized completion of the pull requests and integration into `main` after the local release.
[PR 21](https://github.com/studio-glhf/Sona/pull/21) now targets `main` and contains the complete reviewed version 1.1.1.
It includes the baseline and all feature commits from PRs 16–20.

The branch protection requires checks named `quality` and `browser`.
The platform matrix alone did not produce these names. The workflow now supplies both checks.
`quality` requires successful type, unit, and build checks on Ubuntu, Windows, and macOS.
`browser` runs the 30 Chromium workflows with an installed Playwright browser.
No required check is removed. No successful status is fabricated.

The repository permits squash merges only. A normal merge of PR 21 integrates the complete application in one operation.
Earlier feature PRs can then close as superseded. Their branch history and the `v1.0.0` tag remain available.
Final merge and closure results are recorded in `release/main-integration.json`, outside the archive.
The sections below record the earlier build and its original stacked review order.

## Preserved starting point

The user requested a commit and push before feature changes.
The published [v1.0.0 tag](https://github.com/studio-glhf/Sona/tree/v1.0.0) identifies commit `4e1317471a3080cb6ba966885b6db4de9bed8a1b`.
The `codex/sona-local-v1` branch identifies the same commit. Both remote references were verified after the push.

The tag is annotated. Its tag-object hash is `84a021ab758982b5a9ddae718449aaf909aa113b`.
The local `release/sona-1.0.0-local.tar.gz` archive remains available.

## Review order

| Pull request | Change | Base |
|---|---|---|
| [#16](https://github.com/studio-glhf/Sona/pull/16) | Local v1.0.0 starting point | `main` |
| [#17](https://github.com/studio-glhf/Sona/pull/17) | Project key routes and dynamic credential binding | `codex/sona-local-v1` |
| [#18](https://github.com/studio-glhf/Sona/pull/18) | GUI key form, simpler flows, refined workspace, and final release evidence | `codex/gui-credentials` |
| [#19](https://github.com/studio-glhf/Sona/pull/19) | Visible microphone-check results | `codex/sona-refinement` |
| [#20](https://github.com/studio-glhf/Sona/pull/20) | Safe server-side OpenAI key verification | `codex/sona-refinement` |
| [#21](https://github.com/studio-glhf/Sona/pull/21) | Complete reviewed local application, including Settings integration and version 1.1.1 | `main` |

Subagents created the pull requests. The main agent reviewed the changes and the combined tests.
The interface release is on `codex/sona-refinement`. The Settings feedback integration uses `codex/settings-validation`.
Earlier branches and the starting-point tag remain available. No force push occurs.
The release manifest records the exact source revision and file hashes.

The credential subagent's repair commit is `35f079d1ee1c06245d5c661ff610c18dc28a52fc`.
The accepted UI commit is `3547a957e2bcc691bbde2fe2f2865567d9c7742d`.
Both remain in the integration history.

## Protection and approval

GitHub protects `main`. The initial direct push was rejected because a pull request and required checks are necessary.
The agent did not change the protections. No pull request is merged by this build task.

The authenticated account and the pull-request authors are `htcrefactor`.
GitHub does not permit self-approval. The main agent's code acceptance does not represent a GitHub APPROVED review.
Another authorized reviewer or the repository's normal review process must satisfy those rules.

## Platform evidence

Baseline CI passes on Ubuntu, Windows, and macOS.
Initial feature Windows CI found a fixture-cleanup error. The fixture closed one application before deleting a directory shared by another application.
The repair closes all applications before deleting unique directories. It keeps all credential and restart assertions.

The version 1.1.0 release passed 145 unit/integration tests and nine browser workflows.
The version 1.1.1 results are in the current verification summary.
Microphone PR 19 and key-check PR 20 pass Ubuntu, Windows, and macOS CI at their reviewed heads.
PR 21 contains the integrated feature commits and main-agent acceptance.
Its exact-head CI record is in `release/settings-github-verification.json`, outside the archive.
CI and headless browser checks do not prove physical microphone, speaker, Calendar, or participant operation.

## Cloud configuration

The earlier GitHub API network block is resolved. Actual repository API requests and pull-request creation succeed through the supported proxy.
No personal access token, cookie copy, or proxy bypass was necessary.

Saving updated reusable setup instructions returned `stale_base`. The configuration changed after the earlier draft.
The current application setup works. The revised scripts are preserved in [cloud-environment-proposal.json](../setup/cloud-environment-proposal.json).
This file is transferable. It is not an active cloud configuration.
The platform requires a new setup chat from current environment settings to reconcile and save that proposal.
