# OpenAI project key entry in Settings

Sona can use a project API key entered in Settings. The local server holds it until Sona restarts. Saving validates the format and does not call OpenAI. Status responses contain no key or masked key.

All voice, direct API, observation, and stream routes use the same credential source. Key changes are blocked while a test or API operation is active. Removal disables an optional legacy environment seed for the current run. Previous key values remain in memory for diagnostic redaction only.

Quick tests no longer need a voice processing notice. Study consent remains explicit. Raw audio remains off. Setup instructions use the GUI key form as the normal first-use route.

Validation: TypeScript passed. All 145 unit and integration tests passed in eight files. Tests cover GUI save/removal/restart, local browser access checks, no provider request on save, voice SDK authorization, direct and asynchronous API bindings, active-operation locks, retired-key redaction, configuration export, and database credential exclusion. Provider calls use fixtures; no live or paid OpenAI request occurred.
