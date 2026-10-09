# Workspace update

Decision date: 9 October 2026, Asia/Seoul.

The user requested these changes after PRD 1.0 and the initial local build. These decisions replace the earlier GUI credential and notice requirements.

- Enter the OpenAI project key in **Settings**. Keep it in local server memory until restart. Do not save it in browser storage or study records.
- Remove the **Data policy** editor and the **Voice processing notice**. A quick test starts without a notice or an agreement claim.
- Keep the existing three-column layout. Use neutral navigation, softer controls, clear type, and quiet empty evidence panels.
- Keep all research controls and evidence available. Show technical explanations through their detail controls.
- Keep participant agreement for supervised study runs. Remove the editable policy form and long notices.
- Keep raw audio storage off. Keep the existing record deletion and automatic cleanup behavior.

## GitHub starting point

The user requested a committed and pushed starting point before these changes.

The annotated `v1.0.0` tag and `codex/sona-local-v1` branch both identify commit `4e1317471a3080cb6ba966885b6db4de9bed8a1b` on `studio-glhf/Sona`.
Both remote references were read back after the push. The baseline retains its blocked live verification gates.

GitHub protects `main`. It requires a pull request and two status checks. The direct baseline push was rejected; no protection was changed.

Subagents implement separate credential and interface branches. The main agent reviews their code and combined tests before accepting the work.
A local supervisor acceptance is separate from a GitHub review or merge.

## Verification

Local checks must cover key entry, removal, restart, request binding, active-operation guards, secret redaction, and the simplified start flow.
Browser checks must cover the original research workflows, keyboard use, automatic accessibility checks, and laptop layouts.

Synthetic credentials test application behavior. They do not prove real OpenAI access or voice quality.
Real voice, Calendar, account reuse, and physical-device gates retain their separate status.

## Settings feedback update

Application version: `1.1.1`.

**Check microphone permission** reports checking, success, or recovery guidance inside the Devices dialog.
It checks the selected microphone and releases the temporary stream. It does not start a voice session or upload audio.

**Save key** saves the credential, then checks it with OpenAI's authenticated model-list request.
Settings shows **API key verified**, **API key rejected**, or **Could not verify**.
An unchecked key has a separate status. Select **Check key** to repeat the check.
Permission and service failures do not establish an invalid key. Voice and billing access need separate checks.

The [official source record](KEY-VERIFICATION-SOURCES.md) defines the contract and its limits.
The key and verification result remain in server memory. Removing the key or restarting Sona resets the result.
