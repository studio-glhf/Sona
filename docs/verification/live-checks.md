# Live service and device verification

These procedures need Sona's own authorized connections. Fixtures, simulated audio, and tool discovery are not real voice or Calendar evidence.

## Prerequisite report

```sh
pnpm test:live
```

This command makes `docs/verification/live-results.json`. Exit code 2 means one or more prerequisites are absent. It is not a failed application test or a passed live gate.

To include the running local server, set `SONA_LIVE=1` in the local shell. Then run the same command. The default URL is `http://127.0.0.1:4317`.

Set `SONA_LIVE_CONNECTION_ID` to an existing authorized binding for read-only tool discovery. Discovery does not invoke a Calendar tool.

The harness does not start paid model requests or external writes. Use the procedures below for these checks. Store private traces outside the repository.

## Evidence record

For each result, record these items:

- Requirement IDs and test ID
- Application version and per-file release identity
- Capability and tool-schema revisions
- Date, operating system, Chrome version, and physical devices
- Account class and authorization route, without credential values
- Session, response, action, and provider request identifiers after redaction
- Expected result, observed result, and pass, fail, or blocked disposition
- Sanitized evidence path and exact missing prerequisite, if blocked

Keep microphone and speaker results separate from headless browser results. Keep a new Google grant separate from reuse of an existing ChatGPT grant.

## Cost admission

Before a billable test, record the current official price source and date. Calculate a conservative upper bound for all service use.

Keep the test within USD 10. Use one call at a time. Set short duration and output limits. Include transcription, retries, and tool charges.

Do not start an unknown-cost test. Do not create fine-tuning, batch, or paid media jobs to fill coverage cells. An admission estimate is not an invoice guarantee.

## Voice and fixed configuration: VS-01, VS-02, CF-02, UX-04

1. Use a Windows or macOS laptop with physical microphone and speakers.
2. Record the browser version and device names.
3. Add a neutral agent with a verified model and audio output.
4. Keep **Participant view** off.
5. Start an English quick test with the applicable processing notice.
6. Speak a short request and hear the complete answer.
7. Examine input and generated transcripts with their separate source labels.
8. Examine requested and returned settings.
9. Change a draft value during the call.
10. Confirm that the current snapshot does not change.
11. Interrupt spoken output.
12. Examine cancellation events separately from any tool result.
13. Mute the microphone and confirm that transmission stops.
14. End the session and confirm that capture stops.
15. Start a new test and examine the new applied configuration.
16. Repeat the procedure in Korean.

Record the actual heard result. Generated transcript text can include words that the participant did not hear.

## Devices and recovery: VS-02, UX-03, UX-05

1. Change the input while muted.
2. Confirm that the old track stops and mute remains active.
3. Change the input while unmuted.
4. Confirm that two microphones do not transmit together.
5. Disconnect the selected input device.
6. Confirm that capture stops with a repair message.
7. Change the output, if the browser permits selection.
8. If output selection is unavailable, confirm the **System output** instructions.
9. Deny microphone permission and examine recovery.
10. Block playback and examine recovery.
11. Disconnect the network during a call.
12. Reconnect as a linked segment with the same snapshot.
13. Confirm that a prior write does not run again.
14. Restart Sona and confirm that the microphone remains off.

Repeat these checks on each claimed laptop environment. Record gaps and protocol deviations.

## Calendar and spoken approval: CN-00, CN-01, CN-02, TL-01, TL-02

Use only a dedicated test calendar. Do not add attendees or invitations. Do not select a production calendar as a substitute.

1. Record the route, account, workspace, runtime version, and grant type.
2. Discover tools and save their schema hashes.
3. Select the required read and write tools.
4. Restrict each resource argument to the test calendar.
5. Read its availability through the voice agent.
6. Request one example appointment.
7. Hear the action, destination, time, and other material arguments.
8. After complete proposal playback, give clear spoken approval.
9. Confirm that exactly one event exists for that operation identifier.
10. Repeat with rejection and confirm that no event is created.
11. Interrupt the proposal and confirm that no approval exists.
12. Correct the proposed time and confirm that new approval is necessary.
13. Repeat approval and confirm that a second dispatch does not occur.
14. Cause a service timeout and examine the unknown-outcome record.
15. Reconcile the event before any further write.
16. Restart after dispatch and confirm that the action does not replay.
17. Revoke access and examine sign-in recovery.
18. Select another account and confirm account separation.
19. Repeat affirmation, rejection, correction, overlap, and ambiguity in Korean.

Enable input transcription for write confirmation. Select `ko` for the Korean confirmation protocol and `en` for the English protocol.
Automatic language detection does not select the confirmation protocol. Other language settings use the English protocol in this version.
Keep turn detection on. Manual turns do not provide the required speech-start evidence for write approval.

Record host-required visual approval when applicable. Do not call that result voice-only approval. Do not bypass the host's permission step.

For a ChatGPT reuse claim, complete the read and approved write without a new Google grant. Source code, runtime presence, and discovery are insufficient.

Delete only test events made by this verification. Record the cleanup result separately from the action result.

## Complete study and portable agent: EX-01, EV-01, EV-02, DH-01, PT-01

1. Save a named configuration revision.
2. Add a study with a question, task, measures, and consent policy.
3. Duplicate the condition and change one verified parameter.
4. Keep the other settings, devices, tools, language, and view fixed.
5. Set the AB/BA order and record the researcher-participant fact.
6. Get applicable consent before capture.
7. Complete both conditions, with ratings and coded outcomes.
8. Include one rejected write and one service failure.
9. Use Participant view in a separate planned condition.
10. Examine participant, session, turn, and missing-data counts separately.
11. Export the selected JSON and CSV records.
12. Compare their values with the displayed evidence.
13. Export `sona-agent.json`.
14. Use it in the example runtime with a different authorized binding.
15. Operate that runtime without Sona's study database.
16. Confirm that its action policy and validation are unchanged.
17. Delete the test study and examine local record deletion.

This is a functional experiment. It does not establish an optimal configuration or a statistically meaningful difference.

## Researcher usability and teammate setup: DX-01, UX-01, UX-02, UX-03, UX-04

An independent teammate must install the archive and use their own credentials. Automated installation is separate evidence.

Ask a representative researcher to repeat a quick test, duplicate a condition, start a study, repair a failure, and export evidence.

Record activations, elapsed task time, mistakes, backtracking, and assistance. Compare the observations with PRD section 2.6. Do not invent an improvement percentage.

Do keyboard, focus, screen-reader, contrast, reduced-motion, 200% zoom, and reflow checks. An automated accessibility scan covers only part of this scope.
