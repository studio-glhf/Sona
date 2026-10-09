# API source record

Review date: 6 October 2026, UTC. Application version: `1.0.0-rc.1`.
Capability revision: `openai-2026-10-06-491c868adbdb`.

## Source identity

| Source | Saved evidence | Identity or result |
|---|---|---|
| [Official OpenAI schema](https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.json) | [Compressed source](../prd/research/2026-10-06/openai-source.json.gz), [provenance](../prd/research/2026-10-06/provenance.json) | SHA-256 `491c868adbdb24cf556048f996dc214181085721807bfe9ee28c60627e53d79e`; OpenAPI 3.1.0; source version 2.3.0. |
| Previous schema | [Previous source](../prd/research/openai-openapi-2026-10-05.json.gz), [source changes](../prd/research/2026-10-06/source-diff.json) | SHA-256 `266531cc8bfd29c102dbdef9a3eab9b61663aa6993a7e7c18c505f0c32bd6b62`. Preserved without replacement. |
| [Official Node SDK](https://github.com/openai/openai-node) | Pinned dependency and lockfile | Version 7.28.0. Realtime sideband, call creation, and webhook contracts use this SDK. |
| [Official voice transport guidance](https://raw.githubusercontent.com/openai/openai-agents-js/main/docs/src/content/docs/guides/voice-agents/transport.mdx) | [Saved page](../prd/research/2026-10-06/voice-transport.mdx), [transport provenance](../prd/research/2026-10-06/transport-provenance.json) | SHA-256 `76ed8f0e8c2035dac601bbaa720b9ff99aa3d10d8166b11769d8cfb970a04aea`. Browser audio only; server controls configuration and tools. |
| [Published Calendar manifest](https://raw.githubusercontent.com/openai/plugins/main/plugins/google-calendar/.mcp.json) | [Saved manifest](../prd/research/2026-10-06/google-calendar-mcp.json) | SHA-256 `7a670a2ad93f430d176698941ad136c1286d502f26079f8661a3fb44dcae0cb0`. Endpoint: `https://calendarmcp.googleapis.com/mcp/v1`. Credential values are placeholders. |
| [Codex app-server](https://developers.openai.com/codex/app-server) | Connection adapter, protocol tests, and [actual probe](../verification/connection-feasibility.json) | Available version: `codex-cli 0.159.0-alpha.3`. Its app-server stopped during initialization. Compatible released-runtime account reuse remains unverified. |
| [OpenAI prices](https://openai.com/api/pricing/) | Network result in this execution | CONNECT 403. No current price estimate was approved. No billable call occurred. |
| [OpenAI lifecycle information](https://developers.openai.com/api/docs/deprecations) | Source provenance and coverage states | CONNECT 403. Source deprecation flags are preserved. Independent lifecycle reconciliation remains unverified. |

The raw source URL uses a branch name. The saved SHA-256 identifies the exact retrieved bytes.
GitHub commit lookup was blocked. The record does not invent a source commit.

## Coverage

The retrieved schema contains 354 operations, 227 paths, and 31 families. It also contains 10 transport event unions and 26 webhook definitions.
The parameter report contains 19,615 descriptors. The inventory derives these numbers from the source. They are not completion targets.

All 354 request schemas compile. Each operation has a handler selection. No operation in this retrieved inventory has an unexplained omission.
The library handles JSON, form data, file upload, binary output, SSE, SDP, pagination, polling, and bidirectional streams.
It validates stream events and verifies signed webhooks. The reports keep catalog, schema, handler, lifecycle, and live states separate.

Live operation coverage is **zero**. Source coverage does not prove account access, current lifecycle status, or successful provider execution.
Other current official pages could not all be reconciled in this network environment. Do not claim a complete live provider certification.

Use `pnpm coverage:api` to reproduce [the operation report](../verification/api-coverage.json) and [the parameter report](../verification/api-parameters.json).

## Configuration rules

Agent configuration uses the source Realtime session schema. The validator also applies model and WebRTC restrictions from source descriptions.
The common controls expose selected native fields. The JSON editor exposes the complete supported session object.
The API library exposes separate endpoints and their full request objects. An endpoint control is not automatically a voice experiment control.

Response length and response language instructions are prompt guidance. They are not guaranteed native settings.
Input transcription has its own native language field. Its text is separate from the model's speech interpretation.
Requested, returned, confirmed, and observed values have separate records. A missing provider echo stays unconfirmed.

Sona fixes the measured snapshot for each session. Draft changes apply to the next run.
Provider tracing is disabled for voice experiments. Hosted tool execution is replaced with server function dispatch to enforce the shared action policy.

## Connection limits

The Calendar manifest is a connection definition. It does not provide a transferable Google grant or a usable OAuth client.
Sona uses its own supported sign-in flow. It does not copy cookies or extract a coding-session connector token.
The direct route still needs a real audience, scope, account, discovery, read, and approved-write result.

Sona can inspect a compatible local Codex runtime. A host-required visual approval remains a host requirement.
It cannot replace that requirement with spoken confirmation. Runtime presence or tool discovery does not prove account reuse.

## Writing source

Technical documentation uses the supplied ASD-STE100 Issue 9 as its writing reference.
The author reviewed meaning, syntax, and technical names. No archived language checker or automated compliance score ran.
The private standard is excluded from the release. This record does not claim independent STE certification.
