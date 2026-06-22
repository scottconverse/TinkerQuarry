# GauntletGate Full Deep-Dive: UI/UX Designer

**Project:** TinkerQuarry  
**Commit:** 0b13cb2d8725a5453496bca37a277c0e30d8df55  
**Date:** 2026-06-22  
**Role:** UI/UX Designer  
**Lane:** Full, role deep-dive  
**Method:** Static code review plus existing audit artifacts. I did not modify product files.

## Role + Counts

Severity counts: **Blocker 0 / Critical 1 / Major 3 / Minor 2 / Nit 0**

Coverage note: I did not produce a fresh first-run runtime attestation in this role pass. Existing artifacts under `docs/audits/gate-tinkerquarry-2026-06-22-codex/artifacts/` were used as supporting evidence only. The first-run verdict should come from the Walkthrough/QA lane attestation.

## Findings

### UIUX-01 - Critical - Primary describe flow is not dependency-aware at the point of action

**Evidence:** `apps/ui/src/components/WelcomeScreen.tsx:137-139` hardcodes the local-first path as always available and only gates submission on prompt text/errors. `apps/ui/src/components/WelcomeScreen.tsx:220-232` renders the primary welcome composer with a `Build` CTA without health/model status gating. The engine-offline banner exists, but its repair copy is only "Make sure it's running, then try again" in `apps/ui/src/components/EngineStatusBanner.tsx:47-53`. The post-submit failure path is a toast in `apps/ui/src/App.tsx:729-737`, after the user has already attempted the primary action.

**Impact:** First-run and dependency-absent users can spend effort describing a part before learning the local engine/model cannot complete the core flow. This is a failure-prone primary feature with missing in-context dependency state and no guided in-product repair path.

**Fix:** Add an engine/model readiness check to the welcome composer and AI panel. If the engine or model is absent, show an inline blocking state beside the `Build` CTA with exact status, a retry action, and a guided setup/start action where available. Disable `Build` only when the dependency truly prevents work; otherwise show degraded capability plainly.

**Test:** Playwright first-run with engine stopped and with model unavailable. Assert the welcome composer shows an inline `role="alert"` status, `Build` is not a blind enabled action, and the recovery action is visible. Add a unit test for model-status copy and CTA state.

### UIUX-02 - Major - Mobile first-run hides onboarding and opens on a passive preview tab

**Evidence:** `apps/ui/src/hooks/useMobileLayout.ts:18-22` hides the welcome screen whenever the viewport is mobile. `apps/ui/src/stores/layoutStore.ts:35-69` adds mobile panels with `preview` first and `ai-chat` inactive. The preview empty state is only "No preview available" in `apps/ui/src/components/Preview.tsx:66-75`.

**Impact:** A mobile new user misses the describe-first entry point and lands on an empty preview, with the primary creation surface hidden behind an inactive `AI` tab. The core feature remains technically reachable, but the in-product path is weak and easy to miss.

**Fix:** Keep the welcome/describe screen on mobile, or make mobile layout AI-first with the composer active. If preview remains first, replace the empty state with a primary "Describe a part" action that opens the AI composer.

**Test:** Mobile viewport first-run test at 390x844. Assert the first visible screen contains a text prompt and `Build`, or an empty preview CTA that opens the composer in one action.

### UIUX-03 - Major - Empty preview state is passive and provides no recovery or next step

**Evidence:** `apps/ui/src/components/Preview.tsx:66-75` renders centered tertiary text only. Existing artifact `artifacts/iab-provisioned-first-paint.json` recorded `hasWelcome: false` and body text ending in "No preview available"; `artifacts/iab-provisioned-first-paint.png` shows a dense workspace with no visible creation CTA in the preview area.

**Impact:** Any user who bypasses welcome, closes back into the workspace, opens a blank project, or hits a restored layout without a preview gets a dead-feeling state. The app has actions elsewhere, but the dominant center of the screen gives no route to create, render sample code, open AI, or fix missing preview output.

**Fix:** Turn preview-empty into an actionable state: "Describe a part", "Render sample cube", "Open editor", and a short reason when render is suppressed. Keep it compact, but make the next best action visually primary.

**Test:** Render the app with `previewSrc=""` and `isRendering=false`; assert the empty panel has a primary action and that clicking it opens the expected composer/editor path.

### UIUX-04 - Major - Core theme tokens fail contrast for empty, inactive, and error text

**Evidence:** Theme tokens in `apps/ui/src/index.css:36-47` set `--bg-primary: #002b36`, `--bg-secondary: #073642`, `--text-primary: #839496`, and `--text-tertiary: #586e75`. Static contrast calculations: `text-tertiary` on `bg-primary` is 2.79:1, `text-tertiary` on `bg-secondary` is 2.42:1, `text-primary` on `bg-secondary` is 4.11:1, and `color-error #dc322f` on `bg-primary` is 3.25:1. `Preview.tsx:73-74` uses tertiary text for the empty preview.

**Impact:** Low-vision users struggle to read empty states, inactive tabs, helper text, and some errors. The captured preview-empty screenshot visually confirms the empty message is low-signal against the dark background.

**Fix:** Raise the contrast floor for normal text tokens to WCAG AA 4.5:1 minimum and reserve tertiary only for nonessential decoration at larger sizes. Adjust error/warning colors or backgrounds so inline error text meets contrast.

**Test:** Add token-level contrast tests for each semantic foreground/background pair used in controls, empty states, tabs, and alerts. Run axe on welcome, workspace-empty, error, and settings screens.

### UIUX-05 - Minor - Panel-type selector lacks accessible menu semantics

**Evidence:** `apps/ui/src/components/panels/PanelComponents.tsx:337-355` renders the tab icon trigger as a raw button with only `title="Change panel type"` and no `aria-label`, `aria-haspopup`, or `aria-expanded`. The dropdown in `PanelComponents.tsx:373-390` is a plain `div`; its menu items rely on click and hover styling.

**Impact:** Screen-reader users get a weak name/role/value story, and keyboard-only users do not get expected menu semantics, Escape behavior, or arrow-key navigation for a workspace control that changes panel identity.

**Fix:** Use the shared `IconButton` or add explicit `aria-label`, `aria-haspopup="menu"`, `aria-expanded`, `role="menu"`, `role="menuitem"`, Escape close, and roving/arrow keyboard support.

**Test:** React Testing Library keyboard test for opening, arrowing, selecting, and Escape-closing the panel-type menu; axe should report no menu/button naming violations.

### UIUX-06 - Minor - Render shortcut copy is platform-specific even though the command is cross-platform

**Evidence:** `apps/ui/src/App.tsx:2779-2787` labels the button `Render (⌘↵)`. `apps/ui/src/components/Editor.tsx:365-370` binds Monaco's `CtrlCmd+Enter`, which is Ctrl+Enter on Windows/Linux and Cmd+Enter on macOS.

**Impact:** Windows/Linux users see Mac-only shortcut copy in a primary toolbar action. This is small but persistent friction in an app whose first-run and packaging flow targets multiple desktop platforms.

**Fix:** Render platform-aware shortcut labels: `Ctrl+Enter` on Windows/Linux, `⌘↵` on macOS, and no shortcut label where the platform cannot be known.

**Test:** Unit test the shortcut-label helper for macOS, Windows, Linux, and web unknown; snapshot the toolbar label per platform capability.

## What's Working

- The welcome screen has a strong describe-first information architecture: a large prompt, examples, project-directory visibility, recent files, and saved designs are all in one place (`WelcomeScreen.tsx:207-499`).
- The app has explicit defensive UX for engine outages via a persistent `role="alert"` banner (`EngineStatusBanner.tsx:47-53`) and tests for appearance/recovery (`EngineStatusBanner.test.tsx`).
- Manufacturing actions are not blindly enabled: `Make it real` is disabled until an engine design exists and also respects blocked printer profiles (`App.tsx:2887-2917`).
- The first-real-print caution is a good trust-building checkpoint before the user commits to printable output (`App.tsx:2897-2905` and `FirstRealPrintDialog`).
- There is already meaningful UI test investment around welcome, settings accessibility, SVG empty states, engine banner behavior, and customizer controls. That gives the UX fixes above a good place to land.
