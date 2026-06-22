# TinkerQuarry — Product Requirements Document

**Version:** 0.3 (design handoff draft)
**Date:** 2026-06-21
**Status:** For Claude Design — generate the full design (every screen, state, and flow) from this document.
**Owner:** Scott Converse

**Changes in 0.3:** Softened the §2 differentiation to the *combination* (not "no tool does the loop");
labeled the golden path as the target-v1 experience (MVP may degrade); sharpened real-printer-send
(v1) vs broad real-metal validation (beta); softened + dated the test-count claims; added GPL
source/upstream links to About/Licenses.

**Changes in 0.2:** Added §13 Reality Map & Release Cut; replaced "guarantee" language with gate
authority; named the real integration contract (KimCad API) and its states; added the Studio
reuse/drop map; added model-download, About/Licenses, post-print outcome, and security-UX surfaces;
added visual-loop acceptance criteria; clarified templates-vs-libraries; corrected offline + telemetry.

> **How to use this PRD (for the design agent):** This document specifies *what* TinkerQuarry is,
> who it's for, every function, every screen, and every state — but **not** the visual design. Your
> job is to create the visual design: layout, components, color, type, motion, and every screen
> including empty/loading/error/success states. **Read §13 (Reality Map & Release Cut) first** — it
> tells you what already exists (and is tested), what is net-new, and what is MVP vs later, so you
> design the right things at the right weight. Sections 6–9 are the functional spec to cover
> exhaustively; Section 10 is brand *direction*, not a finished look — propose the look.

---

## 1. Summary

**TinkerQuarry** turns a plain-English description (or a photo, or a sketch) into a 3D-printable
object — entirely on the user's own machine, with no account, no cloud, and no CAD skills required.
You describe what you want; TinkerQuarry generates the geometry, *looks at what it built and fixes
it*, checks it against a deterministic printability gate, slices it, and sends it to your printer.

The metaphor: a **quarry** is where you extract something solid and real from raw material.
TinkerQuarry is where makers extract real, printable objects from raw ideas.

**One-liner:** *Describe it. Watch it get built, checked, and corrected. Print it. All on your machine.*

---

## 2. Vision & Positioning

**What it is:** A local-first, AI-native desktop app that runs the full path from idea to printed
part: generate → **see & correct** → validate → slice → print.

**The gap it fills:** AI can already write OpenSCAD that *compiles*. The unsolved problem is that the
geometry is often *spatially wrong* — a hole on the wrong face, a feature floating above the bed, two
parts that should touch but don't — and it passes every mathematical check. The visual-correction
loop itself isn't unheard of (the editor we reuse can already feed a render to an AI). What's missing
is the *combination*: **no maker-first, local print pipeline pairs this visual-correction loop with
deterministic validation, slicing, and printer send.** That combination is TinkerQuarry's signature.

**On "printable":** TinkerQuarry does not promise a perfect physical print — adhesion, calibration,
filament condition, supports, and printer behavior are outside the software's control. It promises
that **nothing is presented as *ready* unless it passes the deterministic printability gate and a
successful slice.** That is a strong, honest claim: the geometry is manifold, fits the build volume,
meets wall-thickness rules, and produced real, motion-bearing G-code.

**What it is NOT:**
- Not a CAD program you operate with a mouse — you describe, it builds.
- Not a code editor you're expected to live in — the code exists, but it's optional.
- Not a cloud service — nothing leaves your machine unless you explicitly opt into a cloud model.
- Not for artists only or engineers only — it serves **both** functional/mechanical parts *and*
  artistic/organic objects.

**Relationship to existing work:** TinkerQuarry's front end is built on the OpenSCAD Studio codebase
(a polished, tested React editor + 3D viewer + AI tool-loop), reskinned and re-laid-out; its back end
is a local, deterministic manufacturing pipeline (the "KimCad" engine, with an existing tested HTTP
API). OpenSCAD is the geometry *engine*, never a surface the user is required to touch. See §11 and §13.

---

## 3. Target Users

### Primary — "the maker who can't (or won't) CAD"
- Owns a 3D printer; wants a specific part or object; describes it in plain English.
- **Runs local AI by default. Does NOT have a cloud API key** (only ~1–2% of this audience does).
- Privacy-conscious / offline-capable expectation: assumes it works without an internet account.
- Skill range: from total non-coder to hobbyist. Comfortable with a printer, not with code.
- Hardware varies widely — from mini-PCs with integrated GPUs to gaming rigs. Must run acceptably
  without a discrete GPU.

### Secondary — "the developer who wants to peek" (e.g., "Kim")
- Knows OpenSCAD as a language; wants an optional **"show me the code"** view to read/edit.
- Wants the code surface available on demand, **not** front-and-center.

### Design implication
Default the entire experience to **describe-first, local, private, code-optional**. The developer
affordances are present but secondary. Never greet a user with a "configure an AI provider" wall.

---

## 4. Product Principles (non-negotiable)

1. **Local-first, cloud-optional.** Local model is the default and the app is fully usable offline
   *after initial setup*. Cloud (bring-your-own API key) is an *advanced opt-in* for the small
   minority who want maximum quality. First run must work with minimal/zero configuration once a
   local model is present, and guide clearly when one isn't.
2. **Determinism is the quality floor.** A catalog of parametric **templates** ("part families")
   emits exact, manifold geometry with *no model call*, and the **printability gate** is pure math.
   Quality does not depend on model strength for the common cases. The LLM is the fallback for
   off-template shapes.
3. **The Visual Correction Loop is core.** After a render, the AI inspects the rendered geometry
   (multiple views) and corrects spatial errors automatically. This is the product's reason to exist
   and must be designed as a first-class, visible experience — including its degraded states (§6.3).
4. **Code is optional.** Describe-first. The OpenSCAD code is an intermediate representation the user
   can reveal and edit ("show me the code") but never has to see.
5. **Gate authority, not guarantees.** The deterministic gate + a successful slice are the authority
   on whether something is *ready*. Nothing is shown as "ready" unless it passes (or the user
   explicitly overrides). The product never claims a physical print *will* succeed.
6. **Private by default.** No accounts; no telemetry on by default; nothing leaves the machine unless
   the user enables a cloud model. Make this legible and trustworthy.
7. **Cross-platform, Windows-first.** Must run well on Windows. (Desktop shell also targets macOS/Linux.)

---

## 5. The Core Experience (the golden path)

> This is the **target v1 experience.** In MVP the *see & correct* step (4) may run text-only or be
> cloud-optional, and printing (8–9) is optional — see §13. The rest of the path holds.

```
1. Describe        "a wall bracket for a Raspberry Pi 4, M3 screws, 3mm walls"
        ↓
2. Generate        template/part-family (instant, no model) OR local LLM writes OpenSCAD
        ↓
3. Preview         live 3D model appears
        ↓
4. See & Correct   AI looks at the render (multiple angles), finds spatial errors, fixes them,
                   re-renders — looping until it looks right  ← THE SIGNATURE LOOP (§6.3)
        ↓
5. Validate        printability gate (manifold, walls, fit to build volume) → readiness score
        ↓
6. Customize       (optional) auto-extracted parameters as sliders, live re-render (no model call)
        ↓
7. Orient          auto-oriented for printing (overridable)
        ↓
8. Slice           sliced to G-code with the printer/material profile (the slice is a real proof)
        ↓
9. Print           sent to the connected printer (explicit confirm) → progress → record outcome
```

At every step the user can stay in plain English ("make the walls thicker," "move the holes to the
back"), reveal the code, or adjust parameters. The journey must feel like *watching a capable shop
build the thing for you*, with the visual-correction step as the memorable "wow."

---

## 6. Functional Requirements by Area

### 6.1 First-run, onboarding & local-model setup
- Detect a local model runtime and report status (running / model present / **vision model present**).
  If a usable local model is present, **just work** — no configuration screen.
- **Managed local-model download (design the full flow):** if the needed local model(s) aren't
  present, offer an in-app, one-click download of a fixed, server-defined model set into a local
  runtime. Design states for: **disk-space check**, **download progress per model** (status /
  completed / total), **slow/large download** reassurance, **recoverable failure + retry**, and
  **done**. The pull list is fixed (not user-supplied).
- If the user prefers cloud: a clearly-labeled "use a cloud key instead (advanced — sends designs to
  the cloud)" path. Never a bare "configure a provider" dead end.
- Detect installed tools (OpenSCAD, slicer, optional CAD-exchange engine) via a health check; guide
  the user if something needed is missing, with a "check again" affordance.
- Always show example prompts on the entry surface (not gated behind AI config).

### 6.2 Create / Describe
- A prominent **describe** surface: "What do you want to make?" with a large input.
- **Example prompt** chips spanning mechanical and artistic (e.g., "a wall mount for a Pi 4," "a
  hexagonal pencil holder," "a low-poly fox figurine," "a custom gear, 20 teeth").
- **Image input:** paste / drag / pick a photo or a dimensioned sketch as a reference ("make this").
  The image is read by the **local** vision model into an editable text seed and **never leaves the
  machine / is not persisted**.
- **Clarify-once:** the system may ask at most one clarifying question when the request is ambiguous,
  then proceed. (This is a real design state: `clarification_needed`.)
- **Part-family library browser:** the user can also start from a browsable catalog of part families
  (see §6.11) — each family seeds the same describe→design flow.

### 6.3 AI Assistant (the brain)
- **Local-first model selection** with an obvious, non-jargony picker; cloud models appear only if
  the user has opted in. Surface model health (running / model present / vision present).
- **Conversational, multi-turn.** The user refines in plain English ("thinner walls," "add a lid").
- **Tool-using agent** whose actions are *visible* but legible to a non-coder: it generates, renders,
  **captures views of the model**, reads errors, and edits. Tool activity should read as "the
  assistant is working" (e.g., "drawing it," "looking at it from the back," "fixing the holes"), not
  raw developer tool-call dumps — though a developer can expand the detail.
- **Explain mode:** "explain this design" in plain English.
- **Diff-based edits** under the hood (changes parts of the model, with undo/rollback).

#### 6.3.1 The Visual Correction Loop — behavior & acceptance criteria
- **When it runs:** on the **LLM-codegen path only.** Template/part-family parts are deterministic and
  skip it (designing for "the AI is checking your model" on a deterministic part would be misleading).
- **Inputs:** after a render, the assistant requests **multiple labeled views** (front/back/top/sides/
  iso) and inspects them for spatial errors (wrong axis/face, floating features, missing cutouts,
  misalignment, parts that should connect but don't).
- **Budget:** a **separate** round budget from render-error retries; default **3 rounds**, configurable.
- **Best-candidate retention:** keep the **best** render across rounds (by gate + critique), **not the
  last** — a later round that regresses must not win. A round that flip-flops or worsens the gate
  rolls back to best-so-far.
- **Convergence / exit:** approved (no actionable spatial issue) · best-candidate after max rounds ·
  fatal render error. The gate (§6.7) remains the final authority regardless of the loop's verdict.
- **Modes (must be labeled in the UI; never imply the AI "saw" it if it didn't):**
  (a) **full-visual** — a vision-capable model inspected the rendered views;
  (b) **text-only** — the model reasoned from code + validator output (no usable image/vision);
  (c) **off** — user disabled it.
- **Logging:** every round records its views, findings, edits, and verdict into the iteration log
  (§6.12), visible to the user.
- **User control:** accept the current result, force another round, or stop. A developer can inspect
  what the AI saw and changed each round.
- **Acceptance criterion (the test that proves it's real):** a deliberately wrong design that passes
  mathematical validation — e.g. a hole on the wrong face — **must be flagged by the loop when vision
  is available.** "The loop ran" is not success; "the loop caught the planted spatial error" is.
- **OPEN SPIKE (see §14):** whether a *local* vision model is good enough for this critique is being
  tested. Local vision is already plumbed (the photo on-ramp uses it); the open question is critique
  quality, not capability. Design the loop identically for local vs cloud — only quality/labels differ.

### 6.4 3D Preview & Viewer
- Live, interactive 3D view: orbit, pan, zoom; preset views (front/back/top/bottom/left/right/iso);
  orthographic toggle, wireframe, shadows; **section plane**; **measurement** (2D and 3D).
- A **build-plate context** (the part on the printer's bed, oriented as it will print).
- 2D mode: an SVG view for flat / laser-style designs.
- The viewer feeds the visual-correction loop (the multi-view captures come from here).

### 6.5 Code view ("show me the code")
- **Hidden/collapsed by default.** A clear "show me the code" affordance reveals an OpenSCAD editor.
- Full editor when revealed: syntax highlighting, inline error/warning diagnostics, edit + re-run.
- A user edit re-enters the pipeline at validate/gate (no AI required). Editing is for the developer
  persona; the non-coder never opens it.
- Multi-file awareness shown only when relevant.

### 6.6 Customizer
- Auto-extract the model's parameters and present them as labeled **sliders / inputs / dropdowns**,
  with units, ranges, and sensible defaults; group them sensibly.
- **Live re-render** on change — for template/part-family parts this must be effectively instant and
  require **no model call** (preserve the determinism guarantee). Clamped values are surfaced (the
  engine reports which inputs it adjusted).

### 6.7 Printability & Readiness (the gate)
- Run the **printability gate**: manifold/watertight, wall-thickness vs nozzle, build-volume fit,
  shell/body count, and other printability assertions.
- Present a **Readiness** result: a clear verdict + score + plain-English problem list with what each
  means. Real status values to design for: `pass` (completed), `gate_failed`, `render_failed`,
  `plan_failed`, `clarification_needed`, `model_unavailable`, `needs_experimental`.
- When something fails, say **why** and offer a one-step fix path ("walls are 0.8 mm; your nozzle
  needs ≥1.2 mm — thicken walls?"). The gate is the authority; "ready" is never shown unless it
  passes or is explicitly overridden.

### 6.8 Orient
- **Auto-orient** to a stable printing pose (drop-to-bed), shown in the preview.
- Allow **manual override** of orientation.

### 6.9 Slice
- Slice the oriented model to printer-ready G-code using the selected **printer + material profile**.
- Show the chosen profiles in plain language before slicing ("Bambu P1S · PLA · 0.2 mm").
- Surface outcomes/estimates; handle "can't slice" with typed reasons (`no_profile`, `failed`,
  `stale`). A gate-failed part is refused server-side regardless of client claims.
- Slicing is gated behind the printability result + an explicit user action. **A successful slice is
  part of the readiness proof** (real, motion-bearing G-code).

### 6.10 Send to Printer & real-hardware validation
- Manage **printer connections** (local-network printers across common protocols).
- Show printer **status** — design real states: `ready`, `busy`, `offline`, `needs_setup` — and
  **capabilities** (build volume, nozzle, materials).
- **Send** a sliced job with an **explicit per-send confirmation** (a deliberate safety gate). Never
  auto-send; never send anything that isn't a proven, sliced, gate-passing job.
- **Maturity / safety states (design these distinctly):**
  - **software-verified** — passed the gate + sliced cleanly (no hardware involved).
  - **simulated** — sent to the built-in mock/loopback printer; **never narrated as a real print**.
  - **connected** — a real printer is reachable and ready.
  - **first real send** — extra care/confirmation copy; real-hardware connector paths are
    protocol/mock-tested and real-metal validation is beta (design for caution, not false confidence).
  - **printing / progress** and **done**.
- **Post-print outcome capture ("How did it print?"):** after a **real** (non-simulated) send,
  optionally ask the user the outcome (`clean` / `issues` / `failed` / `skip`). This is offered only
  after a real hardware send, records a coarse **local-only** signal (no prompt text or geometry
  stored), and feeds the local learning loop. Design the prompt, the four choices, and the "skip" path.

### 6.11 Part families, templates & libraries (what the user sees vs what's under the hood)
- **What the user sees: part families and their parameters.** TinkerQuarry exposes a browsable catalog
  of parametric **families** (the deterministic template catalog — on the order of dozens of families,
  each with an honesty tier: **benchmarked** = what-you-set-is-what-you-get, or **baseline** = real,
  gate-verified with a verify-before-use caveat). Families are the **product primitives**; the user
  picks/uses families and tunes **parameters** (via the customizer), not raw libraries.
- **What's under the hood: libraries as implementation capability.** Seven OpenSCAD libraries are
  **bundled and always available** (a foundation shapes/utility library plus rounding, threads/
  fasteners, enclosures, insert/countersink, bin, and mechanical-primitive libraries). These enrich
  what the **LLM-codegen fallback** can build and back specific families. **The user does not pick a
  library** — it's chosen automatically and includes are auto-wired. For local models, only the
  *relevant* library capabilities are surfaced per prompt (curated/retrieved), not the whole catalog.
- **External libraries (advanced chooser):** an advanced surface lets a power user plug in additional
  libraries they've installed themselves (point at a folder) — the same gesture as adding an API key.
  This is how libraries TinkerQuarry can't ship (for license reasons) are used without bundling them.
  Design the advanced "manage libraries" surface (view bundled, add/enable external).

### 6.12 Projects, history & versions
- Save designs; reopen recent ones (a "recent" surface on entry).
- **Version/iteration history:** every meaningful iteration (including each visual-correction round)
  is retained and viewable; the user can restore a previous version. Branching is desirable.
- An **iteration log** view: what was tried, what the gate said, what the visual loop found/fixed.

### 6.13 Export & portable designs
- **Export** the model and artifacts: `.scad` source, `.stl`, `.3mf`, rendered `.png`, a CAD-exchange
  `.step` when an engine is present; plus `.svg`/`.dxf` for 2D designs. Explain formats for non-experts.
- **Portable saved designs:** a design can be **exported as a portable design file and re-imported**
  (open a design someone shared, or move it between machines). Design the export-design and
  import-design flows.

### 6.14 Settings
- **AI engines:** local model(s) + runtime/vision status; managed model download (§6.1); optional
  cloud provider + key entry (advanced, labeled "sends your designs to the cloud"); per-task model
  choice (e.g., a stronger model for the visual loop). Show the cloud key **masked only**.
- **Printers:** add/edit/remove connections; test connection; set a default. Secrets are never shown.
- **Libraries:** view bundled libraries; add/remove/enable external library roots.
- **Appearance:** theme selection (the design system must support theming; light & dark).
- **Privacy:** explicit controls; **telemetry off by default**; any analytics/usage reporting is
  removed or strictly opt-in (see §13 drop-list). Disclose credential storage (OS keyring; a
  disclosed file fallback when no keyring).
- **About / Licenses:** product/version info **and a third-party licenses & attribution surface** —
  TinkerQuarry combines GPL-2.0 components and bundles libraries, so license texts and attributions
  (OpenSCAD, the front-end base, and the seven bundled libraries) must be viewable in-app, **with links
  to the corresponding source / upstream repositories** (the GPL source-availability / written-offer
  requirement).
- **Advanced/Developer:** show-code default, visual-loop max rounds, gate override, experimental
  generator toggle.

---

## 7. Screen Inventory (design every one, with all states)

For each screen design **empty, loading, in-progress, success, and error** states.

1. **First-run / Setup** — local-model detection & status; managed model download (disk check,
   per-model progress, retry); "use cloud key (advanced)"; tool health; skip to empty.
2. **Welcome / Home (entry)** — "What do you want to make?", describe input, example chips, recent
   designs, browse part families, "start empty." Works with no AI configured (examples still shown).
3. **Main Workspace** — the primary layout combining: AI/describe panel, 3D preview, the collapsible
   code panel, the customizer, and the **manufacturing rail** (readiness → orient → slice → print).
   Describe/AI + preview are primary; code is collapsed by default.
4. **AI Assistant panel** — transcript, composer (text + image attach + model picker), and legible
   tool/▶ activity including the visual-correction loop. *States:* idle, thinking, rendering, **looking
   at the model**, issue-found-fixing, done, error, model-unavailable, clarification-needed.
5. **Visual Correction view** — what the AI saw (the multiple views) and changed, round by round.
   *States:* full-visual, text-only, off, gave-up/best-candidate.
6. **3D Preview panel** — viewer with presets, ortho/wireframe/section/measure, build-plate context,
   2D/SVG mode. *States:* empty, rendering, rendered, render-error.
7. **Code panel ("show me the code")** — collapsed by default; expanded editor + diagnostics.
8. **Customizer panel** — grouped controls, live re-render, clamped-value notices.
9. **Readiness / Printability panel** — verdict, score, problem list with plain-English fixes,
   one-click fixes, override. *States:* pass, warn, fail, checking, plan-failed, model-unavailable.
10. **Orient surface** — auto-orientation shown; manual override.
11. **Slice surface** — chosen profiles, slice action, results/estimates, typed can't-slice reasons.
12. **Send / Printer surface** — connection picker, status & capabilities, confirm-to-send, job
    progress, and the **maturity/safety states** in §6.10 (software-verified / simulated / connected /
    first-real-send / printing / done).
13. **Post-print outcome prompt** — "How did it print?" (clean / issues / failed / skip), shown only
    after a real send.
14. **Settings** — sub-screens: **AI engines**, **Printers**, **Libraries**, **Appearance**,
    **Privacy**, **About/Licenses**, **Advanced/Developer**.
15. **Part-family / Library browser** — browsable families with tiers + the external-library chooser.
16. **Projects / History** — recent designs, version/iteration history, restore, branch, iteration log,
    **export/import portable design**.
17. **Export dialog** — format choices with explanations.
18. **Global states** — offline banner ("offline — local features work, cloud/remote printers don't"),
    local-model-not-running, generation-failed, render-failed, gate-failed, no-printer, long-running
    local inference (reassurance), stale-session reload banner, and a friendly crash/recovery screen.

---

## 8. Information Architecture & Layout

- **Describe-first.** The describe/AI surface and the 3D preview are primary and always present.
- **Manufacturing rail.** Readiness → Orient → Slice → Print is a coherent progressive path, distinct
  from the "create/refine" side.
- **Code is a drawer, not a room.** Collapsed by default; one affordance to reveal.
- **Progressive disclosure.** A novice sees: describe → preview → readiness → (print/export). A
  developer can open code, customizer detail, orientation override, library management, advanced settings.
- Supports both a **desktop app** window and a **web app** of the same layout.

---

## 9. Key States & Edge Cases (design, don't afterthought)

- **No local model running / not yet downloaded** — guide to the managed download or cloud (advanced);
  keep examples usable.
- **Local inference is slow** — honest, reassuring progress; never a frozen UI.
- **Generation produced nothing usable** (`plan_failed` / `needs_experimental`) — graceful path forward.
- **Render failed / empty model** (`render_failed`) — clear, non-scary, recoverable.
- **Visual loop: vision unavailable** — text-only labeling; never imply the model "saw" it.
- **Gate failed** (`gate_failed`) — the most important "bad news done well": specific, plain, actionable.
- **No printer connected** — the design is still fully valuable (export); printing is optional.
- **Offline** — everything except cloud models and remote printers works after local setup; say so calmly.
- **Stale session** — after a restart, a state-changing action may need a one-click reload (session
  token rotated); design a calm "Reload" banner.
- **Override paths** — a knowledgeable user can override the gate/orientation deliberately, with clear
  "you're overriding a safety check" framing.

---

## 10. Brand & Design Direction (propose the look — direction, not a spec)

- **Name & metaphor:** TinkerQuarry — hands-on making ("tinker") + extracting something solid and real
  from raw material ("quarry"). Tactile, grounded, material, honest. A workshop, not a SaaS app.
- **Personality:** capable and trustworthy, warm and approachable, a little crafty/maker-ish — like a
  well-organized workshop bench. Not a sterile enterprise tool, not a toy.
- **Audience pull:** approachable enough that a non-coder isn't intimidated, credible enough that a
  maker trusts it for exact work. Avoid generic "AI app" gloss and developer-IDE coldness.
- **Hard constraints:** a calm, dark 3D working surface where models read clearly; a **theme-able**
  design system (light & dark) with a strong default; works on Windows at common laptop resolutions;
  accessible (legible type, contrast, keyboard nav, screen-reader-sane).
- You are creating a **new** identity for TinkerQuarry — do not assume any prior product's palette.

---

## 11. Technical Context & Integration Contract (so screens match reality)

- **Front end:** a reskinned/re-laid-out build of the OpenSCAD Studio React codebase (TypeScript;
  Monaco editor, Three.js viewer + offscreen multi-view renderer, the AI tool-calling loop, the
  tree-sitter customizer parser, model selection). Extensively tested — unit + Playwright e2e + CI
  (see §13 for dated counts).
- **Back end:** a local Python pipeline (the "KimCad" engine) — part-family templates, render, mesh
  validation, hardening, orientation, printability gate, slicing, printer sending, local model
  management, image on-ramps. Extensively tested — unit suite + CI (see §13 for dated counts). All
  local; no server beyond loopback.
- **The integration contract is real, not invented.** The front end drives the back end through a
  local connector that mirrors KimCad's existing loopback HTTP/JSON API (see
  `KimCadClaude/docs/api.md`). **Design the UI states against these real API states** (this is the
  authoritative list of what's live vs to-be-built — see §13 Table C):
  - **design:** `completed · gate_failed · render_failed · plan_failed · clarification_needed ·
    model_unavailable · needs_experimental`
  - **design progress:** `planning → generating → rendering → validating`
  - **slice:** `sliced:true` or reason `no_profile · failed · stale`
  - **send:** typed result + `simulated:true` for the mock
  - **print-outcome:** `clean · issues · failed · skip` (only after a real send)
  - **printer status:** `ready · busy · offline · needs_setup`
  - **model status:** `running · model_present · vision_present`, backend `local · cloud`
  - **templates:** family catalog with `tier: benchmarked | baseline`
- **Geometry engine:** OpenSCAD, headless, under the hood; generated code is sandboxed. The user is
  never required to see OpenSCAD.

---

## 12. Non-Functional Requirements

- **Offline after local setup** — fully functional offline once the local model + tools are installed;
  initial model/tool downloads and any cloud models require network. State this honestly in the UI.
- **Private by default** — no accounts; telemetry off by default; nothing leaves the machine unless a
  cloud model is enabled; user images for on-ramps are read locally and not persisted.
- **Performance** — template/part-family re-renders effectively instant (no model call); honest
  progress for local inference; never block the UI.
- **Cross-platform, Windows-first;** also macOS/Linux desktop and a web build.
- **Security (product-visible where relevant):** loopback-only by default; an explicit warning if the
  user exposes it to the network (then it is unauthenticated by design); a per-boot session token
  guards state-changing requests (a rotated token after restart surfaces a calm "Reload"); secrets
  (cloud key, printer codes) live in the OS credential store and are **never shown**; generated code
  runs through sanitizers and arm's-length worker processes.
- **Reliability** — a failure in any stage degrades gracefully, never crashes the app, and never sends
  bad data to a printer.

---

## 13. Reality Map & Release Cut

> The most important section for execution: what already exists (and is tested), what's net-new, and
> what's MVP vs later. Design the net-new surfaces fully; reskin the reused ones; don't preserve the
> dropped ones.

### Table A — Reused / Net-new / Dropped / Deferred

| Bucket | Items |
|---|---|
| **Reused from Studio (reskin/relayout)** | Monaco code editor; Three.js 3D viewer + **offscreen multi-view renderer**; AI chat + **tool-calling loop**; **screenshot/preview capture**; tree-sitter **customizer** parser + controls; model selection (local/cloud); export. *(All tested.)* |
| **Reused from KimCad (exists + tested)** | Design pipeline + **part-family templates**; deterministic re-render; **printability gate**; mesh validation/hardening; auto-orient; **slice**; **send** (multi-protocol, mock + real); **post-print outcome**; saved designs + **portable import/export**; **managed local-model download**; **local vision** on-ramp; settings/cloud-opt-in; health; **session-token security**. *(Real HTTP API in `docs/api.md`.)* |
| **Net-new (design + build)** | The **connector** glue (KimCad API → Studio front end; started); TinkerQuarry reskin + describe-first relayout; **manufacturing-rail UI** (readiness/gate, orient, slice, send, printer manager) wired to KimCad; **visual-correction loop wired into KimCad's codegen path** + its loop UI; local-first onboarding (no provider wall); **part-family/library browser** + external-library chooser UI; **About/Licenses** surface. |
| **Dropped/hidden from Studio** | Share links / remixable public links; public web analytics (PostHog/Sentry as shipped); cloud-first setup; the editor-first default layout; multi-file-project emphasis (de-emphasized for non-coders). |
| **Deferred (post-v1)** | Real-hardware-**validated** send (beta hardening); local-vision-critique quality (spike-gated, §14); full desktop parity + code-signing across Win/mac/Linux; branching history polish; any marketplace. |

### Table B — Release cut

| Tier | Scope |
|---|---|
| **MVP** | Describe → generate (part-families + local LLM) → 3D preview → **printability gate / readiness** → **export**. Local-first onboarding + managed model download. Visual loop runs **text-only or cloud-optional**. Code view (collapsed). Customizer. Printing is optional. |
| **v1** | **Visual-correction loop with vision** (if the spike passes, local; else cloud-optional) as a first-class, visible feature; **slice**; **send to a real printer** (with first-real-send caution) + **post-print outcome**; part-family/library browser + external chooser; saved designs + import/export; full Settings incl. **About/Licenses** and **Privacy**. |
| **Later** | Branching version tree; advanced 2D/laser workflows; multi-platform desktop parity + code-signing; outcome-driven readiness learning; marketplace/sharing. |

> **On printer send (v1 vs beta):** sending a sliced job to a real printer **is a v1 feature** — the
> connector paths exist and are protocol/mock-tested. What stays **beta/hardening** is *broad real-metal
> validation* across the many printer models and firmwares. So v1 ships real send with first-real-send
> caution, and widens validated-hardware coverage over time.

### Table C — API-backed states (real vs to-be-built)

| Live now (backed by `docs/api.md`) | To-be-built (UI states not yet backed) |
|---|---|
| design statuses & progress phases; render/re-render; slice (+reasons); send (+simulated); print-outcome; printer status; model status (+vision); model-pull progress; templates catalog (+tiers); settings/cloud-opt-in; health; session-token/reload | The **visual-loop round states** (loop is being wired into the codegen path); the **external-library admit-to-sandbox** behavior (next engine slice); TinkerQuarry-specific **onboarding/reskin** states |

**Foundation confidence:** both halves verified present + tested by inspection, each shipping a
substantial unit/e2e suite + CI. *Indicative local counts as of 2026-06-21 (not a contract):* ~1,128
KimCad test functions; ~90 Studio unit-test files + Playwright e2e. Not re-executed in the authoring
environment; a live green run belongs on the 3.13 / pnpm toolchains.

> **Superseded (2026-06-21):** the real engine *has now been executed end-to-end* on the 3.13
> toolchain. The walkthrough + full gate
> (`gate-tinkerquarry-2026-06-21/gate-report.md`) ran the live describe→LLM→geometry→gate→slice
> pipeline and the rebranded SPA in-browser; the Test Engineer lane measured **frontend 405/405,
> glue 19/19, engine ~1,554 passing of ~1,667 collected** (the handful of remaining failures are
> pre-existing env/profile drift, not product bugs). The "not re-executed here" caveat above is
> historical.

---

## 14. Open Questions & Spikes (resolve in parallel; design defensively)

1. **Local vision capability for the visual-correction loop (HIGH PRIORITY, release-gating).** Local
   vision is already plumbed (the photo on-ramp uses it); the open question is whether a *local* model
   is good enough for **spatial critique**. **Test current local vision models on real render-critique
   tasks** (incl. a known-bad fixture, §6.3.1). Outcome decides whether the **v1** visual loop is fully
   local or cloud-optional — the *design* is identical either way.
2. **Local model speed on low-end hardware** (integrated-GPU mini-PCs) — sets the progress/reassurance UX.
3. **Library surfacing for small local models** — how much library capability can be advertised before
   a small model degrades; informs the "relevant libraries only" approach.
4. **Real-hardware send hardening** — connector paths are protocol/mock-tested; real-metal validation is
   beta. Informs the first-real-send caution UX.
5. **Repo/codebase scope** — how much of Studio's shell is reskinned vs replaced (engineering, not design).

---

## 15. Out of Scope (v1)

Cloud rendering; user accounts / auth; monetization; multi-user collaboration; a mobile app; a
marketplace. (Local-first single-user desktop/web is the whole product for v1.)

---

## 16. Glossary

- **Visual Correction Loop** — render the model, have the AI inspect the rendered views, and correct
  spatial errors automatically; TinkerQuarry's signature feature.
- **Printability Gate** — the deterministic check that decides whether a model is *ready* (manifold,
  walls, build-volume fit, slice proof). Authority on readiness, not a guarantee of a perfect print.
- **Readiness** — the user-facing verdict + score from the gate (+ slice proof).
- **Part family / Template** — a parametric family that emits exact geometry with no model call
  (deterministic, instant). The product primitive the user sees; tiers: benchmarked / baseline.
- **Library** — an OpenSCAD code library that gives the LLM-codegen fallback more capability; an
  implementation detail the user mostly doesn't see (seven bundled; more pluggable).
- **Manifold / watertight** — geometry that is a single solid with no holes in its surface (required to print).
- **Vitamins** — non-printed reference parts (motors, bearings, boards) used to design *around* a real component.
- **Slice / G-code** — converting the 3D model into the layer-by-layer instructions a printer runs; a
  successful slice is part of the readiness proof.
- **Connector** — the local glue layer that lets the front end drive the manufacturing pipeline (mirrors KimCad's API).
- **Local-first** — the app defaults to an on-machine AI model and works offline after setup.
- **Simulated send** — a send to the built-in mock printer; never narrated as a real print.
