# TinkerQuarry — PRD Gap Report (complete codebase vs PRD-v0.3)

**Date:** 2026-06-21 · **Method:** five parallel auditors, each reading the shipping code line-by-line
against a PRD section, cross-checked against `openscad-studio` to see what was supposed to be absorbed
but wasn't. Per-area reports: `prd-audit-1…5-*.md`. **No "defer later" — every PRD item is required.**

---

## The headline finding (read this first)

**The build reskinned KimCad's *own* SPA. It never absorbed OpenSCAD Studio's front-end — which was
the central net-new task of the whole project.**

PRD §11 and §13 Table A are explicit: the front end is *"a reskinned/re-laid-out build of the OpenSCAD
Studio React codebase (Monaco editor, Three.js viewer + offscreen multi-view renderer, the AI
tool-calling loop, the tree-sitter customizer parser, model selection)."* That Studio code is sitting
in `C:\Users\Scott\Desktop\CODE\openscad-studio` — **fully built, with the editor, the offscreen
multi-view renderer, the AI tool-calling/visual loop, the section plane, the SVG viewer, the customizer
parser.** None of it was ported. What shipped is KimCad's existing print-preview SPA with a TinkerQuarry
name + an earthy theme on top.

**Consequence:** the entire front-end half of the PRD — the signature Visual Correction Loop, the code
view, the rich 3D viewer, the deep customizer, large parts of Settings/Projects — is **missing, because
the front-end it was supposed to be built on was never brought in.** This is not a scatter of small
misses; it is one structural miss with broad fallout. I own that: the "reskin" I did (rebrand + retheme)
was cosmetic work on the wrong base, and I previously mis-framed the most important casualty (the visual
loop) as "planned" rather than "required and absent."

---

## Scorecard (≈140 discrete PRD requirements audited)

| Area | Present | Partial | Missing | Verdict |
|---|---|---|---|---|
| §6.2 Describe / image / clarify | 3 | 3 | 0 | mostly there |
| §6.3 AI assistant (agent/explain/diff) | 4 | 2 | 2 | **agent layer absent** |
| §6.3.1 **Visual Correction Loop** | 0 | 0 | **11** | **entirely unbuilt** |
| §6.4 3D viewer | 2 | 2 | 7 | **shallow viewer** |
| §6.5 Code view / editor | 0 | 0 | **6** | **entirely unbuilt (+needs engine API)** |
| §6.6 Customizer | 1 | 2 | 1 | template-only, clamps swallowed |
| §6.7 Gate / readiness | 7 | 1 | 0 | **strong** |
| §6.8 Orient | 1 | 1 | 1 | no manual override |
| §6.9 Slice | 4 | 2 | 0 | strong engine, thin UI |
| §6.10 Send / hardware | 7 | 4 | 1 | strong; no first-real-send state |
| §6.11 Families / **libraries** | 4 | 1 | **2** | **7 libraries not vendored; chooser dead** |
| §6.12 Projects / versions | 2 | 2 | 2 | no persisted history / iteration log |
| §6.13 Export | 3 | 0 | 3 | no .scad/.png/.svg/.dxf |
| §6.14 Settings | 6 | 4 | 4 | **no Libraries/Privacy/Licenses sub-screens** |
| §8 IA / layout | 4 | 2 | 1 | no code drawer; rail missing orient |
| §9 / §7.18 States | 8 | 1 | 2 | no offline banner / crash boundary |
| §11 API states handled | ~16 | — | 1 | **strong** (only slice `stale`) |
| §12 NFR / **security** | strong | 1 | 0 | **excellent, verified real** |
| **Approx. totals** | **~73** | **~31** | **~35** | ~half present, a quarter missing |

The raw counts under-state the problem: **the ~35 "missing" are disproportionately the high-value,
differentiating requirements** (the signature feature, the editor, the rich viewer, the libraries),
while the ~73 "present" are heavily the engine + onboarding + security plumbing.

---

## What is genuinely MISSING (required, not built)

1. **§6.3.1 Visual Correction Loop — the signature feature — 0% built.** No multi-view capture of the
   built mesh, no vision critique, no rounds/budget/best-candidate/rollback, no modes, no iteration log,
   no UI. The PRD's own acceptance test (*a hole on the wrong face that passes the math gate must be
   flagged*) **fails** — the pipeline ends at a purely geometric gate (`pipeline.py:933`) with no
   vision-over-mesh path. The vision model is wired only for photo→design seeds.
2. **§6.5 "Show me the code" / OpenSCAD editor — 0% built**, and worse than a UI gap: the engine exposes
   **no `.scad` over HTTP** and `DesignResponse` has no source field, so it needs new engine API too.
3. **§6.4 the rich 3D viewer** — preset views, orthographic, wireframe, shadows, **section plane**, 2D
   measure, **2D/SVG mode**, and **pan** are all missing; the **offscreen multi-view capture** that
   feeds the visual loop is effectively absent (only a single user-pose thumbnail). All of these exist
   in `openscad-studio` and were not ported.
4. **§6.3 the tool-using AI agent + explain mode + true diff-edits with undo/rollback** — absent;
   "refine" is a single-shot plan→build with history as context, not an agent loop.
5. **§6.11 the seven bundled OpenSCAD libraries (BOSL2, threads, rounding, enclosure, bin, …) — not
   vendored anywhere**; `library/` holds KimCad's own 16 modules. The **external-library chooser is a
   dead registry** (its own docstring says it isn't admitted to the renderer) with no UI.
6. **§6.14 Settings** — no **Libraries** sub-screen, no **Privacy** sub-screen, and the **About/Licenses
   surface is a bare "GPL-2.0" string** — no in-app license texts/attributions **with links to upstream
   source**. That last one is a likely **GPL-2.0 source-availability compliance gap**, not just UX.
7. **§6.13 export** advertises `.scad / .png / .svg / .dxf` but **only STL / STEP / 3MF exist**; no 2D
   export at all.
8. **§6.12** no persisted version history, no **restore** of a prior persisted version, branching is
   destructive, no **iteration-log** view.
9. **§6.8 manual orient override**, **§6.10 first-real-send caution state**, **§8 code drawer**,
   **§9 offline banner**, **§9 crash/recovery error boundary** — each individually missing.

## What is PARTIAL (there, but short of the spec)

- Customizer gives sliders only for **template** parts (LLM parts get none); **clamped values are
  returned by the engine but silently dropped by the client** (a one-field fix).
- Gate fix-paths are **prose, not actionable buttons**; slice profiles aren't shown in plain language
  before slicing (no layer-height anywhere); the `stale` can't-slice reason is never emitted.
- Printer capabilities are modeled but not displayed; printing progress is binary (no %); printer
  manager has no add-new / remove / explicit test-connection.
- Image input has no clipboard **paste**; example chips are 3 and all mechanical (no artistic).
- Override framing is softer ("proceed with caution") than the PRD's "you're overriding a safety check."

## What is genuinely PRESENT and strong (keep this)

- **The KimCad manufacturing engine** — printability gate, auto-orient, OrcaSlicer slicing with a real
  motion-bearing G-code *proof*, six printer connectors, exact per-send `confirm=True`, server-side
  fail-closed gate re-checks. This is the moat and it's real.
- **Onboarding / managed model download** — genuinely complete (fixed set, disk check, per-model
  progress, reassurance, retry, measured done).
- **Security & privacy — excellent and verified real:** per-boot constant-time session token on all
  POSTs, loopback default + warned `--allow-remote`, OS-keyring masked secrets, SCAD sanitizer +
  arm's-length worker, **zero telemetry/egress**.
- **API-state coverage** — nearly every real `api.md` design/slice/send/outcome/status/tier state is
  handled distinctly in the SPA.
- **Part-family browser + honesty tiers**, clarify-once, the describe-first home, stale-session reload.

---

## Honest assessment for your continue-vs-handoff decision

- **What exists is a polished, secure, well-tested *print-preview + describe* app on a real
  manufacturing engine.** It is not nothing — the engine, onboarding, and security are genuinely
  strong and worth keeping whoever continues.
- **It is not the TinkerQuarry the PRD specifies.** The product's defining front-end — the Studio-derived
  editor/viewer/customizer and the signature visual-correction loop — is absent because the Studio
  absorption (the project's central net-new task) was never done. Roughly a quarter of the PRD is
  unbuilt, and it's the differentiating quarter.
- **Effort to close it is large but bounded** and front-end-heavy: absorb Studio's front-end (or port
  its editor/offscreen-renderer/customizer), build the visual loop on KimCad's pipeline + the already-
  installed vision model, vendor the seven libraries + wire the chooser to the sandbox, and fill the
  Settings/Projects/export/viewer gaps. The engine and API contract underneath are sound, which is the
  expensive part to get right and it's already right.
- **CadQuery is now installed** (per your "install, don't skip" directive) — the 99 STEP-export skips
  can become real tests and `.step` export is now exercisable.

I've stopped here for your review, as requested. Per-area detail is in `prd-audit-1…5-*.md`.

---

## Added from the Codex auditor cross-check (things it caught that this report missed)

The Codex auditor (`Codex/.../TinkerQuarry-Auditor-Report.md`) audited against **the supplied design
interface (`Main Workspace.dc.html`)** as a first-class spec, not only the PRD. That lens caught three
real gaps this report under-weighted — all verified in-code:

1. **The real app's right panel does not implement the supplied design's "Customize / Make it real"
   flow.** The design has two right-side sections — **CUSTOMIZE** and **MAKE IT REAL** (orient → slice
   → print as one journey). The shipping app uses a **tabbed inspector: Parameters / Quality / Export**
   (`RightPanel.tsx:613`, `ParametersCard` `:198/246`). Functional pieces exist but the *designed
   workflow* was not built. (This report flagged the customizer as template-only; it did not compare
   the right-panel IA against the supplied design.)
2. **"Ready to print" is shown at gate-pass, BEFORE the slice proof.** The verdict string literally is
   `{"pass": "Ready to print"}` at gate-pass (`smart_mesh.py:104`), but PRD §6.7/§6.9 make a *successful
   slice* part of the readiness proof. So the headline verdict is ahead of the PRD's proof bar. (This
   report noted "slice = readiness proof, not folded into the UI" but did not flag the verdict *wording*
   as a violation — Codex's framing is sharper and correct.)
3. **Vision status needs four honest states, not one.** The design's title bar implies a "vision-ready"
   state; the UI should distinguish **available / missing-model / installing / actually-used-by-the-loop**
   — the last is impossible today because the loop doesn't exist. (This report covered vision *plumbing*
   states but not the design's title-bar claim or the "used-by-loop" distinction.)
4. **Canonical-repo ambiguity** (Codex's open question): which repo is the product — `tinkerquarry`
   (the prototype + glue + docs) or `KimCadClaude` (the real engine + the shipping SPA)? This report
   treated `KimCadClaude` as the shipping product implicitly; the split is itself a finding to resolve.

**Where the two reports fully agree (the headline):** the Studio front-end was *not* absorbed; the
**Visual Correction Loop is unbuilt**; the **code drawer / "show me the code"** is absent from the real
app; **About/Licenses** is incomplete; **external-library admission** is a dead registry. Two
independent audits converged on the same P0s.

**Where this report goes beyond Codex (for completeness, not point-scoring):** Codex ran only the
`tinkerquarry` mock/connector tests (19) and noted the real app may be under-tested — in fact the
shipping app has **407 frontend + 1,590 engine tests** (verified here). This report also adds the
granular inventory Codex did not enumerate: the **seven bundled libraries (BOSL2 etc.) are not
vendored** (a bigger gap than the external chooser alone), the specific **viewer gaps** (presets/ortho/
wireframe/shadows/section/2D/pan), **export formats** (.scad/.png/.svg/.dxf absent), **clamped values
returned-but-swallowed**, **version history/iteration log/restore/branching**, **manual orient
override / first-real-send / offline banner / crash boundary**, the fact the **engine exposes no `.scad`
over HTTP** (the editor needs new engine API), the **GPL source-availability compliance** angle on the
licenses gap, and that **security is verified real** (session token, SCAD sandbox, keyring, zero
telemetry). CadQuery is now installed, so STEP export + its 99 skipped tests are exercisable.

Net: the reports **corroborate** — neither contradicts the other on any material point; together they
are the accurate map.

### Design-spec verdict (Codex's wording, adopted verbatim)

> The supplied design interface was copied/prototyped in `tinkerquarry/frontend/index.html`, but not
> integrated into the real React production app in `KimCadClaude`; therefore the design spec was not
> implemented, only mocked/prototyped.

### Vision-model state — precise answer to the auditor's clarifying question

`qwen2.5vl:3b` **is actually installed** (3.2 GB, `ollama list` + `model-status: vision_present:true`,
verified 2026-06-21). It is used **only for photo/sketch → design seeding** (`llm_provider.py`
`describe_photo`/`describe_sketch`, lines ~129/138/546/555). It is **NOT used by any visual-correction
loop, because no such loop exists.** So: *installed and available* = yes; *used by a running visual
loop* = **no**. (An earlier STATUS line wrongly said "not yet pulled"; corrected.)

### Honesty correction on prior "done" claims

The earlier gate verdict in this same folder (`gate-report.md`: "CLEAR TO ADVANCE at 0/0/0/0/0") was
scoped to the **real-runtime integration slice that was built** — it is NOT a statement of PRD
completeness, and should not be read as "TinkerQuarry is done." Against the PRD and the supplied design
interface, the product is a **partial implementation** (this report). STATUS.md / the gate report need a
broader honesty pass to avoid implying PRD-level completion.
