# Sona

Sona is a local research tool for OpenAI voice agents and real external tools.

**Release candidate — verification blocked.** Application files, tests, and a portable agent runtime are available. Real service and laptop results remain unverified.

Use Node **24.19.0** and pnpm **11.19.0**. From a source checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Open `http://127.0.0.1:4317` in desktop Chrome. The release archive includes a build, so it does not need another build before startup.

Open **Settings**, enter your OpenAI API key, then select **Save key**. Sona keeps the key in local server memory until Sona restarts.
Sona checks the key with OpenAI and shows the result. This check does not confirm voice access or billing credit.

Read the [setup guide](docs/setup/README.md) for private credential bindings, Google authorization, devices, data storage, and troubleshooting.

Sona includes:

- A researcher workspace with voice controls, transcripts, event records, and configuration evidence.
- Agent drafts, immutable revisions, comparisons, and portable configuration export.
- An optional Participant view with essential session and device controls. Researcher view is the default.
- MCP authorization and tool policies, plus a documented route through a compatible local Codex runtime.
- Spoken confirmation, duplicate prevention, and recovery records for external actions.
- Study conditions, consent, AB/BA order, notes, ratings, and JSON/CSV evidence export.
- A source-based API library with 354 cataloged operations and explicit verification states.
- An example agent runtime that uses the same validator and execution policy. It does not open the study database.

Raw audio is not saved. The initial local retention period is 30 days. ChatGPT subscriptions and Sona API billing are separate.

The [release assessment](docs/verification/readiness.md) separates local checks from blocked service, device, and person checks.
The [requirement evidence](docs/verification/requirement-evidence.md) links implementation and verification records.
The [interface review](design-qa.md) includes actual screens. The [GitHub record](docs/implementation/github-delivery.md) links the starting point and feature pull requests.

The product authority is [PRD 1.0](docs/prd/Sona-PRD.md), with the user's [interface update](docs/implementation/workspace-refinement.md). Its [PDF](docs/prd/Sona-PRD.pdf) and [HTML](docs/prd/Sona-PRD.html) include the original selected UI figures.
The [execution log](docs/implementation/execution-log.md) records implementation decisions.
The [editorial record](docs/prd/language-review.md) describes the PRD review against ASD-STE100 Issue 9.
