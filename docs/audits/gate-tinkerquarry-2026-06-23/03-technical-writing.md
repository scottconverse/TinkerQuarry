# GauntletGate Full - Technical Writer Deep Dive

Date: 2026-06-23  
Repo: `C:\Users\Scott\Desktop\CODE\tinkerquarry`  
Role: Technical Writer  
Scope: Documentation accuracy, completeness, user-facing honesty, install/evaluate instructions, and claim drift. Product code was not modified.

## Severity Counts

| Severity | Count |
|---|---:|
| Blocker | 0 |
| Critical | 0 |
| Major | 4 |
| Minor | 3 |
| Nit | 0 |

## Findings

### TW-001 - Stale handoff is still linked as current truth

Severity: Major  
Category: Claim drift / source-of-truth hygiene

Evidence:
- `docs\STATUS.md:103-108` lists `HANDOFF-TO-CODEX.md` under "Related Documents" from the current source of truth.
- `docs\EVALUATE.md:110-115` also points evaluators to `HANDOFF-TO-CODEX.md`.
- `README.md:38-43` tells readers to read `docs/HANDOFF-TO-CODEX.md` for current detailed truth.
- But `docs\HANDOFF-TO-CODEX.md:13-15` says the frontend is "manually-checked-only" and the Visual Correction Loop is "0 lines."
- `docs\HANDOFF-TO-CODEX.md:44-54` lists VCL, send/outcome UI, manual orient, external-library admission, and iteration log as missing.
- `docs\HANDOFF-TO-CODEX.md:56-63` says there is no Playwright/browser test.

Observed vs. expected:
- Observed: current docs link a stale 2026-06-22 handoff as if it remains a truth source, while current `STATUS.md` says VCL is partial/real, send/outcome happy path is verified, manual orient is present, external libraries are implemented, and browser Playwright coverage exists.
- Expected: old handoff is either archived with a clear "historical, superseded" banner or updated to match current product state.

Why it matters:
New devs and auditors following the docs will get contradictory instructions and may re-open already-fixed gaps or distrust the status matrix. This directly undermines the "single source of truth" posture.

Blast radius:
Major for dev-team handoff, external audit, and release readiness review. It does not break runtime behavior, but it can misdirect implementation and QA work.

Concrete fix path:
1. Add a top banner to `docs/HANDOFF-TO-CODEX.md`: "Historical handoff from 2026-06-22; superseded by `docs/STATUS.md` and `docs/audits/gate-tinkerquarry-2026-06-23/*`."
2. Either remove it from the "current truth" lists in `README.md`, `docs/STATUS.md`, and `docs/EVALUATE.md`, or relabel it under "Historical Context."
3. If keeping it current, revise Sections 1, 2, 4, 5, 7, and 10 to reflect the implemented VCL v1, browser e2e, external library admission, send/outcome UI, native packaging proof, and current `tq-threads` pin.

### TW-002 - Public-facing announcement claims release-gate clearance that the current walkthrough does not prove

Severity: Major  
Category: User-facing honesty / release claim

Evidence:
- `docs\discussions\01-announcement.md:36-38` says the project passes its adversarial release gate, "CLEAR TO ADVANCE: 0 blockers, new users reach the core feature."
- `docs\audits\gate-tinkerquarry-2026-06-23\walkthrough-summary.md:17` says verified clean-state evidence is partial and full first-run isolation matrix is not fully proven.
- `docs\STATUS.md:18-19` says this is not final v1 and gaps remain in Explain/diff, mobile/error-path coverage, hardware connector proof, and polish.
- `docs\STATUS.md:35-36` says the UI matrix is incomplete.

Observed vs. expected:
- Observed: community-facing announcement uses final gate language even though the current gate evidence explicitly says first-run/dependency coverage is partial.
- Expected: announcement states the current verified beta happy path and avoids "CLEAR TO ADVANCE" until the combined GauntletGate report legitimately grants it.

Why it matters:
This is the most visible overclaim in the docs. It can mislead testers into thinking first-run and release-gate evidence is already closed when the current walkthrough says it is not.

Blast radius:
Major for beta messaging, issue triage, and trust. Users who hit first-run setup or dependency gaps after reading "new users reach the core feature" will see the docs as unreliable.

Concrete fix path:
Replace `docs\discussions\01-announcement.md:36-38` with language aligned to `STATUS.md`, e.g. "The beta happy path is verified end-to-end on the tested Windows environment; broader first-run isolation, hardware connector proof, mobile/accessibility/error-path coverage, and final gate clearance are still in progress."

### TW-003 - README's "Honest State" is internally stale on external libraries and iteration history

Severity: Major  
Category: Claim drift / onboarding docs

Evidence:
- `README.md:28-36` lists "What is still not done."
- `README.md:32-33` says bundled libraries are vendored "with caveats" and external-library admission is not wired to the engine sandbox.
- `README.md:34` says persistent per-iteration history remains incomplete.
- `docs\STATUS.md:52-53` says bundled SCAD libraries and external-library admission are implemented.
- `docs\STATUS.md:62` says persistent session iteration transcript exists and snapshot entries can restore prior candidates.
- `docs\EVALUATE.md:57-59` gives evaluator steps for external-library admission as a working flow.

Observed vs. expected:
- Observed: README is the repo's front door but contradicts the current status matrix on features that were recently implemented.
- Expected: README accurately summarizes beta state, or intentionally punts all detailed state to `STATUS.md` without listing stale specifics.

Why it matters:
The README is what a new dev, tester, or GitHub visitor reads first. Stale "not wired" language can cause duplicate work and makes the product look less complete than it is.

Blast radius:
Major for external perception and developer ramp-up; the contradiction touches core recovery-plan features.

Concrete fix path:
Update `README.md:28-36` to match current status:
- VCL: "advisory local probe-mode v1; full before/after diff and metrology-grade critique incomplete."
- External libraries: "consent-to-sandbox admission implemented; user-provided libraries are not redistributed."
- Iteration history: "persistent session transcript and restore exist; server-side branching/version tree remains future."
- Keep mobile/accessibility/error-path limitations as-is.

### TW-004 - First-run/install docs still describe a complete wizard without matching proof in the current gate

Severity: Major  
Category: Install/evaluate instructions / first-run honesty

Evidence:
- `docs\MANUAL.md:47-70` says first run walks through a setup wizard, one-click AI setup, printer selection, direct printing, and readiness.
- `docs\MANUAL.md:59-63` says TinkerQuarry downloads and starts the local AI and the user does not install anything by hand.
- `docs\discussions\02-faq.md:23-26` says the first-run wizard sets up AI with one click.
- `docs\discussions\05-getting-started-help.md:10-13` tells users to reopen Settings or the wizard for model-download progress.
- `docs\audits\gate-tinkerquarry-2026-06-23\walkthrough-summary.md:17` states the installed smoke used real local app data and did not prove isolated first-run profile writes; dependency-absent model states are represented in code/tests, but the full first-run isolation matrix is not proven.

Observed vs. expected:
- Observed: user-facing docs state the first-run setup experience as a completed user guarantee, but the current gate evidence does not yet prove a clean first-run machine reaches the core feature.
- Expected: docs should distinguish "implemented first-run/model-pull surfaces" from "fully gate-proven first-run clean install."

Why it matters:
First-run is where new users either succeed or churn. Overpromising "you don't install anything by hand" without current isolated proof creates a support and credibility risk.

Blast radius:
Major for beta onboarding, support, and release-gate validity. It touches the exact first-run rule that GauntletGate treats as non-negotiable.

Concrete fix path:
1. In `docs\MANUAL.md`, keep the wizard description but add a current-state note directly under "Install & first run": "Verified on the provisioned Windows test environment; isolated clean-profile/dependency-absent first-run proof is pending."
2. Mirror that caveat in `docs\discussions\02-faq.md` and `docs\discussions\05-getting-started-help.md`.
3. Once first-run isolation proof is generated, replace the caveat with a link to the artifact path and command.

### TW-005 - EVALUATE is useful, but "about 2 minutes" underestimates the real proof path

Severity: Minor  
Category: Evaluation instructions

Evidence:
- `docs\EVALUATE.md:1` title says "Evaluate TinkerQuarry in about 2 minutes."
- `docs\EVALUATE.md:31-59` asks the evaluator to design, tune, choose printer/material, orient, slice, send, refine, inspect right rail, restore iteration, save/export/import/reopen/delete, undo, review VCL, fix visually, export many formats, and admit an external SCAD library.
- `docs\EVALUATE.md:92-108` lists automated proof commands including full Jest, Playwright, Tauri build, smoke, and full engine pytest.

Observed vs. expected:
- Observed: the title implies a lightweight two-minute inspection, but the actual walkthrough is a broad product audit plus long-running proof commands.
- Expected: split into "2-minute smoke" and "full evaluator pass" sections.

Why it matters:
This is not a product blocker, but it can frustrate evaluators and make the doc feel less honest than its content actually is.

Concrete fix path:
Rename the page or split it:
- "2-minute smoke": describe -> render -> slice -> mock send.
- "Full beta evaluation": current 15-step walkthrough plus automated commands.

### TW-006 - Model recommendations drift across docs

Severity: Minor  
Category: Technical accuracy / model guidance

Evidence:
- `docs\STATUS.md:51` says default VCL candidates include `qwen3-vl:8b`, `qwen2.5vl:7b`, and `minicpm-v:8b`, with a 90% beta probe bar.
- `docs\EVALUATE.md:66-69` says `qwen3-vl:8b` is the current best-quality local option from the audit.
- `docs\MANUAL.md:170-171` lists `qwen2.5:7b` for planning and `qwen2.5vl:7b` for vision.
- `docs\MANUAL.md:253-256` says vision uses `qwen2.5vl:7b` and "vision always runs locally."

Observed vs. expected:
- Observed: current status/evaluation docs reflect the latest VLM audit, while the manual still names an older single vision model.
- Expected: manual should either list the current candidate set or point to `STATUS.md`/the VLM audit for model selection.

Why it matters:
Model choice affects VCL quality and user expectations. Stale model guidance can send testers to the weaker or no-longer-preferred setup.

Concrete fix path:
Revise `docs\MANUAL.md:170-171` and `docs\MANUAL.md:253-256` to say the design model and VCL probe models are configurable; current beta VCL candidates are in `STATUS.md`. If the app can choose among detected models, describe that at a high level instead of naming one hard default.

### TW-007 - Proof-log locations are fragmented

Severity: Minor  
Category: Documentation organization

Evidence:
- `docs\STATUS.md:68-84` lists latest verification commands and results but no proof artifact paths.
- `docs\audits\gate-tinkerquarry-2026-06-23\walkthrough-summary.md:5-15` lists the current run evidence but does not point to logs, screenshots, traces, or build artifacts.
- `docs\HANDOFF-TO-CODEX.md:163-187` points to older `docs/handoff/proof/` logs and states some UI proofs were screenshots not saved.
- `docs\handoff\proof\` contains dated older proof logs, not the current 2026-06-23 gate artifacts.

Observed vs. expected:
- Observed: the docs tell the reader what passed, but not always where to inspect the exact current run artifacts.
- Expected: the current gate folder should contain or link to run logs for lint/type/Jest/web unit/engine/Playwright/Tauri/cargo/tq-threads and any first-run artifacts.

Why it matters:
For a gate, "passed" should be independently inspectable. This is especially important because prior work had manual-only verification drift.

Concrete fix path:
Save current proof logs under `docs/audits/gate-tinkerquarry-2026-06-23/proof/` and link them from `walkthrough-summary.md` and `STATUS.md`. At minimum include command, timestamp, exit code, and tail output.

## What's Working

- `docs\STATUS.md` is much stronger than earlier recovery docs: it explicitly says this is not final v1, scopes browser coverage to the happy path, and keeps VCL as "partial, real" rather than overclaiming.
- `docs\EVALUATE.md` is practically useful. It gives a real evaluator flow, calls out gaps, and includes commands for automated proof.
- The docs consistently preserve the canonical repo decision: `tinkerquarry` is product of record, while `KimCadClaude` remains separate.
- Licensing direction is mostly clear in `README.md` and `STATUS.md`: GPL-2.0-only product, GPLv2-compatible vendoring, and Dan Kirshner `threads.scad` excluded because of GPL-3.0-or-later compatibility.
- The current docs are candid about VCL limitations: advisory, not metrology-grade, no full before/after visual diff viewer.

## Technical Writer Summary

The documentation is no longer broadly deceptive; the main truth docs are trying to be honest and mostly succeed. The remaining problem is drift. `STATUS.md` and `EVALUATE.md` describe a much newer product than `HANDOFF-TO-CODEX.md`, `README.md`, `MANUAL.md`, and the discussion docs in several places. The most serious issue is user-facing release-gate language claiming CLEAR TO ADVANCE while the current walkthrough explicitly says first-run/dependency proof is partial. Before beta-facing release, clean up the stale handoff links, update README/manual/community docs to current state, and attach current proof logs to the gate folder.
