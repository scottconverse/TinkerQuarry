# Changelog

All notable user-facing changes to TinkerQuarry are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses separate version numbers for the product, engine, share web app, and shared helper package.

## [1.5.1] - unreleased

A correctness and honesty release. v1.5.0 was published, then failed a full multi-role review
and was moved back to pre-release with v1.4.0 restored as the current release. This version
exists to fix what that review found. **It is not finished — see "Known open" below.**

### Fixed

- **The app showed error codes instead of English.** When the engine replied without a report,
  the UI rendered the literal text `model_unavailable` or `clarification_needed` instead of the
  sentence the engine had actually sent — and the engine's clarifying question was read by no
  component at all. Since an ambiguous prompt is an everyday outcome, this was the normal
  failure of the product's core feature. Every browser test had missed it for a full release
  because they all ran the engine in demo mode, which only ever returns "completed"; the fix
  includes the harness that now drives all six non-completed states through a real browser.
- **Local model servers other than Ollama were completely broken.** Every loopback backend was
  sent to an Ollama-only endpoint, so LM Studio — documented as supported — failed every
  request, spent about 150 seconds retrying, and then reported that your AI was not running
  while it was running fine.
- **The offline banner made the toolbar nearly unclickable.** While shown, it covered roughly
  70% of the click area of every control along the top, including Settings.
- **Dialogs did not hold keyboard focus.** Tab walked out of an open dialog into the page behind
  it, so keyboard and screen-reader users could type into a hidden editor believing they were
  still in the dialog. All five dialogs now share one implementation.
- **Three API endpoints dropped the connection** with no reply at all when sent a wrong-typed
  field — indistinguishable, to a caller, from the server being down.
- `kimcad design ""` could reach a real model and invent a design with a success exit code.
- Running `kimcad web` on its own served a user interface eight pull requests out of date. It now
  serves a short page explaining where the real interface is.
- Documentation corrections: the verification table described a different version, the manual
  reported test counts from an older run, two roadmaps still listed installer signing as future
  work after it shipped, the formatter rebuild recipe pointed at a grammar that was replaced,
  and the license file named the wrong default models.

### Changed

- The full release proof now runs automatically on a schedule and on every version tag, and
  installer signing refuses to proceed unless that proof succeeded at the exact commit being
  signed. Previously it had never run once — it was a script someone had to remember.

### Known open

- **External agent (MCP) access has real limits, though it now works.** The listener stays off
  until you enable it, checks the browser origin, requires a per-boot token, and confines
  exports to the bound workspace. Two limits remain: binding a workspace is not confirmed with
  you, so the token is what actually protects your files; and the path check is textual, so a
  shortcut already inside the workspace can still lead a write outward. Treat the token like a
  password and leave the server off when you are not using it.
- Some engine-generated designs still cannot be inspected after they fail the printability
  check — the report exists but is not shown. Under repair.

## [1.5.0] - 2026-07-16

Product v1.5.0 ships with KimCad engine 0.9.4 (unchanged from v1.4.0). This is the first release
with a digitally signed Windows installer.

### Added

- The Windows installer is now Authenticode-signed via Azure Trusted Signing. SmartScreen may
  still show a warning while the certificate builds reputation, the same honest caveat this
  project has always used for the beta installer — but the signature itself is present and
  verifiable (`signtool verify /pa /v`). See `CODE_SIGNING_POLICY.md`.

### Changed

- Default local chat/planner model: `qwen2.5:7b` -> **Qwen3.5-9B** (`qwen3.5:9b`), per a
  published-record research verdict (2026-07-15) — NOT the v1.5-6 bake-off's own pick, Mellum2.
  The bake-off itself measured Mellum2 winning every harness axis (10/10 completed vs 9/10,
  graded 6/10 vs 3/10, 39.9s vs 61.2s mean), but an independent review then proved that grader
  feature-blind (a plan with 8 holes where 4 were asked, and 60mm legs declared inside a 40mm
  bounding box, both still scored "completed"); a fidelity re-grade tied Mellum2 to the
  incumbent, and JetBrains' own technical report corroborated the miss (BS-Bench false-premise
  detection 14–24 vs Qwen3.5's 56–70). Deep research across the published record then ranked
  Qwen3.5-9B first for this task profile (its own published numbers: IFEval 83.9, BFCL v3 70.5;
  the closest structured-output proxy is peer-reviewed StructEval, where the smaller Qwen3-4B
  already scored 90.96 vs the incumbent qwen2.5-7B's 84.40 — no direct StructEval measurement
  of the 9B exists) and the owner chose to switch on that record. `qwen2.5:7b`
  remains selectable (`local_qwen2_5`) as the fallback for boxes too small for Qwen3.5-9B's RAM
  footprint (~7–8 GB working set — smaller than Mellum2's ~9–10 GB). Full history:
  `packages/engine/docs/benchmarks/stage-v156-model-bakeoff.md`.
- Planning latency roughly halved on local models: the native schema-constrained plan call (and,
  after a follow-up fix, every local codegen call) now sends `think:false`, since qwen3.5 thinks
  by default and an occasional thinking loop could eat the whole token budget before the actual
  answer started. Measured on qwen3.5:9b: 60-104s with thinking disabled vs 150-226s with it on.
  `qwen2.5:7b` and other non-thinking local models accept the flag as a no-op.
- The template registry's synonym coverage was expanded to match the default model's measured
  wording for the landing page's example chips (project box, cable clip, trinket dish), based on
  sampling the real provider path rather than guessing at synonyms one gate failure at a time.
- The OpenSCAD formatter's tree-sitter grammar migrated from the unmaintained
  `bollian/tree-sitter-openscad@0.5.1` (last published Feb 2024) to the OpenSCAD org's official
  `@openscad/tree-sitter-openscad@0.6.1` (MIT, license-verified).
- The release end-to-end suite now runs against the built web assets (`vite build && vite
  preview`) instead of the Vite dev server, so the release gate exercises what actually ships.

### Fixed

- The design pipeline retries once on an unparseable plan sample before failing closed — a rare
  model sampling event rather than a broken model or a missing schema constraint. Benchmark and
  bake-off measurement paths are pinned to stay single-shot so historical model numbers remain
  comparable.
- The engine supervisor now allows up to 120 seconds for the local engine to report healthy
  (previously a hard 30-second kill), since a cold engine start under real post-install
  conditions (antivirus scanning freshly staged files, cold Python import) can legitimately take
  longer than 30 seconds. If the engine process dies during startup, the supervisor now fails
  fast and reports the engine's own log tail instead of a generic timeout message.
- The fallback chain now also catches the local (native Ollama) transport's error types
  (`URLError`/`HTTPError`, including a 404 for a missing model, plus socket `ConnectionError` and
  `TimeoutError`), so a down local backend correctly hands off to a configured alternate model.
  Previously only the cloud `/v1` client's error types were caught, so a down local Ollama never
  failed over.

### Internal

- `apps/ui/src/App.tsx` was decomposed from roughly 5,358 lines to roughly 2,760 lines across
  five extraction phases, each pulling a cluster of related state and handlers into its own hook
  (global shortcuts/error reporting; file-tree and tab CRUD; persistence/save plus the
  native-menu event bridge; engine lifecycle; project-directory onboarding and open-file/folder).

## [1.4.0] - 2026-07-09

Product v1.4.0 ships with KimCad engine 0.9.4. This is the first release whose binaries contain no
telemetry code, matching the README's "no telemetry" claim.

### Added

- Intent panel showing parsed design plan, assumptions, dimensions, and feature list.
- Properties panel with volume, material estimate, mass, center of mass, surface area, bed contact,
  and bounding box.
- Labeled multi-view visual inspection cards for correction and evidence review.
- Plain-English agent toolbox and provenance disclosure.
- Conservative STL/3MF/OBJ reverse import for known trusted part families.
- SmartScreen guidance for the unsigned beta installer in the README, User Manual, and landing page.

(The five product features above — everything except the SmartScreen guidance — were previously
listed under 1.3.1 in error: they landed on `main` after the v1.3.1 tag and ship for the first time
in v1.4.0.)

### Removed

- All product telemetry. The PostHog analytics and Sentry crash-reporting integrations are deleted
  outright, including the privacy settings panel that gated them. The v1.3.1 binaries still
  contained these settings-gated code paths.

### Changed

- KimCad engine version is 0.9.4 (reverse import, webapp intent/properties/evidence endpoints, and
  validation additions since 0.9.3).
- Native packaging targets NSIS explicitly and the release script invokes the Tauri build from the
  app workspace.
- Installer staging strips Python bytecode/cache directories from the bundled engine payload.
- Tauri runtime smoke uses an isolated temp profile by default.
- Rust dependency set was refreshed to clear the release audit; the audit explicitly ignores only
  `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195`, the upstream-unfixed `plist -> quick-xml` advisories,
  while continuing to fail on other vulnerabilities.
- Engine requires Python `>=3.13,<3.14`; 3.14 is excluded until the renderer/CadQuery path is
  validated there.
- The installed-NSIS smoke derives the installer filename from `tauri.conf.json` instead of a
  hardcoded version string.
- The code signing policy documents the honest current state: release artifacts are not yet signed;
  SignPath Foundation onboarding is in progress.

### Fixed

- Engine test collection no longer aborts on machines without the bundled OrcaSlicer (a bare
  `skipif` raised `UnknownConfigKey` at import time, failing CI on every push since 2026-06-24).
- The CI lanes now pass on tool-less GitHub runners: twelve tool-tree-dependent engine tests are
  presence-guarded, the printer-catalog proof-of-record is compared by content hash instead of
  file mtime, and the frontend job installs a node-gyp that can discover Visual Studio 2026.

### Documentation

- Rewrote the public README as the main landing document.
- Rewrote the full user manual with three sections: Non-Technical User, Technical User, and
  Architecture.
- Rewrote the architecture reference with system, sequence, state, reverse-import, STEP/CadQuery, and
  trust-boundary diagrams.
- Refreshed the GitHub Pages landing page and GitHub Discussions seed documents.
- Added explicit version-surface documentation for the product, engine, share web app, and shared
  helper package.

## [1.3.1] - 2026-06-24

### Added

- Public TinkerQuarry v1.3.1 release with Windows installer assets, manifest, and SHA256 sums.
- Local-first prompt-to-CAD workflow with OpenSCAD source, Studio viewer, readiness gate, slicing,
  mock send, and print outcome recording.
- Clearer editable CAD/STEP precision lane through trusted CadQuery twins where available.
- Installed NSIS smoke coverage for the Windows installer workflow.

### Verified

- `pnpm test:release` passed on the tagged tree before publication: gate, browser e2e, native build,
  release-executable smoke, and installed NSIS smoke.
- Windows beta documentation, status matrix, and release evidence.
