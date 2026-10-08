# Build prompt for GPT-6 Astra

Use this prompt in a GPT-6 Astra coding session with the Sona repository and the necessary tool access.

---

Build Sona as the production local v1 defined by this repository. Execute the entire build autonomously in this run. Do not stop for routine clarification, design selection, stage approval, or permission to continue.

Read these files before implementation:

1. All applicable `AGENTS.md` instructions and the current repository state.
2. `docs/prd/Sona-PRD.md` — product authority, version 1.0.
3. `docs/implementation/ASTRA-EXECUTION-PLAN.md` — execution order, defaults, acceptance gates, and delivery contract.
4. `docs/prd/research/API-coverage.md` and the source inventory/provenance files.
5. The three current UI figures in `docs/prd/images/`: `researcher-workspace-v1.0.png`, `participant-view-v1.0.png`, and `compare-results-v1.0.png`.

This is an implementation task, not another planning task. The plan and design are already selected. Build every required feature, repair failures, verify the result, and package it. Do not deliver only a scaffold, mock interface, voice demo, or partial API catalog.

Keep these product rules:

- Use OpenAI for AI processing and real external tools through verified connections.
- Use three overlapping roles: researcher, participant, and maintainer.
- Keep all researcher controls and evidence available when the researcher is the participant.
- Keep Researcher view as the default. Participant view is optional and off by default.
- Keep the active measured configuration fixed. Edits prepare the next-test draft.
- Keep participant answers spoken. Participant view exposes only essential session and device controls.
- Keep raw audio off by default. Apply consent and data policy to researcher participants too.
- Implement the full current public OpenAI API library, with source-backed parameters and honest coverage states.
- Share configuration validation and execution policy with the example agent runtime.
- Preserve existing work. Do not invent a program-duration limit or introduce unnecessary services.

Use the engineering defaults in the execution plan. Resolve routine choices yourself. Record decisions in `docs/implementation/execution-log.md`. Continue from that log after context changes. Do not confuse internal checkpoints with user approval gates.

Inspect existing credentials and official authentication routes without printing secrets. Never assume that this coding session's connector access transfers into Sona. Never bypass permissions, copy ChatGPT cookies, or infer authorization from silence.

When a credential, service permission, or real device is unavailable, complete all independent code, tests, packaging, and documentation. Record the blocked test and exact missing prerequisite. Do not ask the user to supply secrets in chat. Do not replace a blocked real test with a mock pass.

Use dedicated test resources and the execution plan's bounded test policy. Do not publish or deploy publicly. Do not modify production calendars, purchase services, or bypass platform approval controls.

Use the supplied ASD-STE100 Issue 9 for technical writing when available. Apply editorial judgment to meaning and syntax. Do not run the archived language checker or use an automated compliance score.

Before finishing, assess all release gates in the execution plan. Report one of: **Production-ready local v1**, **Release candidate — verification blocked**, or **Incomplete**. Use the first status only when the evidence supports it.

Deliver runnable application files, setup commands, tests, a portable runtime, API coverage, requirement evidence, and a local release archive. The final response must state what exists, how to start it, what passed, and any actual remaining limitations. Do not stop with an offer to continue work that is still authorized.
