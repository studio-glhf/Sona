# Sona interface review

Review date: 9 October 2026, Asia/Seoul. Application version: 1.1.0.

**Findings**

No actionable P0, P1, or P2 visual finding remains in the examined states.
The source design establishes the layout. The user's later request establishes the quieter style and removal of the two notice surfaces.

The implementation uses the existing three columns. It retains the API controls and four evidence tabs.
The empty Notes panel has one short message. The Settings form has one project-key field.

## Source and capture

The selected visual reference is [the researcher figure](docs/prd/images/researcher-workspace-v1.0.png).
The user's later screenshot shows the previous application on macOS Chrome.
This review also uses [a fresh baseline capture](docs/verification/workspace-baseline-v1.0.0.png) from the preserved 1.0.0 archive.

The current application capture is [workspace-refined-1440.png](docs/verification/workspace-refined-1440.png).
The source figure is 1487 × 1058 pixels and includes a window frame.
The baseline and current captures are 1440 × 1024 pixels. Their CSS viewport is 1440 × 1024 with device scale factor 1.

Both application captures show a new agent, default parameters, no API key, Researcher view, and an idle call.
The parameter panel starts at its top. The source concept shows an active example call.
Those state and frame differences prevent a precise pixel comparison with the concept.

The [full comparison](docs/verification/design-comparison-full.png) places the baseline and current captures together.
Each capture is displayed at half size. The [control comparison](docs/verification/design-comparison-controls.png) uses unscaled regions from both captures.
The [concept comparison](docs/verification/design-comparison-target.png) shows the reference and current application together at half size.

## Visual surfaces

| Surface | Examined result |
|---|---|
| Fonts and type | Clear heading, control-label, and helper-text hierarchy. The system font stack supports each operating system. Linux glyphs differ from macOS. No proprietary OpenAI font is claimed. |
| Spacing and layout | The sidebar uses quiet selections. The voice controls form a compact group. Soft input corners and consistent gaps reduce form density. The evidence area has no empty rating form. |
| Colors | Neutral dark surfaces, white active controls, and muted supporting text replace repeated blue accents. Blue remains in the existing voice image and keyboard focus. Semantic error colors remain available. |
| Image and icons | The existing raster voice image remains intact. It is sharp at its displayed size. Lucide icons retain a consistent stroke. No replacement image or decorative CSS drawing was introduced. |
| Copy | The application uses direct labels. The key form explains memory storage and separate API billing. Technical parameter details remain in disclosures. The old Data policy editor and Voice processing notice are absent. |

## Other states and access

The captures include [Settings](docs/verification/settings-refined-1440.png), [empty Notes](docs/verification/notes-empty-refined-1440.png), and [Participant view](docs/verification/participant-refined-1280.png).
The [1280-width workspace](docs/verification/workspace-refined-1280.png) keeps the session controls and parameter panel available.
Its navigation opens through the menu. The document has no horizontal overflow.

At 640 pixels, the [parameter drawer](docs/verification/controls-refined-640.png) opens above the workspace.
This is an intentional overlay. Its close control remains available. A narrower viewport does not establish mobile-device voice support.

The full browser suite passes nine workflows. It covers navigation, drafts, revisions, study setup, device-dialog access, and optional Participant view.
It also covers key entry, removal, safe errors, refresh failure, and a held draft save.
The quick-test request has no processing-notice acceptance flag.

The rendered screen review found no console errors. Automated Settings accessibility checks found no violations in the selected WCAG tags.
The original workspace accessibility check also passes. These results do not establish complete WCAG conformity.
Physical screen-reader, native zoom, microphone, speaker, and user-observation checks remain separate.

## Review history

The first integrated GUI workflow found stale access status after key removal and a failed workspace refresh.
The repair applies accepted key status immediately. A scoped refresh preserves pending drafts.
The isolated workflow and all nine combined workflows pass after the repair.

The first comparison used a historical baseline image with a different panel scroll position.
A fresh baseline capture replaced it before visual acceptance. The matched comparison shows the same parameter state.

## Implementation checklist

- The key form uses protected local server routes.
- The key does not enter browser storage or saved study records.
- Researcher view remains the default.
- Participant view exposes no transcript or visual agent answer.
- The live configuration stays fixed while draft controls remain available.
- The refined captures and browser result files are included in the release evidence.

**Follow-up polish**

A physical macOS review can examine the system-font rendering and native device selectors.
The compact drawer close control can receive further visual refinement after laptop use.
These are P3 improvements. They do not block the examined layout.

final result: passed

## Settings feedback review — 9 October 2026

Application version: `1.1.1`. The earlier review above applies to version `1.1.0`.

The selected dark layout remains unchanged. Both result areas stay beside the control that starts the check.
The key check uses a quiet status dot and short result text. Only verified access has a green dot.
Failure text does not expose provider or browser diagnostics. Retry stays available after a failed check.
The Devices dialog shows microphone progress and recovery guidance in an accessible live region.

Actual Chromium captures:

- [Verified key result, 1440 pixels](docs/verification/settings-key-verified-fixture-1440.png).
- [Verified key result, 1280 pixels](docs/verification/settings-key-verified-fixture-1280.png).
- [Rejected key result](docs/verification/settings-key-rejected-fixture-1440.png).
- [Microphone result](docs/verification/microphone-success-fixture-1440.png).

The main agent inspected these rendered screens. Spacing, text, status, and controls remain readable.
Automated accessibility checks pass for the key-result page and microphone dialog in the selected WCAG tags.
The captures use explicit response and media fixtures. They do not prove a live key or physical microphone result.
