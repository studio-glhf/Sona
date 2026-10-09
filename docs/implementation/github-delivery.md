# GitHub delivery

Repository: [studio-glhf/Sona](https://github.com/studio-glhf/Sona).
Review date: 9 October 2026, Asia/Seoul.

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

Subagents created the pull requests. The main agent reviewed the changes and the combined tests.
The final application branch is `codex/sona-refinement`. Its tested integration also advances the UI branch without a force push.
The release manifest records the exact source revision and file hashes.

The credential subagent's repair commit is `35f079d1ee1c06245d5c661ff610c18dc28a52fc`.
The accepted UI commit is `3547a957e2bcc691bbde2fe2f2865567d9c7742d`.
Both remain in the integration history.

## Protection and approval

GitHub protects `main`. The initial direct push was rejected because a pull request and required checks are necessary.
The agent did not change the protections. No pull request is merged by this build task.

The authenticated account and all three pull-request authors are `htcrefactor`.
GitHub does not permit self-approval. The main agent's code acceptance does not represent a GitHub APPROVED review.
Another authorized reviewer or the repository's normal review process must satisfy those rules.

## Platform evidence

Baseline CI passes on Ubuntu, Windows, and macOS.
Initial feature Windows CI found a fixture-cleanup error. The fixture closed one application before deleting a directory shared by another application.
The repair closes all applications before deleting unique directories. It keeps all credential and restart assertions.

The final PR check results are recorded in GitHub. Local evidence includes 145 unit/integration tests and nine browser workflows.
CI and headless browser checks do not prove physical microphone, speaker, Calendar, or participant operation.

## Cloud configuration

The earlier GitHub API network block is resolved. Actual repository API requests and pull-request creation succeed through the supported proxy.
No personal access token, cookie copy, or proxy bypass was necessary.

Saving updated reusable setup instructions returned `stale_base`. The configuration changed after the earlier draft.
The current application setup works. The revised scripts are preserved in [cloud-environment-proposal.json](../setup/cloud-environment-proposal.json).
This file is transferable. It is not an active cloud configuration.
The platform requires a new setup chat from current environment settings to reconcile and save that proposal.
