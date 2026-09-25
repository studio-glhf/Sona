# Sona

Sona is a browser workbench for UX researchers to experiment with OpenAI voice agents. Talk to an agent, see when it is listening or speaking, and apply changes to its behavior during a session.

This repository contains the **M1 prototype**: an English/Korean interface, a line-based character with audio-reactive mouth movement, a collapsible settings panel, and a live Realtime WebRTC connection. Connected services, complete parameter coverage, recordings, presets, and hosted deployment are tracked work, not available features. See the [project manifest](MANIFEST.md) for the full scope and roadmap.

## Run locally

Use **Node.js 24** and **pnpm 10.30.2**. With those installed:

```sh
git clone https://github.com/studio-glhf/Sona.git
cd Sona
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The development frontend forwards `/api` requests to the local server on port 3001.

The workbench opens directly into live voice setup. Enter an API key to start a conversation. There is no scripted simulation mode in the researcher interface.

For a live conversation:

1. Enter your own OpenAI API key for the session.
2. Choose a model and voice, then start the session and allow microphone access.
3. Open the settings panel, edit instructions or turn-taking controls, and choose **Apply**. The applied state changes after OpenAI acknowledges the update.
4. Stop and start a new session to change the model or voice. Stop the session when finished.

Use desktop Chrome or Edge. Microphone access requires localhost or HTTPS. Live use requires an API account with access to the selected model and available API credit. Sona does not provide ChatGPT sign-in or reuse a ChatGPT subscription or its service connections.

Your long-lived API key is held transiently for session setup and sent to Sona's local server to obtain a temporary OpenAI credential. It is not saved to browser storage or application files and is excluded from logs and research records. See [architecture and data handling](docs/architecture.md). Do not enter a key into an untrusted hosted copy.

## Production build, served locally

```sh
pnpm build
pnpm start
```

Open [http://localhost:3001](http://localhost:3001). The server serves the built frontend and API together. A public deployment needs a backend and HTTPS; static GitHub Pages alone cannot run the session broker. Optional server settings are `HOST` (default `127.0.0.1`), `PORT` (default `3001`), and `SONA_ORIGIN` (the exact public HTTPS origin). Set `SONA_ORIGIN` before binding beyond localhost. Supply these as process environment variables; `.env` files are not loaded automatically. Never set a shared API key.

Hosted delivery is [M4](https://github.com/studio-glhf/Sona/milestone/4).

## Develop and validate

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` checks formatting and types, runs unit tests, and builds the app. Browser tests use synthetic API and media fixtures; CI makes no paid API calls and performs no real service writes. A successful automated run does not establish live audio quality or account access. A separate live smoke test requires a researcher-supplied key; no paid live smoke test is claimed by this prototype.

| Area                                                 | Location          |
| ---------------------------------------------------- | ----------------- |
| React/Vite frontend and browser session transport    | `apps/web`        |
| Fastify session broker and production server         | `apps/server`     |
| Validated session contracts and extension interfaces | `packages/shared` |
| Architecture and implementation notes                | `docs`            |

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request workflow and [AGENTS.md](AGENTS.md) before using an AI agent to contribute. Work is tracked in [issues](https://github.com/studio-glhf/Sona/issues) and [milestones](https://github.com/studio-glhf/Sona/milestones).

## License

[MIT](LICENSE). Sona is a studio glhf project and is not an official OpenAI product.
