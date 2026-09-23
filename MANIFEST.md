# Sona project manifest

**Project:** Sona · **Owner:** studio glhf · **License:** MIT  
**Baseline:** 2026-09-23 · **Current increment:** M1 — Foundation and live voice

## Background and purpose

UX researchers need to experience how a voice agent changes when they adjust its instructions, voice, turn-taking, and connected tools. Their wider research workflow relies heavily on ChatGPT. Sona provides a focused browser environment for comparable voice experiments, with visible agent activity and controls that make configuration changes understandable.

The initial examples are an agent reviewing a person's upcoming or past Google Calendar events and an agent updating a Notion dashboard through conversation. Those examples motivate a reusable workbench rather than a single calendar or dashboard assistant.

Sona supports three research objectives:

- **Conversational feel:** evaluate responsiveness, turn-taking, interruption, and the clarity of listening/speaking states.
- **Persona and delivery:** compare instructions, voices, language, and expressive presentation.
- **Task effectiveness:** evaluate whether an agent understands context and completes enabled tasks, including tool use and confirmation behavior.

## Agreed product scope

| Area                   | Requirement                                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access and delivery    | Prefer a hosted website; preserve a launchable local server and browser frontend. Researchers bring their own OpenAI API keys. The prototype does not offer OpenAI/ChatGPT login or subscription-credit reuse.                                                                    |
| Browser and language   | Desktop Chrome and Edge; English and Korean interface and conversations.                                                                                                                                                                                                          |
| Agent presentation     | Minimal interface with a stylized, potentially nonhuman line-based character. Clearly show listening, thinking, and speaking. Use audio-reactive mouth movement, with richer optional expressions planned. Expressions are interpretations, not measurements of internal emotion. |
| Parameter controls     | A collapsible sidebar with common and advanced controls, explanations, and every verified tunable parameter for supported models. Keep draft and applied settings distinct, use an explicit Apply action, and identify changes requiring a session restart.                       |
| Research setup         | Reusable named presets and scenarios, imports/exports, notes, and configuration comparisons.                                                                                                                                                                                      |
| Research records       | Selectable capture of audio, transcripts, timing, tool activity, settings changes, and notes, saved to the researcher's device. Include the active configuration and dated capability baseline in each trial.                                                                     |
| Guided connections     | Researcher-owned authorization and resource selection for Google Workspace, GitHub, and Notion. Google Workspace includes Calendar, Gmail, Drive, Docs, Sheets, and Slides subject to the verified action catalogue.                                                              |
| Custom connections     | Researchers can connect compatible remote MCP servers, choose tools, and authorize access themselves.                                                                                                                                                                             |
| Tool behavior          | Simulated tools by default, configurable results/delays/failures, and an explicit switch to real services. Support immediate, spoken, or on-screen confirmation by experiment policy; default real writes to spoken confirmation.                                                 |
| Agent initiative       | Review configured relevant context when a session starts and perform explicitly configured proactive actions during the session.                                                                                                                                                  |
| Comparable experiments | Align service actions with official integrations available to personal ChatGPT Plus/Pro users, with dated verification and visible gaps.                                                                                                                                          |

### Personal ChatGPT capability baseline

The target is the action scope of official Google Workspace, GitHub, and Notion integrations for **personal Plus/Pro accounts**. It is not every action in each service's API. Organization administration and enterprise-only features are excluded. Any Plus-versus-Pro or access difference must be recorded.

No complete service-by-service parity claim has been verified for this prototype. [Issue #8](https://github.com/studio-glhf/Sona/issues/8) will establish the catalogue using current official sources and observed personal-account availability. Each capability will record its source, verification date, reference plan, read/write effect, and whether Sona makes it available live, in simulation only, or not at all. Freeze that version with each experiment so later product changes do not silently change its interpretation.

Sona must obtain its own service authorization; existing ChatGPT connections are not assumed transferable. A Codex tool inventory is not evidence of a personal ChatGPT plan's capabilities.

## Implementation status and roadmap

### M1 — Foundation and live voice

This prototype delivers the public repository and collaboration workflow, TypeScript workspace, a bilingual workbench, deterministic session simulation, and an OpenAI Realtime session broker with direct browser WebRTC. It includes microphone controls, an audio-reactive line character, editable instructions, model/voice choices, semantic/server voice activity detection controls, explicit Apply, and restart notices. Model and voice changes require a new session; other supported updates wait for acknowledgment.

The shared package defines capability, tool-execution, and trial interfaces for future work. These types do not implement connected tools or recording. Simulation currently demonstrates scripted session behavior; configurable tool simulations are M2.

| Issue                                              | Delivery                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [#1](https://github.com/studio-glhf/Sona/issues/1) | Repository, MIT license, documentation, agent workflow, and CI  |
| [#2](https://github.com/studio-glhf/Sona/issues/2) | Bilingual voice workbench, controls, and character              |
| [#3](https://github.com/studio-glhf/Sona/issues/3) | Secure session broker, browser transport, simulation, and tests |

M1 acceptance requires passing formatting, types, unit tests, browser tests, and production build; accessible controls and localized layouts; accurate status and applied configuration; and cleanup on stop/failure. Tests cover session creation, rejected credentials, microphone denial, disconnects, interruption, and accepted/rejected updates. Automated tests use synthetic fixtures without paid API calls. A live voice smoke test requires a researcher-supplied key and is recorded separately; it is not claimed from automated results.

### M2 — Research workflows and simulation

| Issue                                              | Planned delivery                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [#4](https://github.com/studio-glhf/Sona/issues/4) | Complete verified parameter catalogue, common/advanced controls, bilingual help, and model-specific availability |
| [#5](https://github.com/studio-glhf/Sona/issues/5) | Scenarios, reusable presets, notes, imports/exports, and comparisons                                             |
| [#6](https://github.com/studio-glhf/Sona/issues/6) | Selective local capture, playback, downloads, consent/recording indicators, and versioned trial records          |
| [#7](https://github.com/studio-glhf/Sona/issues/7) | Configurable simulated tools, latency/failures, confirmation modes, and richer optional expressions              |

Acceptance: researchers can repeat and compare a scenario, choose what is recorded, export a self-describing trial without secrets, and explore deterministic tool outcomes without contacting live services.

### M3 — Connected services and MCP

| Issue                                                | Planned delivery                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| [#8](https://github.com/studio-glhf/Sona/issues/8)   | Verified personal ChatGPT Plus/Pro action catalogue and explicit gaps            |
| [#9](https://github.com/studio-glhf/Sona/issues/9)   | Guided Google Workspace authorization and verified read/write actions            |
| [#10](https://github.com/studio-glhf/Sona/issues/10) | Guided GitHub and Notion authorization and verified read/write actions           |
| [#11](https://github.com/studio-glhf/Sona/issues/11) | Custom remote MCP, action selection, authorization, and session-start initiative |

Acceptance: each live action has a verified catalogue entry, appropriate authorization, a simulation, a visible result, and an enforced confirmation policy. Handle expired connections and untrusted tool results. Custom remote MCP must restrict server-side network destinations appropriately. A simulated action must never cause a real read or write.

### M4 — Hosted research release

[#12](https://github.com/studio-glhf/Sona/issues/12) covers an HTTPS deployment with a backend, continued local launch support, operational documentation, and end-to-end research validation. Static GitHub Pages alone does not provide the required backend.

Acceptance: verified capability comparisons, participant/session isolation, safe credential handling, selective exports, and Chrome/Edge checks for English/Korean, accessibility, microphone access, playback, interruption, and failure recovery. Hosting and live integrations must be verified before the project is described as a complete research release.

## Boundaries and decisions

- Research data stays device-local; no cloud study library is planned.
- There is no continuous background monitoring when the website is closed. Initiative is scoped to configured, active sessions.
- Custom remote MCP is in scope; a generic arbitrary REST integration builder is not.
- A live API session consumes the researcher's API resources. The personal Plus/Pro reference defines comparable service actions, not Sona's authentication or billing mechanism.
- The avatar's speech activity comes from session events and audio. Optional emotional expressions must remain distinguishable from measured activity.
- The M1 parameter subset must not be presented as full API coverage. New API features are added only after documentation verification and implementation tests.
- The repository is public. Credentials and real participant/service data must never appear in its code, fixtures, issues, pull requests, or logs.

The [architecture](docs/architecture.md) records implementation boundaries. Changes to these product commitments should update this manifest and the relevant issue together.
