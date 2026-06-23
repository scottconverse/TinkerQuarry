# GauntletGate Full Deep Dive - UI/UX Designer

**Product:** TinkerQuarry  
**Role:** UI/UX Designer  
**Date:** 2026-06-23  
**Mode:** Full lane role report, sequential/degraded if not independently run by subagent  
**Scope:** Visual hierarchy, interaction states, copy, accessibility, first-run/empty states, and design-spec journey gaps. Product code was not modified.

## Severity Counts

| Severity | Count |
|---|---:|
| Blocker | 0 |
| Critical | 0 |
| Major | 5 |
| Minor | 4 |
| Nit | 2 |

## Findings

### UX-01 - Major - Core design journey disappears on non-xl layouts

**Evidence:** The design-spec right rail exists only at `xl` width: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4282) sets `data-testid="make-it-real-panel"` with `className="hidden xl:flex..."`. The horizontal manufacturing rail is also hidden below `md`: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4207). The only committed browser path asserts the rail on the desktop project only: [apps/ui/e2e/manufacturing-flow.spec.ts](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/e2e/manufacturing-flow.spec.ts:47).

**Observed vs. expected:** On wide desktop, the app now exposes the requested Customize / Make it real flow. On tablet, narrow laptop, split-screen, and many first-run Windows layouts, that right-side journey is hidden rather than adapted into a drawer, bottom sheet, or primary workflow panel.

**Why it matters:** The supplied design interface made Customize -> Make it real the main product journey, not an optional desktop accessory. Hiding it collapses the differentiated workflow back into inherited Studio panels and scattered toolbar controls.

**Blast radius:** All users on narrower viewports, screen magnification, side-by-side evaluation, or smaller laptops. This also weakens accessibility because zoomed layouts can cross the same breakpoints.

**Concrete fix path:** Add a responsive Make it real drawer/bottom sheet that reuses the right rail content below `xl`; add a visible primary affordance in the header/body to open it; run Playwright at desktop, tablet, and mobile/narrow widths and assert Customize, VCL status, Slice, Send, and Iteration log remain reachable.

### UX-02 - Major - Rail Send action depends on a connector control outside the rail

**Evidence:** The right rail has `Send` but no connector selector: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4428). It disables on `!canSendCurrentSlice || !connectorName`: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4432). Connector selection is in a separate toolbar section hidden below `xl`: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4030).

**Observed vs. expected:** The rail looks like a complete Make it real journey but can present a disabled Send button whose prerequisite is elsewhere. The desktop happy-path test selects the top toolbar connector, not a rail-contained control: [apps/ui/e2e/manufacturing-flow.spec.ts](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/e2e/manufacturing-flow.spec.ts:86).

**Why it matters:** Users expect a workflow panel to contain its own prerequisites. A disabled Send with no local way to resolve it reads like the app is broken.

**Blast radius:** First-time users, narrow layouts, and anyone using the rail as the canonical manufacturing flow.

**Concrete fix path:** Move or duplicate connector selection into Make it real. When disabled, show the exact unmet prerequisite inline: choose connector, slice current design, or configure printer. Cover the rail-only flow in Playwright.

### UX-03 - Major - First-run/dependency-absent UX is not fully proven

**Evidence:** The walkthrough report states clean first-run evidence is partial and installed-app smoke used real local app data: [docs/audits/gate-tinkerquarry-2026-06-23/walkthrough-summary.md](C:/Users/Scott/Desktop/CODE/tinkerquarry/docs/audits/gate-tinkerquarry-2026-06-23/walkthrough-summary.md:15). Mobile first-run welcome is intentionally hidden: [apps/ui/src/hooks/useMobileLayout.ts](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/hooks/useMobileLayout.ts:21). The empty saved-design state says only "No saved designs yet": [apps/ui/src/components/WelcomeScreen.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/components/WelcomeScreen.tsx:561).

**Observed vs. expected:** There is a strong evaluated happy path, but no complete UX proof that a brand-new user with isolated app data and absent optional dependencies gets guided into the core feature with honest setup states.

**Why it matters:** TinkerQuarry has local engine, local/cloud model, printer, slicer, and library dependencies. The first-run experience is where a beta user decides whether the product is coherent or brittle.

**Blast radius:** Beta adoption, support load, and trust in the "local-first" premise.

**Concrete fix path:** Add an isolated first-run Playwright/native smoke using temp app data; verify absent model, absent cloud key, no saved designs, no prior `tq-printed-real`, and no connector selected. Improve empty copy into next actions: describe a part, import `.kimcad`, open folder, connect printer later.

### UX-04 - Major - Visual Correction Loop is honest but not yet inspectable enough

**Evidence:** The UI exposes text summaries and title-hover logs: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4175). The right rail shows a compact `visualLoopModeLabel`: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4302). Visual diff is a percentage summary only: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:992). `STATUS.md` also calls out no full before/after diff viewer: [docs/STATUS.md](C:/Users/Scott/Desktop/CODE/tinkerquarry/docs/STATUS.md:48).

**Observed vs. expected:** The app no longer falsely claims vision certainty, and that is good. But the user cannot inspect before/after views, see which probes agreed/disagreed, or review a visible round transcript without relying on compressed inline text.

**Why it matters:** VCL is the product's differentiator. If it changes a design, the user needs to understand why and decide whether to trust it.

**Blast radius:** All AI-correction flows, especially safety-sensitive prints and cases where vision disagrees with geometry.

**Concrete fix path:** Add a VCL details panel with captured front/right/top images, critic answers, confidence/agreement, proposed correction, before/after thumbnails, and explicit "kept/restored" outcome. Keep the compact label, but make it a doorway into evidence.

### UX-05 - Major - Explain/diff are still too shallow for the product promise

**Evidence:** The current Explain is emitted as a design-ready toast: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:1193). Visual diff is computed as a lightweight percentage summary: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:998). `STATUS.md` marks Full Explain and full visual/structural diff as partial: [docs/STATUS.md](C:/Users/Scott/Desktop/CODE/tinkerquarry/docs/STATUS.md:72).

**Observed vs. expected:** The app gives useful readiness feedback, but it does not yet provide a user-invoked explanation panel or meaningful structural diff/rollback experience.

**Why it matters:** The app asks non-expert users to trust generated CAD. Explain and diff are the bridge between "AI did something" and "I understand what changed."

**Blast radius:** Refinement, VCL corrections, undo/restore, and review before slicing.

**Concrete fix path:** Add a Design Review panel reachable from the rail and toolbar: intent summary, dimensions, constraints, gate results, VCL evidence, changed geometry/features, export/readiness state, and per-change restore when available.

### UX-06 - Minor - Iteration log is useful but not yet a full transcript

**Evidence:** The rail only renders the latest eight entries: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4452). Details are clamped to two lines: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4464). Entries can restore when SCAD and rid are present: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4469).

**Observed vs. expected:** It is now more than a stub, but it is still a compact recent activity list, not a reviewable transcript of "what was tried."

**Why it matters:** Users need an audit trail when AI/VCL/refine iterations change printable geometry.

**Concrete fix path:** Add an expandable full transcript view with filters, timestamps, prompt, model/VCL mode, gate score, slice result, and restore availability. Keep the rail compact.

### UX-07 - Minor - Outcome dialog can be dismissed accidentally by backdrop click

**Evidence:** The outcome modal backdrop records `skip` on any outer click: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4517). The dialog buttons include explicit Skip / Failed / Clean choices: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4555).

**Observed vs. expected:** Clicking outside the dialog is treated as a real "skip" outcome. For print feedback, accidental dismissal loses useful signal.

**Why it matters:** Post-print feedback is rare and valuable; accidental skip reduces learning/provenance quality.

**Concrete fix path:** Make backdrop close non-destructive or require explicit Skip. If backdrop close is retained, log it separately as dismissed, not skipped.

### UX-08 - Minor - Accessibility coverage is component-level, not full workspace traversal

**Evidence:** There are several `jest-axe` component tests, including Welcome, Settings, Export, FirstReal, ModelSelector, and panels. No committed Playwright accessibility/keyboard traversal exists for the full manufacturing workspace; `STATUS.md` marks full workspace keyboard/focus/contrast/SR pass unfinished: [docs/STATUS.md](C:/Users/Scott/Desktop/CODE/tinkerquarry/docs/STATUS.md:82).

**Observed vs. expected:** Individual surfaces have accessibility attention, but the full app path is not yet proven by keyboard from prompt -> build -> rail -> slice -> send -> outcome.

**Why it matters:** The product is dense CAD/manufacturing software. Keyboard focus, visible focus, screen-reader labels, and contrast are not optional at beta scale.

**Concrete fix path:** Add a Playwright keyboard-only path and an axe scan at key states: welcome, design-ready, first-real dialog, rail, export dialog, print outcome, settings libraries.

### UX-09 - Minor - Welcome empty state is functional but under-instructive

**Evidence:** The My Designs section has import and saved designs management, but the empty state is only "No saved designs yet": [apps/ui/src/components/WelcomeScreen.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/components/WelcomeScreen.tsx:561). The manual empty-project CTA uses "Start with empty project ->": [apps/ui/src/components/WelcomeScreen.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/components/WelcomeScreen.tsx:746).

**Observed vs. expected:** A returning-user surface exists, but empty-state guidance does not reinforce the primary product loop.

**Why it matters:** The first-run screen should reduce doubt. "No saved designs yet" is true but leaves the user to infer the best next step.

**Concrete fix path:** Add one line of task-oriented copy under My Designs: "Describe a part to create your first saved design, or import a `.kimcad` file." Ensure this appears only where it helps, not as marketing copy.

### UX-10 - Minor - Slice/readiness copy is improved but still split across rail, toast, and workflow strip

**Evidence:** Design-time "Ready to print" was softened to "Looks printable" and "Make it real to slice": [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:1186). The slice success toast owns "Ready to print": [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:1342). The workflow strip has its own status labels: [apps/ui/e2e/manufacturing-flow.spec.ts](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/e2e/manufacturing-flow.spec.ts:58).

**Observed vs. expected:** The wording is now truthful, but the same readiness story is spread across multiple surfaces.

**Why it matters:** Users need a single mental model: design passes checks, slice proves printability, send requires current sliced output.

**Concrete fix path:** Use one canonical readiness component shared by toolbar, rail, and workflow strip, with consistent labels: Design checked, Ready to slice, Sliced/Ready to print, Sent/Outcome recorded.

### UX-11 - Nit - Some glyph copy appears mojibake in extracted docs/output

**Evidence:** In command output, arrows and section symbols from docs/comments rendered as `â†’` and `Â§`, e.g. [docs/EVALUATE.md](C:/Users/Scott/Desktop/CODE/tinkerquarry/docs/EVALUATE.md:0) when read in the current shell.

**Observed vs. expected:** The files may be valid UTF-8, but Windows shell extraction showed mojibake. This is mostly a tooling/display issue, not product UI evidence.

**Why it matters:** Handoff docs and audit output should survive Windows PowerShell, GitHub, and packaged docs without visual corruption.

**Concrete fix path:** Normalize docs to UTF-8 and prefer ASCII arrows/section labels in audit/status docs where no typography is needed.

### UX-12 - Nit - Rail microcopy could be more actionable

**Evidence:** The rail shows "No engine design yet" and `VCL:` status, but disabled buttons do not explain prerequisites inline: [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4298), [apps/ui/src/App.tsx](C:/Users/Scott/Desktop/CODE/tinkerquarry/apps/ui/src/App.tsx:4313).

**Observed vs. expected:** The controls are present, but the rail does not always answer "what do I do next?"

**Why it matters:** Small copy changes reduce perceived brittleness in a technical tool.

**Concrete fix path:** Add short state-specific helper lines under disabled Slice/Send/Customize controls. Keep them terse.

## What's Working

- The delivered app now contains the key design-spec spine on desktop: Customize, VCL state, Make it real, orient, printer/material, Slice, Send, and Iteration log in one right-side rail.
- "Ready to print" is no longer claimed at design-gate time; it is earned after slicing.
- The first-real-print caution exists and is accessible enough to have a dedicated axe test.
- The happy-path browser test is valuable and product-real: it boots the app, builds, verifies the rail, slices, reaches Ready to print, sends through mock, and records outcome.
- My Designs now supports rename, duplicate, delete, export `.kimcad`, import `.kimcad`, and reopen, which gives the welcome surface a real returning-user workflow.
- The VCL status language is materially more honest than earlier claims. It distinguishes advisory/availability states and records provenance rather than pretending local vision is metrology-grade.
- Export UX covers the formats users expect for CAD/manufacturing workflows, including `.scad`, STEP when available, PNG preview, and portable `.kimcad`.

## UI/UX Gate Opinion

UI/UX should not block continued development, but it should block a "complete beta UX" claim. The product is past the earlier missing-front-end phase: the desktop happy path now feels like TinkerQuarry, not just inherited Studio. The remaining UI risk is that the successful path is too narrow: wide desktop, happy path, provisioned local engine, and compact evidence surfaces. The next UX push should make the same journey resilient on first run, narrow layouts, dependency-missing states, and review/explain moments where trust is earned.
