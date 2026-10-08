# Sona PRD: editorial record

Document: `Sona-PRD.md`, version 1.0. Date: 6 October 2026, Asia/Seoul.

## Reference and method

The reference is the user-supplied *ASD-STE100 Simplified Technical English*, Issue 9, dated 15 January 2025. The source file is `ASD-STE100_ISSUE9.pdf`.

Source SHA-256: `d1f4ea9e7cd6e46b47aa9057209f99e78c0e9cfc4e27a5b07895b05c1a166431`.

This revision uses an editorial examination of the specification. It does not use Python language checks, dictionary scoring, sentence scoring, or another automated compliance gate. The previous checker and its reports stay in the archive as historical material.

The writing review considers complete sentences and their purpose. It examines meaning, grammar, parts of speech, technical terms, procedure order, and the relation between instructions and interface behavior. Dictionary lookup serves as a reference, not an automatic substitution process.

Rendering tools examine file output, links, images, and page layout. Their results do not establish STE compliance. This record documents the editorial work. It is not an independent certification.

## Product decisions reflected in the text

The PRD defines three roles: researcher, participant, and maintainer. A person can have more than one role. Technical configuration and diagnostic functions belong to researchers.

Researcher view is the default. A researcher who is the participant keeps all research controls and available evidence. Participant view is optional. It gives essential controls during supervised sessions.

Role, participation, and session view have separate meanings. Account permissions do not change when the session view changes. A study records researcher participation and its planned view separately.

A measured condition stays fixed during a call. Researcher controls stay accessible through a next-test draft. The applied configuration stays available for inspection. This distinction prevents a display choice from changing the experiment.

The product requirements have no program-duration limit. Delivery stages use acceptance evidence, not a program deadline. Connection renewal applies to continued use.

## Contextual writing decisions

| Subject | Editorial decision | Issue 9 basis |
|---|---|---|
| Ordinary words | Examine the permitted meaning and part of speech. Use “do a test” and “do a check” where the dictionary limits the nouns. | Rules 1.1–1.4 and 9.2. Dictionary pages 2-1-C6–C7 and 2-1-T3. |
| AI agent | Treat the software meaning as a technical noun. Do not rely on the dictionary's material-related meaning of “agent.” | Rules 1.5–1.8. |
| Roles | Use researcher, participant, and maintainer consistently. Do not use a view name as a role name. | Rules 1.11, 6.2, and 9.4. |
| Research terms | Define condition, protocol deviation, researcher participation, and measurement terms in their study context. | Rule 1.5, category 7. |
| Software terms | Define drafts, snapshots, session views, device selection, and configuration evidence in the term register. | Rule 1.5, category 19. |
| Technical verbs | Limit save, import, export, validate, and related verbs to their specified computer processes. | Rules 1.12–1.13. |
| Descriptions | Describe purpose and behavior with complete statements. Keep instructions separate from explanatory paragraphs where their purposes differ. | Sections 4 and 6. |
| Procedures | Use direct instructions. Put necessary conditions first. Keep sequential actions in separate steps or sentences. | Rules 5.1–5.5. |
| Verb forms | Avoid perfect and progressive constructions in authored requirements. Use technical activity names only in their defined context. | Rules 3.1–3.7. |
| Noun groups | Replace long chains with phrases that show the relationship between the items. | Rules 2.1–2.2. |
| Punctuation | Use clear sentence boundaries, list introductions, and meaningful hyphens. Do not use semicolons in the PRD. | Section 8. |
| UI labels | Use the same label for the same control. New labels need editorial judgment. Quotation marks do not exempt them from the vocabulary rules. | Rules 1.11, 8.6, and 9.4. |
| Source text | Keep API identifiers, model names, source titles, and quoted session evidence unchanged where accuracy depends on them. | Rules 1.5 and 8.6. |

The editorial review checks that the writing preserves the intended behavior. For example, “all researcher controls” includes access to drafts and diagnostics. It does not mean an unrecorded change to a measured run.

The device instructions distinguish microphone selection from browser output selection. If browser output selection is unavailable, the interface shows the system-output route. The text does not promise a function on an untested browser.

## Figures and labels

The figures show three surfaces of one design: Researcher view, Participant view, and comparison. They replace the earlier alternative layouts.

The label Participant view names an optional display. Its off state leaves the researcher workspace open. The Researcher control on the participant surface opens a neutral handoff screen.

The researcher figure distinguishes the next-test draft from applied values. The participant figure contains no transcript or visual tool answer. Comparison values are examples, not findings or evidence of a preferred condition.

Example speech inside a transcript is source evidence. It is not an instruction written by the technical author. Model and API identifiers also keep their specified spelling.

## Document consistency

The revision keeps the existing 22 requirement identifiers. It adds UX-04 for researcher participation and UX-05 for view and device events. The source URLs stay available.

The current PRD no longer uses the old Focus view name, an automatic participant-view transition, or a developer role. It has one design baseline. Earlier versions stay in the archive.

The optional experiment uses the same view and participation rules. The portable agent configuration excludes researcher roles and display choices. Study records and exports include those experimental controls.

## Document production

To render the documents, use:

```sh
python docs/prd/scripts/render_documents.py
```

Dependencies: Python, Pandoc, Playwright, and Chromium at `/usr/bin/chromium`. This command renders HTML and PDF. It does not check language compliance.

`document-checks.json` records rendering checks. `merge-checks.json` records requirement identifiers and source links. These are document-production records, not language scores.
