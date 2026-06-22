# TinkerQuarry Auditor Report

Date: 2026-06-21

Scope reviewed:

- PRD: `C:\Users\Scott\Desktop\CODE\prd/TinkerQuarry-PRD-v0.3.md`
- Local repo: `C:\Users\Scott\Desktop\CODE\tinkerquarry`
- Sibling implementation repo referenced by TinkerQuarry docs: `C:\Users\Scott\Desktop\CODE\KimCadClaude`
- Separately supplied UI design spec: `C:\Users\Scott\Downloads\TinkerQuarry design interface.zip`

## Executive Verdict

TinkerQuarry is not complete against the PRD or the supplied design interface.

The local `tinkerquarry` repo contains a high-fidelity standalone prototype, mock backend, connector glue, docs, and tests. The real product implementation still appears to live primarily in `KimCadClaude`. Several important backend/product capabilities exist there, but the core TinkerQuarry promise is not yet implemented end to end.

Most importantly:

- The supplied interface design was prototyped, not integrated into the actual production React app.
- The Visual Correction Loop is mocked/scripted, not implemented in the real design pipeline.
- The OpenSCAD/code-drawer experience from the design spec and PRD is missing from the real app.
- The right-side workflow from the design spec, "Customize" plus "Make it real", is not the production UI.
- About/Licenses, external-library admission, and some readiness semantics remain incomplete.

## Evidence Summary

Tests run in `C:\Users\Scott\Desktop\CODE\tinkerquarry`:

```text
python backend\tests\test_connector.py  -> 10/10 passed
python backend\tests\test_mock_api.py   -> 9/9 passed
```

These tests validate the mock API and connector seams. They do not prove PRD completion or design-spec implementation.

Git status observed:

```text
tinkerquarry: ## main
KimCadClaude: ## main...origin/main [ahead 6]
```

No edits were made during this audit.

## What Is Actually Done

The implementation is not empty. There is substantial useful work:

- `KimCadClaude` has a real local design pipeline: prompt, plan, generated CAD, render, validation, printability gate, orientation, slice/report/send-related flows.
- The real web backend includes session-token enforcement, health/status endpoints, model status, model pull, photo/sketch seed endpoints, saved-design import/export, slice/send/outcome endpoints, and printer-connection handling.
- The real React app has a workspace, chat/refine flow, viewport, inspector/right panel, settings panel, library/template modal, photo/sketch onramps, export/send panel, and print-outcome handling.
- The `tinkerquarry` repo has a polished static prototype that closely follows the supplied design interface.
- The mock API and connector tests pass.

That progress should be preserved. The issue is that it does not yet add up to "done" against the PRD/design spec.

## Critical Findings

### P0. The supplied design interface was not implemented into the real product

The design spec zip contains `Main Workspace.dc.html`, which defines a specific TinkerQuarry first-screen interface:

- Left assistant transcript and composer
- Center 3D preview
- View presets
- Persistent "show me the code" door
- Visual correction band
- Right-side "Customize" controls
- Right-side "Make it real" flow for orientation, slice, and print

The local `tinkerquarry/frontend/index.html` closely mirrors this design, but it is a standalone prototype. The real production app in `KimCadClaude/frontend/src/components/Workspace.tsx` remains a different React workspace with chat, viewport, and a tabbed inspector.

Evidence:

- Design spec: `Main Workspace.dc.html`, especially lines around visual correction, code drawer, customize, and make-it-real flow.
- Prototype mirror: `C:\Users\Scott\Desktop\CODE\tinkerquarry\frontend\index.html`
- Real app layout: `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\components\Workspace.tsx`
- Real app inspector: `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\components\RightPanel.tsx`

Auditor conclusion: the design was prototyped, not productized.

### P0. Visual Correction Loop is not implemented in the real pipeline

The PRD and supplied design spec make the Visual Correction Loop a signature capability. The interface spec shows rendered-angle inspection, round states, findings, correction, and final approval.

The real pipeline does not expose visual correction rounds, screenshot/vision critique findings, multi-view inspection state, VCP results, or a vision-model correction loop in the typed response. The real pipeline remains primarily:

```text
prompt -> design plan -> OpenSCAD/CAD -> render -> validate -> printability gate -> orient/slice/report
```

The `tinkerquarry` mock API fabricates `report.vcp`, and the prototype animates visual correction states. That is not the same as implementing the actual loop.

Evidence:

- `C:\Users\Scott\Desktop\CODE\KimCadClaude\src\kimcad\pipeline.py`
- `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\api.ts`
- `C:\Users\Scott\Desktop\CODE\tinkerquarry\backend\mock_api.py`
- `C:\Users\Scott\Desktop\CODE\tinkerquarry\frontend\index.html`
- `C:\Users\Scott\Desktop\CODE\tinkerquarry\docs\STATUS.md` states visual correction is not live.

Auditor conclusion: this is a blocker for claiming PRD/design completion.

### P0. The real app does not include the spec's OpenSCAD/code drawer

The supplied design includes a persistent "show me the code" affordance and a `bracket.scad` drawer. The PRD also calls for code visibility/editing in a collapsed or hidden-by-default way.

The standalone prototype includes this drawer. The real React app does not appear to include an equivalent OpenSCAD drawer/editor, Studio-style diagnostics surface, or edit-and-rerun workflow.

Evidence:

- Design spec: `Main Workspace.dc.html`, code drawer section.
- Prototype: `C:\Users\Scott\Desktop\CODE\tinkerquarry\frontend\index.html`
- Real app: `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\components\Workspace.tsx`

Auditor conclusion: the OpenSCAD Studio portion has not been absorbed into the actual product UI.

### P1. The production right panel does not match the design spec's "Customize / Make it real" flow

The design spec has a direct right-side workflow:

- Customize: parameters such as wall thickness, base width, screw size
- Make it real: orientation, slice, send-to-printer gating

The real app instead uses a tabbed inspector with Parameters, Quality, and Export. This may be a reasonable product direction, but it is not an implementation of the provided design spec.

Evidence:

- Design spec: `Main Workspace.dc.html`, Customize and Make It Real sections.
- Real app: `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\components\RightPanel.tsx`

Auditor conclusion: functional pieces exist, but the specified workflow was not implemented as designed.

### P1. "Local & private - vision" is not honestly shippable as a default complete state

The design spec prominently displays local/private operation and a vision-ready state. The PRD also leans on local-first behavior and vision support.

The backend has model-status and photo/sketch endpoints, but the repo status says the vision model is not pulled and the visual correction loop is not live. Therefore the UI should not claim full vision capability unless the local model is actually present and used.

Evidence:

- Design spec: title bar and composer local-vision indicators.
- `C:\Users\Scott\Desktop\CODE\tinkerquarry\docs\STATUS.md`
- `C:\Users\Scott\Desktop\CODE\KimCadClaude\src\kimcad\webapp.py`

Auditor conclusion: vision plumbing exists, but the product should distinguish "available", "missing model", "installing", and "actually used in visual correction".

### P1. About/Licenses is incomplete

The PRD requires an in-app About/Licenses surface with upstream source links and third-party attribution. The real Settings panel appears to show only basic app/version/open-source information. The TinkerQuarry README also still describes in-app About/Licenses as planned.

Evidence:

- `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\components\SettingsPanel.tsx`
- `C:\Users\Scott\Desktop\CODE\tinkerquarry\README.md`

Auditor conclusion: not complete against PRD licensing/attribution requirements.

### P1. External-library chooser/admission is incomplete

The PRD calls for part-family/library browsing and external library handling. There is a connector-side registry, but the code comments indicate that actually admitting those roots into the renderer is still a future slice.

Evidence:

- `C:\Users\Scott\Desktop\CODE\tinkerquarry\backend\connector.py`
- `C:\Users\Scott\Desktop\CODE\KimCadClaude\frontend\src\components\LibraryModal.tsx`

Auditor conclusion: part-family browsing exists, but external-library admission is not v1 complete.

### P1. Readiness wording is ahead of the PRD's proof bar

The PRD says nothing should be presented as ready unless the printability gate and successful slice have passed. The prototype/mock can present "Ready to print" before slicing. The real pipeline also has design/readiness completion before the slice/send stage.

This may be solvable by distinguishing:

- "Design passes geometry gate"
- "Ready to slice"
- "Sliced successfully"
- "Ready to send to printer"

Evidence:

- `C:\Users\Scott\Desktop\CODE\tinkerquarry\backend\mock_api.py`
- `C:\Users\Scott\Desktop\CODE\tinkerquarry\frontend\index.html`
- `C:\Users\Scott\Desktop\CODE\KimCadClaude\src\kimcad\pipeline.py`

Auditor conclusion: copy/state semantics should be tightened before calling the product complete.

## Design Spec Compliance Matrix

| Design-spec feature | Status | Notes |
| --- | --- | --- |
| TinkerQuarry branded first screen | Prototype only | Present in `tinkerquarry/frontend/index.html`; not the real React app. |
| Left assistant transcript/composer | Partial | Real app has chat/refine flow, but not exact spec layout and state rhythm. |
| Local/private/vision first-screen signal | Partial | Model status exists; vision loop not live. |
| Photo/sketch composer affordance | Partial | Real app has photo/sketch onramps; deeper local-vision correction integration missing. |
| Center 3D preview with view controls | Partial | Real app has viewport; spec's exact surface not implemented. |
| Persistent "show me the code" drawer | Missing in real app | Present in prototype/spec only. |
| Visual correction band with rounds/findings | Missing in real app | Mocked/scripted in prototype. |
| Customize controls | Partial | Parameters exist in real app, but not spec's right panel. |
| Make it real flow | Partial | Slice/send/outcome pieces exist; not the spec's integrated right-side flow. |
| Slice-to-G-code gating | Partial | Present in some form; readiness copy/gating needs alignment. |
| Send-to-printer confirmation | Partial/mostly present | Real send confirmation/outcome flow exists in `KimCadClaude`. |

## PRD Compliance Matrix

| PRD area | Status | Notes |
| --- | --- | --- |
| Local-first design/generation | Partial/mostly present | Real KimCad pipeline exists. |
| Printability gate | Present | Real gate/readiness work exists. |
| Slicing | Present/partial | API/UI support exists; proof claims need verification beyond mock tests. |
| Real printer send | Present/partial | Code exists with confirmation; physical printer send was documented as deferred. |
| Post-print outcome | Present/partial | API/UI support exists. |
| Visual Correction Loop | Missing | Core blocker. |
| Photo/sketch input | Partial | Endpoints/UI exist; vision model not fully operational locally. |
| Code editor / Studio absorption | Missing/partial | Prototype drawer exists; real product does not match PRD. |
| Part-family browser | Present/partial | Template/library modal exists. |
| External library admission | Missing/partial | Registry exists; renderer admission is not complete. |
| Saved designs import/export | Present/partial | Real backend/frontend support observed. |
| Settings / privacy / cloud opt-in | Present/partial | Settings exist. |
| About / licenses / upstream links | Missing/partial | Not complete. |

## Recommended Acceptance Criteria Before "Done"

The dev team should not mark TinkerQuarry complete until these are demonstrably true in the real app, not just the prototype:

1. The real app launches into the supplied TinkerQuarry design interface or a documented, approved equivalent.
2. The Visual Correction Loop runs on actual rendered views, records rounds/findings/actions, and surfaces them in the UI.
3. The real API response includes visual-correction state rather than mock-only `vcp`.
4. The code drawer/editor is available from the real workspace and can show the generated OpenSCAD/CAD source.
5. The right-side workflow supports customize, orientation, slice, and print in the intended user journey.
6. "Ready to print" is shown only after the product's defined readiness proof has passed, including slice if the PRD requires slice.
7. Vision status is truthful: missing model, installing model, available model, and used-by-loop states are distinct.
8. About/Licenses includes required upstream links and third-party attributions.
9. External library import/admission is either implemented end to end or explicitly removed/deferred from v1 scope.
10. Automated tests cover the real React app and real pipeline behavior, not only mocks/connectors.

## Questions For The Dev Team

1. Which repo is now considered the canonical TinkerQuarry product repo: `tinkerquarry`, `KimCadClaude`, or both?
2. Is the supplied design interface meant to be implemented exactly, or was the tabbed KimCad inspector accepted as an intentional deviation?
3. Where is the real Visual Correction Loop implemented, if not in `pipeline.py`?
4. What endpoint/response schema exposes visual-correction rounds, images/views checked, issues found, and corrections applied?
5. Is the OpenSCAD/code drawer intentionally deferred?
6. Has a real physical printer send been completed on this local machine, or is it still deferred?
7. What is the intended definition of "Ready to print": gate pass only, or gate plus successful slice?

## Final Auditor Position

The current work should be described as:

> Partial implementation with a high-fidelity TinkerQuarry prototype and substantial KimCad backend/product plumbing.

It should not be described as:

> Complete implementation of the PRD and supplied interface design.

