# OpenAI API coverage baseline

Research snapshot: **5 October 2026, Asia/Seoul**. This is a source inventory for the Sona PRD, not implemented or live-tested coverage.

The official specification contains **354 operations, 227 paths, and 31 normalized path families**. Sixteen operations have a deprecated flag. Family names come from the first path segment; the beta Responses path is grouped with Responses. These are inventory counts, not a claim that all entries remain officially offered or that the snapshot exhausts every transport-specific surface.

## Provenance and downloadable source

- [Official pinned OpenAPI source](https://raw.githubusercontent.com/openai/openai-openapi/13fa6e7ab9301b00c03af2a5d2f584e7a9b84391/openapi.json)
- Commit: `13fa6e7ab9301b00c03af2a5d2f584e7a9b84391`
- SHA-256 of the uncompressed source: `266531cc8bfd29c102dbdef9a3eab9b61663aa6993a7e7c18c505f0c32bd6b62`
- [Full source, gzip compressed](openai-openapi-2026-10-05.json.gz)
- [Operation inventory — JSON](openai-api-inventory-2026-10-05.json)
- [Operation inventory — CSV](openai-api-inventory-2026-10-05.csv)
- [Machine-readable provenance](provenance.json)

JSON entries retain parameter, request, response, and security definitions or references. Resolve `$ref` against the accompanying full source; the CSV is a navigation index, not a complete field schema. The source contains descriptions and defaults as published; Sona must not manufacture values when they are absent.

## Family counts

| Family | Operations | Current Sona status |
|---|---:|---|
| agents | 35 | Source inventoried; implementation and live access unverified |
| assistants | 5 | Source inventoried; implementation and live access unverified |
| audio | 9 | Source inventoried; implementation and live access unverified |
| batches | 4 | Source inventoried; implementation and live access unverified |
| chat | 6 | Source inventoried; implementation and live access unverified |
| chatkit | 6 | Source inventoried; implementation and live access unverified |
| completions | 1 | Source inventoried; implementation and live access unverified |
| containers | 9 | Source inventoried; implementation and live access unverified |
| content_provenance_checks | 1 | Source inventoried; implementation and live access unverified |
| conversations | 8 | Source inventoried; implementation and live access unverified |
| embeddings | 1 | Source inventoried; implementation and live access unverified |
| evals | 12 | Source inventoried; implementation and live access unverified |
| files | 5 | Source inventoried; implementation and live access unverified |
| fine_tuning | 13 | Source inventoried; implementation and live access unverified |
| images | 3 | Source inventoried; implementation and live access unverified |
| live | 7 | Source inventoried; implementation and live access unverified |
| models | 3 | Source inventoried; implementation and live access unverified |
| moderations | 1 | Source inventoried; implementation and live access unverified |
| organization | 111 | Source inventoried; implementation and live access unverified |
| projects | 13 | Source inventoried; implementation and live access unverified |
| realtime | 9 | Source inventoried; implementation and live access unverified |
| responses | 14 | Source inventoried; implementation and live access unverified |
| safety | 2 | Source inventoried; implementation and live access unverified |
| skills | 11 | Source inventoried; implementation and live access unverified |
| threads | 18 | Source inventoried; implementation and live access unverified |
| uploads | 4 | Source inventoried; implementation and live access unverified |
| vaults | 9 | Source inventoried; implementation and live access unverified |
| vector_stores | 16 | Source inventoried; implementation and live access unverified |
| videos | 10 | Source inventoried; implementation and live access unverified |
| webhook_endpoints | 7 | Source inventoried; implementation and live access unverified |
| webhook_event_types | 1 | Source inventoried; implementation and live access unverified |

## Release reconciliation

1. Compare the dated schema with current official reference pages, deprecation/retirement notices, model documentation, and SDK definitions. Documentation websites were blocked by this environment's network policy; accessible official GitHub sources supplied this snapshot. Lifecycle reconciliation is still incomplete.
2. Supplement HTTP operations with officially documented streaming and bidirectional events, Realtime transports, tool contracts, and model-specific restrictions.
3. Track each current operation and configurable field through cataloguing, validation/editing, execution, and live verification. Track restrictions and lifecycle separately. Account gating is not a successful test.
4. Test request acceptance versus echoed effective configuration accurately; many APIs do not echo every field. Preserve omissions, explicit values, errors, and observations separately.
5. Use dedicated test resources for mutations and paid jobs. Discovery must not automatically invoke them. Record credentials/entitlements that block verification without placing credentials in artifacts.
6. On future upgrades, review the source diff, retain previous capability revisions for existing configurations, and flag migrations. Do not mutate historical session snapshots.

The full coverage target in the PRD includes all current officially offered public APIs; this inventory is the auditable starting point, not a completion certificate.
