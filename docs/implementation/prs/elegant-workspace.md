# Simplify setup and refine the Sona workspace

Sona now accepts an OpenAI project key in Settings. The form sends the key to the local server and clears its input. The server keeps the key for the current Sona run. The UI does not write the key to browser storage. A saved key does not confirm provider access.

The workspace keeps its three columns and full research controls. Neutral selections, soft surfaces, clear type, and a compact session dock make the interface calmer. Empty evidence panels show one short message. Notes and ratings appear after a test starts. API details remain available through disclosures.

The Data policy settings and Voice processing notice are removed. A quick test starts without that notice. Study participants still need recorded agreement. The participant view remains optional. The local data and action protections are unchanged.

## Validation

- Type check and full production build passed.
- All seven existing browser workflows passed on an isolated local server.
- The new quick-start workflow passed. It checks the submitted request and absence of the old notice and browser acceptance flag.
- The existing automated accessibility check found no violations in its tested WCAG tags. Laptop and narrow layouts remain usable.
- After CSS consolidation, the agent workflow and accessibility/layout workflow passed again.
- The GUI key workflow is ready for the integrated server. It checks save, reload, removal, immediate readiness, and absence of the key from responses and browser storage. It also checks busy-operation guidance, invalid key format, and successful key changes when the workspace refresh fails. The busy and refresh failures use explicit transport fixtures. Key storage and invalid-format checks use the real local server routes. This worktree does not contain the new server routes.

Browser tests use synthetic local data. They do not call a paid model or prove live voice or external-tool behavior. The supervisor must check the combined feature and its final screenshots before publication.

The supervisor requested two corrections. Settings now maps only known error codes to local guidance. It keeps a successful key change when the later workspace refresh fails. Empty evidence uses direct copy, and the voice area does not repeat its workspace context. Type check and production build passed after these changes. The supervisor will run the integrated browser workflow.
