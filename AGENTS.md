# Agent contribution guide

Sona is a voice UX research workbench. Read [MANIFEST.md](MANIFEST.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/architecture.md](docs/architecture.md) before changing behavior. The manifest separates the prototype from planned research and integration capabilities.

## Work ownership and Git workflow

- Work through a scoped issue and pull request. Record the agent owner, branch, worktree, intended paths, acceptance criteria, and dependencies in the issue before parallel work starts. Follow the user's existing authorization when managing issues or pull requests.
- Give every concurrent agent a separate Git worktree and short-lived branch. Use `<type>/<issue>-<short-name>`, such as `feat/12-hosted-release`, and Conventional Commit titles. Start from current `origin/main` unless the issue explicitly depends on another branch.
- Agree on shared contracts before parallel edits. One agent owns a shared file at a time. Hand off ownership explicitly; do not overwrite, reset, or discard another agent's changes. The integration owner coordinates dependency and lockfile changes.
- Keep each pull request focused and link its issue. Explain the resulting behavior, relevant validation, and remaining limitations. Update documentation alongside behavior.
- `main` is protected: required `quality` and `browser` checks, resolved conversations, linear history, no force pushes, and no branch deletion. Do not bypass protections. Merges are maintainer-controlled and use squash merge; merged branches are deleted automatically.
- There is initially no required separate approving account because agents may share a GitHub identity. This does not authorize an agent to merge its own work unless the user has delegated that action.

## Structure and commands

| Area              | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `apps/web`        | React UI, English/Korean copy, accessible controls, browser audio, session transport |
| `apps/server`     | Fastify API, validation, ephemeral credential brokerage, production static serving   |
| `packages/shared` | Zod schemas, API/session types, supported capabilities, trial interfaces             |
| `docs`            | Architecture, verified references, future operational and research guidance          |

Use Node.js 24 and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm dev
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm start
```

Development uses frontend port 5173 and server port 3001. Production serves both on port 3001. `pnpm check` covers formatting, type checking, unit tests, and build. Use `pnpm format` only on changes you own, or format explicit owned paths with Prettier. Inspect the resulting diff.

## Architectural boundaries

- Keep configuration validation and transport-neutral contracts in `packages/shared`. The UI must distinguish draft settings, applied settings, an update in progress, and restart-required changes.
- Keep OpenAI session creation in the server broker. The browser connects to OpenAI with a temporary credential and WebRTC. Never put a long-lived API key in a URL, bundled code, environment example, browser storage, telemetry, log, preset, or export.
- The per-session key entered in the UI may exist transiently only as needed to create a session. Do not add server persistence, global credential state, or a shared API key fallback.
- Realtime updates must be acknowledged before being shown as applied. Handle rejection and timeout; retain the previous applied configuration when an update fails. Model and voice changes currently require a new session.
- Stop media tracks, peer connections, timers, audio resources, and event listeners when the session stops or fails. A failed connection must not leave an active microphone unnoticed.
- The researcher UI opens directly into live voice setup. Keep scripted controller simulation internal to automated tests; do not expose a Simulation tab, sample-turn control, or test backdoor. Simulation must be deterministic and must never contact OpenAI or real service tools. Label any future simulated tool activity clearly. Planned or unavailable capabilities must not execute.
- Tool, capability, and trial interfaces are extension points, not evidence that integrations or recording are implemented. Add live service execution only through an explicit capability and confirmation policy.

## API and capability accuracy

Before changing model identifiers, supported parameters, Realtime event handling, authentication, or API shapes, check current official OpenAI documentation. Record the source URL and verification date in the relevant documentation or capability entry. Existing code and recalled examples are not sufficient evidence of current API behavior.

The integration reference is **personal ChatGPT Plus/Pro**, not Enterprise, Codex, or every action exposed by a service's public API. Verify each action and plan distinction before claiming parity. A capability needs a status, verification date, and reference plan; keep uncertain actions planned or unavailable. Do not infer ChatGPT support from tools available to your agent.

## Product quality and research data

- Provide English and Korean UI text for new user-facing behavior. Keep controls keyboard accessible, visibly focused, and labeled; communicate status without relying only on color or animation. Respect reduced motion.
- The character visualizes observable session/audio activity. Any later emotional expression is an optional interpretation, not a measurement of the model's internal emotion or intent.
- Use synthetic fixtures in tests, screenshots, recordings, issues, and examples. Do not commit participant information, audio, transcripts, tokens, credentials, or personal service content.
- Keep research capture opt-in and device-local when implemented. Exclude credentials from every serializable research object. Do not silently introduce analytics, cloud study storage, or background monitoring.
- Error messages should help a researcher recover without exposing upstream request bodies or secrets.

## Validation and handoff

Run `pnpm check` and `pnpm test:e2e` before handing off implementation changes. Add meaningful regression tests for changed session behavior; avoid tests that only repeat the implementation. Cover relevant failure paths, including credential rejection, microphone denial, disconnects, interruption, and failed or timed-out updates.

CI must remain free of paid API calls and real service writes. A live smoke test is separate and uses only a researcher-provided key when that use is authorized. Report which browser/model was tested and any untested live behavior without recording the key or private conversation. Never claim a live check passed from mocked tests.

Include changed behavior, tests run, remaining issues, and the commit/PR in the handoff. Review the diff and working tree for accidental files or secrets. If blocked, state the concrete blocker and what remains; do not relabel unfinished work as implemented.
