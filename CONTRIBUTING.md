# Contributing to Sona

Start with the [manifest](MANIFEST.md) and [architecture](docs/architecture.md). AI agents must also follow [AGENTS.md](AGENTS.md).

## Choose and claim work

Use an existing [issue](https://github.com/studio-glhf/Sona/issues), or open one with the research need, intended behavior, acceptance criteria, and affected areas. Keep the milestone and implementation status accurate. Before parallel work, record an owner and a bounded set of paths for each contributor in the issue. Shared types, dependencies, and lockfiles need one coordinated owner.

Use a separate worktree for each simultaneous contributor or agent:

```sh
git fetch origin
git worktree add ../sona-issue-12 -b feat/12-hosted-release origin/main
```

Replace the example issue number and branch name with your assigned work. Use short-lived branches named `<type>/<issue>-<description>`; common types are `feat`, `fix`, `docs`, `test`, and `chore`. Never develop directly on `main` or overwrite someone else's branch.

## Develop and test

Use Node.js 24 and pnpm 10.30.2. Install dependencies with `pnpm install`, then run `pnpm dev`. See the [README](README.md) for local and production startup.

Before opening or updating a pull request:

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

Add tests for meaningful behavioral changes and failures. Check both English and Korean copy, keyboard operation, visible focus, and reduced-motion behavior for UI changes. Test fixtures must be synthetic. CI uses simulated or mocked services and must not require API keys, paid calls, or real account writes.

A live voice smoke test is separate. If a researcher supplies a key for that test, record the browser, model, outcome, and limitations in the PR without including the key, audio, or private transcript. If no key is available, state that the live check was not run.

## Submit and review

Use Conventional Commit messages and PR titles, such as `feat: add session restart notice` or `fix: release microphone after failed connection`. Open a focused pull request that links the issue and explains the before/after behavior, validation, and limitations. Update the manifest or architecture if supported behavior, data handling, API assumptions, or implementation status changes.

The repository follows [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow): protected `main`, short-lived branches, pull requests, and squash merges. The required checks are `quality` and `browser`; the branch must be current with `main` and review conversations must be resolved. Force pushes and deletion of `main` are blocked. A maintainer controls merging, and merged feature branches are deleted automatically.

No separate approving account is required initially because human and agent contributions may share a GitHub identity. Contributors must still supply reviewable evidence and follow the maintainer's merge instructions. Do not bypass protection settings to land a change.

## Credentials and participant data

Do not include API keys, tokens, recordings, transcripts, participant information, or personal service data in commits, issues, PRs, or CI logs. Use placeholders and synthetic content. The prototype accepts an API key only transiently for session setup; any change to credential or data handling needs explicit documentation and regression coverage.

Contributions are made under the repository's [MIT license](LICENSE).
