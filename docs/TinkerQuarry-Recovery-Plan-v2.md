# TinkerQuarry Recovery Plan — v2

**Date:** 2026-06-22 · **Status: FINAL — for the audit's final review.** Supersedes v1 (Codex) and the
mid-revision v2 draft. **Incorporates every prior note:** the dev tightening pass, the auditor's ten
amendments, the auditor's two approval preconditions, **and the auditor's three final redlines** —
D3 is decided (fork) **and worded consistently everywhere** (no "shared package preferred" anywhere;
extraction is later-only); Phase 1 + Phase 6 are time-boxed with pass/fail bars; Phase 1 is explicitly
*fail-fast (boot + health), not "finish absorption in a day"*; and the **full SCAD-sandbox proof is
located in Phase 2** (Phase 1 only must-not-regress security defaults). Nothing is left flexible where
flexibility was the risk.

> **Why this plan looks the way it does:** v1 was structurally sound but left the front-end base decision
> flexible, and that flexibility is exactly what let the original effort build a plausible thing around
> KimCad instead of absorbing Studio. This plan removes that flexibility, separates the builder from the
> independent spec-auditor, and gates every phase on proof — so the failure mode that produced the
> current mismatch (a convincing wrong thing, self-graded) cannot recur without tripping a gate.

---

## 0. Pinned Decisions (locked — changing any requires written sign-off)

- **D1 — Canonical repo.** `tinkerquarry` is the product of record. `KimCadClaude` is a **separate
  product** for a different audience. `openscad-studio` is the **upstream front-end base to fork**, not
  a reference to admire.
- **D2 — Front-end base (the load-bearing decision).** The TinkerQuarry front end is built by
  **forking/absorbing the OpenSCAD Studio React app as the base application**, then **re-laying-out and
  reskinning it into the supplied design** (`Main Workspace.dc.html`). **Studio is the base, not a
  component grab-bag.** Explicitly *forbidden:* "create a new React app and import Studio pieces" — that
  is the path that reproduces the original mistake. (PRD §11: the front end *is* "a reskinned/re-laid-out
  build of the OpenSCAD Studio React codebase.")
- **D3 — Engine strategy (DECIDED — fork).** **Fork/copy KimCad's engine into
  `tinkerquarry/packages/engine`**, owned by a named maintainer, with a **`docs/engine-divergence.md`**
  log tracking every change vs upstream KimCad. *Rationale:* KimCad and TinkerQuarry are deliberately
  **separate products for different audiences**, so a shared engine would keep product coupling alive
  and slow recovery; a clean fork is less elegant but more honest and faster. **Extracting a shared
  package is a later optimization, not a recovery prerequisite** — revisit only once TinkerQuarry is
  real. No hidden coupling: the fork's provenance + divergence are documented from day one.
- **D4 — Specs are acceptance criteria, not context.** The PRD (`docs/prd/`) and the design
  (`docs/design/Main Workspace.dc.html`) are first-class. Deviations require written approval in
  `docs/design/deviations.md`.
- **D5 — Proof bar.** Mock-API behavior and the static prototype are **never** done-proof. Every
  P0/P1 item needs file paths + tests + a screenshot/local demo + API samples where relevant.

---

## 1. Cross-cutting requirements (apply to every phase, tested in Phase 11)

These were missing from v1 and are added as standing requirements, not a late phase:

- **Accessibility (PRD §10/§12).** Keyboard navigation, visible focus states, screen-reader sanity
  (roles/labels), and WCAG-AA contrast — on every new/ported surface. A11y has acceptance tests.
- **Theming / design system (PRD §10/§6.14).** A theme-able system with **light + dark** and a strong
  default; **Appearance** is a real Settings screen (was omitted in v1 Phase 10).
- **Security must not regress (PRD §12).** Carry over, as explicit acceptance items whenever the engine
  or renderer moves: the **SCAD sanitizer + arm's-length worker isolation**, **library/include
  sandboxing**, loopback-default + warned `--allow-remote`, the **per-boot session token**, OS-keyring
  masked secrets, and **zero telemetry / no egress**. Session token alone is not "secure."
- **Performance (PRD §12).** Template/part-family re-render is effectively instant and makes **no model
  call**; local inference never blocks the UI (honest progress). Has a perf budget + tests.
- **Honesty.** No surface claims a capability it doesn't have (vision "used", "Ready to print", etc.).

---

## 2. Preserve Checklist (carry-overs a rebuild must NOT regress)

A from-base rebuild can silently drop good existing behavior. These are verified-present today and must
survive the move, each with a regression test:

- Managed local-model download flow (fixed set, disk check, per-model progress, reassurance, retry, done)
- Stale-session "Reload" banner (rotated token)
- Clarify-once (`clarification_needed`)
- Printability gate + server-side fail-closed refusal on slice **and** send
- Per-send `confirm=true`; simulated-vs-real send distinction
- Post-print outcome (real-send-only, local-only)
- Photo/sketch on-ramp (local vision seeding)
- Saved-design portable export/import
- Session-token CSRF + SCAD sandbox + keyring secrets + zero telemetry
- Part-family browser + honesty tiers

---

## 3. Risk Register (the scary rocks in the river)

| Risk | Severity | Mitigation |
|---|---|---|
| **Studio absorption is large and unfamiliar** (the original failure point) | **High** | D2 forces fork-not-rebuild; Phase 1 is *only* "Studio boots in tinkerquarry, wired to engine health" before any reskin — fail fast. Time-box the spike; if Studio can't be stood up in the repo, stop and re-scope. |
| **Local vision may not be good enough for spatial critique** (PRD §14 #1, release-gating) | **High** | Phase 6 runs the spike (wrong-face-hole fixture) **before** building the full loop UI; if it fails the bar, the loop is cloud-optional per the PRD contingency. |
| **Engine fork divergence** | Medium | D3 is **fork** (no shared package during recovery): named owner + `engine-divergence.md` + attribution; shared-package extraction is only a later post-recovery optimization. |
| **Rebuild regresses present-good behavior** | Medium | The Preserve Checklist (§2) with regression tests. |
| **GPL source-availability compliance** | Medium | Phase 10 About/Licenses with in-app texts + upstream source links. |

**Effort sizing (rough, honest — not a contract):** the two High-risk phases (Studio absorption,
Visual Correction Loop incl. the vision spike) are the bulk of the work and the bulk of the
uncertainty. Repo reset + engine integration + the manufacturing/settings surfaces are larger in
line-count but lower-risk (the engine is already real). Plan for the front end + the loop to dominate.

---

## 4. Phases

### Phase 0 — Honest canonical repo
Move PRD → `docs/prd/`, design → `docs/design/`, **both audits + `PRD-GAP-REPORT.md` + this plan** →
`docs/audits/`. Rewrite README to current truth (prototype + mock present; real recovery in progress;
visual loop not implemented; design not yet productized). Add `docs/status.md` matrix (every P0/P1:
missing/partial/implemented/verified, sourced from the merged audit). Mark mock/prototype tests
"not done-proof." **Exit:** a new dev identifies the canonical repo + true status in <5 min; no
ambiguous "done" language remains.

### Phase 1 — Fork Studio into tinkerquarry and make it boot (D2)
Fork the OpenSCAD Studio React app into `tinkerquarry` as the front-end base. Strip the dropped-from-Studio
features (share links, public analytics, cloud-first setup, editor-first default). Stand it up, wired to a
TinkerQuarry backend that proxies the KimCad engine's `/api/health` (+ session token + loopback default;
**do not regress security defaults — the full SCAD-sandbox / worker-isolation proof happens in Phase 2,
where the engine actually moves**). Add the app-wide error boundary + offline/backend-down banner.
**Time-box:** ≤ 1 focused working day (or ~6 agent-hours). **Scope of this spike:** it is *fail-fast*,
**not** "finish Studio absorption in a day" — the only bar is *prove Studio can boot inside `tinkerquarry`
and call backend health.* **Pass:** Studio's app runs inside `tinkerquarry`, renders its shell, calls the
real engine `/api/health`, mock mode is opt-in + labeled, POSTs are token-protected. **Fail → STOP-AND-REPORT:** if the time-box ends without Studio booting
cleanly against the real engine, **halt** — write `docs/audits/phase1-findings.md` (what blocked it,
options, revised estimate), escalate for a decision, and do **not** start any reskin or further
absorption. This is the cheapest place to learn the absorption is hard; spending it here is the point.

### Phase 2 — Engine integration (D3 = fork)
**Fork/copy** the KimCad engine into `packages/engine` (per D3 — *not* a shared package), with a named
owner + `docs/engine-divergence.md` tracking every change vs upstream KimCad; rename APIs/classes/
user-visible strings to TinkerQuarry; **carry the security sandbox + sanitizer + worker isolation
explicitly, and PROVE it here** (this is where the full SCAD-sandbox proof lives); preserve KimCad
license/attribution. Compatibility tests prove design→gate→slice still works from `tinkerquarry`.
*(Extracting a shared engine package is a later post-recovery optimization, never part of recovery.)*
**Exit:** a prompt generates a real mesh, gates, orients, and slices from the canonical repo; user-facing
strings say TinkerQuarry; attribution present; the SCAD sandbox/worker isolation is proven; **no security
regression**.

### Phase 3 — Re-layout + reskin Studio to the design (productize the screens)
Re-lay-out the forked Studio app to the supplied design: title bar, assistant panel, composer (incl.
photo/sketch), center 3D preview + view controls, code drawer, visual-correction band, and the right side
as **Customize** + **Make it real** (orient→slice→print) — **not** a Parameters/Quality/Export inspector
unless approved in `deviations.md`. **Productize §7.1 First-run/Setup and §7.2 Welcome/Home too**, not
just the workspace. Replace scripted/prototype state with backend-driven state. Responsive/mobile on the
same hierarchy. Apply the theme system (light+dark). **Exit:** first screen matches the design structure +
workflow; first-run + home are TinkerQuarry-native; no production UI relies on prototype behavior;
screenshots desktop+mobile; Playwright layout-region tests.

### Phase 4 — Viewer, customizer, Explain mode (mostly *finish what Studio brings*)
Because Phase 1 forked Studio, its viewer/customizer/editor come along — so this phase **verifies and
finishes** them against the PRD viewer set rather than rebuilding: orbit/pan/zoom, preset views, ortho,
wireframe, shadows, **section plane**, 2D + 3D measure, build-plate context, 2D/SVG mode, and the
**offscreen multi-view capture** that feeds the loop. Customizer: auto-extract params (incl. **LLM-codegen
parts, not just templates**), units/ranges/groups/dropdowns, live re-render with **no model call**, and
**surface clamped values** (engine already returns them; client must stop dropping them). Add **Explain
mode** ("explain this design"). **Exit:** viewer supports the PRD control set + offscreen capture;
customizer covers codegen parts + shows clamps; Explain mode works.

### Phase 5 — Source API + code drawer (make "show me the code" real)
Add engine source fields (generated SCAD/CAD source, language, filename, revision) + endpoints
(`GET/PUT /api/designs/{id}/source`, `POST …/rerun-source`). Wire Studio's editor as the **collapsed-by-
default code drawer** with diagnostics, edit, rerun, revert, and an AI-change diff where feasible; include
source in export/import. **Exit:** a generated design exposes its source over API; the drawer shows/edits/
reruns it; source is in project export.

### Phase 6 — Visual Correction Loop + vision spike + fallback (the signature feature)
**First, the release-gating spike (PRD §14 #1) — time-boxed ≤ 1 focused working day:** an **8-fixture
set — 4 planted spatial errors** (hole on the wrong face [the PRD's canonical case], a floating/
disconnected feature, a missing cutout, a should-connect-but-doesn't misalignment) **+ 4 correct
controls**. Capture multi-view renders, run the local vision model, score against the bar.
**Pass bar ("local vision is good enough"):** it **must** flag the canonical wrong-face hole, **must**
catch **≥ 3 of 4** planted errors, **and** raise **≤ 1 of 4** false alarms on the correct controls.
**If it passes**, the v1 loop is local; **if it fails**, the loop ships **cloud-optional per the PRD
contingency** (same design, labeled, clear privacy UX) and local stays a spike to revisit. Record the
result in `docs/audits/vision-spike.md`. Then build the loop: VCL schema (mode full-visual/text-only/
off · round · views · critique · model · findings · correction · result · rollback/best-candidate · final
approval); backend (capture views → vision critique → map to repair → re-render → repeat within budget
[default 3, configurable] → keep **best by gate+critique, not last**); **runs on the LLM-codegen path only
— templates skip it**; UI visual-correction band with all states + model-missing/installing; record each
round in the iteration log. **Exit (PRD acceptance):** the planted wrong-face hole that passes the math
gate **is flagged by the loop when vision is available**; loop state appears in the real UI; rounds are
logged; vision-unavailable is honest.

### Phase 7 — Honest readiness / slice / print state machine
Replace the ambiguous "Ready to print" with distinct states: design-generated · geometry-gate-passed ·
ready-to-slice · slice-passed · ready-to-send · sent · outcome-recorded. **Per PRD §6.7/§6.9, a successful
slice is part of the readiness proof** — "Ready to print" must not appear before a successful slice
(today the verdict string shows it at gate-pass, `smart_mesh.py:104`). Show slice profiles in plain
language **before** slicing (printer · material · nozzle · layer height · supports · estimate). Add the
**gate-override "you're overriding a safety check" framing** (§9), **first-real-send caution** state, and
**manual orient override** (with safety framing, recorded). Surface printer progress %. **Exit:** state
machine tests; "Ready to print" gated on slice; first-real-send confirm distinct; manual orient works.

### Phase 8 — Libraries, families, external admission
**Vendor the seven bundled OpenSCAD libraries** (BOSL2, Round-Anything, threads.scad, YAPP_Box,
Catch'n'Hole, gridfinity-rebuilt, MCAD) with per-library attribution; auto-wire includes. Build the
**Libraries** Settings screen (bundled view + external chooser + enable/disable + path/source). Implement
**external-library admission for real**: consent → sandbox copy → renderer include-path update →
sanitization (not the current dead registry). **Exit:** bundled libraries usable in a render; an admitted
external library is actually usable in a render; licensing visible in Settings/About.

### Phase 9 — Projects, history, iteration log, export
Persist design history (prompt, source, artifacts, **VCL rounds**, gate, slice, send, outcome);
**restore** a prior version; **non-destructive** branch/fork; **iteration-log** view. Export the PRD
formats: `.scad` (real generated source) · `.stl` · `.3mf` · `.step` (CadQuery — now installed) · `.png` ·
`.svg`/`.dxf` (2D); import TinkerQuarry project files. **Exit:** restore + branch + iteration log work;
required exports work or are approved cuts; round-trip import/export test.

### Phase 10 — Settings, privacy, licenses, compliance
Settings screens: **Models · Printers · Libraries · Appearance (theme) · Privacy · About/Licenses ·
Advanced**. Privacy: local-first explanation, telemetry state (off), cloud opt-in/off, data locations,
photo/sketch handling. **About/Licenses: in-app license texts + attributions (TinkerQuarry, KimCad-derived,
Studio-derived, the seven libraries) WITH upstream source links** — the GPL source-availability obligation.
Printers: add/edit/remove/test/default. Advanced: show-code default, visual-loop max rounds, gate override,
experimental toggle. **Exit:** privacy + license/source inspectable in-app; imported code attributed;
audit compliance gaps closed.

### Phase 11 — Test & gate strategy
Unit (API schema, source handling, state machine, customizer parser, library admission). Integration
(design→render→**VCL**→gate→orient→slice→send; source-edit→rerun→gate; external-library→render;
export/import round-trip). Frontend (layout regions, code drawer, VCL states, readiness states, settings/
license screens). E2E (prompt→sliced artifact; **wrong-face-hole VCL fixture**; photo/sketch seed with
model present; model missing/installing; simulated send; first-real-send confirm). Visual (desktop +
mobile screenshots; viewer canvas non-blank; offscreen capture non-blank). **Accessibility (keyboard,
focus, contrast, SR).** **Performance (template re-render budget, no-model-call assertion).** **CI vs local
gate:** decide and name it; release notes carry the full test command output.
**Release gate:** 0 P0 open; 0 P1 open without owner-approved scope cut; README/status matches reality;
no mock/prototype as proof; deviations documented + approved; a11y + perf gates pass.

---

## 5. Definition of Done (v2)
TinkerQuarry is done only when the canonical `tinkerquarry` repo demonstrates, without mocks:
1. The real app opens into the supplied TinkerQuarry workspace (or approved equivalent), **built on the
   forked Studio base** — first-run + home are TinkerQuarry-native.
2. A plain-English prompt generates a real printable design.
3. The real generated source is visible/editable/rerunnable in the code drawer + in export.
4. The real viewer shows the model and supports the PRD control set (presets/ortho/wireframe/section/
   measure/2D/build-plate) + offscreen multi-view capture.
5. The Visual Correction Loop runs on rendered views, logs findings, and **the wrong-face-hole fixture is
   caught** (local if the spike passed, else cloud-optional).
6. Readiness/orient/slice/send states are truthful ("Ready to print" only after a successful slice);
   first-real-send caution + manual orient override present.
7. The seven libraries are present + usable; external libraries can be truly admitted.
8. Required export formats work; projects have restore + iteration log.
9. Settings includes Appearance, Privacy, and complete About/Licenses with upstream source links.
10. **Accessibility + performance + security-sandbox** acceptance all pass; **zero telemetry**.
11. Tests + screenshots prove all the above in CI or a reproducible local gate; the Preserve Checklist
    has no regressions.

---

## 6. Immediate next actions (no product code until D1–D3 are signed off)
1. Confirm the decisions: D1 (canonical repo) · D2 (**fork Studio as base**) · **D3 now DECIDED — fork
   the engine into `packages/engine`** (override only with written reason). No product code until confirmed.
2. Phase 0: status matrix from the merged audit; README truth pass; commit specs + audits + this plan.
3. Run the **Phase 1 fail-fast gate** (Studio boots in `tinkerquarry`, wired to engine health) before any
   reskin — this is the cheapest place to discover the absorption is harder than hoped.
4. Schedule the **Phase 6 vision spike early/in parallel** — it gates whether v1's loop is local or cloud.
