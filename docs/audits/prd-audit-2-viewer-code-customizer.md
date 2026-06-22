# PRD Audit 2 — 3D Preview/Viewer (§6.4), Code View (§6.5), Customizer (§6.6)

**Date:** 2026-06-21
**Scope:** §6.4 (3D Preview & Viewer), §6.5 (Code view), §6.6 (Customizer); screens §7.6/§7.7/§7.8
**Method:** Read the *shipping* SPA at `KimCadClaude\frontend\src` + engine at `KimCadClaude\src\kimcad` + `docs\api.md`. openscad-studio (`openscad-studio\apps\ui\src`) is the *reference* whose features the PRD §13 Table A assumed would be absorbed — it was **not** shipped; the build reskinned KimCad's own SPA. A feature that lives only in openscad-studio is **MISSING from the product**.

All file:line citations are to the **shipping** tree unless prefixed `[studio]`.

---

## §6.4 — 3D Preview & Viewer

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.4 | Live orbit / pan / zoom | **PARTIAL** | `frontend\src\viewport\KCViewport.ts:520-527` (pointer-drag orbit), `:561-566` (wheel zoom), `:584-613` (arrow-key orbit, ±zoom) | **No PAN.** Orbit (spherical theta/phi) and zoom (radius) exist; there is no screen-space pan — `target` is only ever set by framing/focus, never by a user pan gesture. No middle-drag/shift-drag handler. |
| §6.4 | Preset views (front/back/top/bottom/left/right/iso) | **MISSING** | Only `resetView()` exists → fixed iso-ish pose `theta=-0.7, phi=1.15` (`KCViewport.ts:342-347`). No per-view setters; Topbar has no view controls (`components\Topbar.tsx` — grep for front/top/iso = 0 hits). | All seven named preset views. Studio has them (`[studio] three-viewer/ViewerToolPalette.tsx`); not ported. |
| §6.4 | Orthographic toggle | **MISSING** | Camera is hard-wired `new THREE.PerspectiveCamera(...)` (`KCViewport.ts:177`). No `OrthographicCamera`, no projection toggle anywhere in the SPA. | Orthographic projection entirely absent. |
| §6.4 | Wireframe | **MISSING** | The only "wireframe" is a faint bbox edge overlay (`KCViewport.ts:418-435`) and per-mesh edge lines (`:228-234`) — always on, not a toggleable mesh-wireframe mode. No `material.wireframe`/toggle. | A user-controllable wireframe display mode. |
| §6.4 | Shadows | **MISSING** | Renderer created without `shadowMap`; lights (`KCViewport.ts:180-186`) cast no shadows; no `castShadow`/`receiveShadow`/`shadowMap.enabled` in the file. | Shadows entirely absent. |
| §6.4 | Section plane | **MISSING** | No clipping plane, no `clippingPlanes`, no `localClipping` in `KCViewport.ts`. | Section/cut plane. Studio ships a full impl (`[studio] three-viewer\sectionPlaneController.ts`, `panels\SectionPlanePanel.tsx`) — not ported. |
| §6.4 | Measurement — 3D | **PRESENT** | Click-to-measure: two surface raycasts → straight-line distance + per-axis ΔX/ΔY/ΔZ in mm (`KCViewport.ts:627-667`, pure math `measureBetween` `:47-53`); UI toggle + readout `components\Viewport.tsx:191-224`. | — (3D point-to-point only; see 2D row). |
| §6.4 | Measurement — 2D | **MISSING** | No 2D/SVG measurement surface exists at all (no 2D mode — see next row). The measure tool is 3D-raycast only. | 2D measurement. |
| §6.4 | Build-plate context (part on the bed, oriented as it prints) | **PRESENT** | Z-up build orientation (`KCViewport.ts:178` `camera.up=(0,0,1)`), part centered and dropped onto z=0 plate (`:217-221`), grid + bordered plate (`buildPlate` `:382-403`), "Auto-oriented · plate-down" chip (`components\Viewport.tsx:187`). Engine exports `*.oriented.stl`. | — |
| §6.4 | 2D mode (SVG view for flat/laser designs) | **MISSING** | No SVG viewer in the shipping SPA. `KCViewport` is STL-only (`STLLoader`, `KCViewport.ts:2,203`). No `<svg>` render path, no laser/flat-design mode. | Entire 2D/SVG viewing mode. Studio has `[studio] components\SvgViewer.tsx` + `svg-viewer\` — not ported. |
| §6.4 | Feeds the visual-correction loop via OFFSCREEN MULTI-VIEW capture | **PARTIAL / single-view only** | `captureThumbnail()` grabs ONE current-frame PNG of the live canvas (`KCViewport.ts:312-332`), used only for the "My Designs" gallery thumbnail (`components\Viewport.tsx:113`). It renders the *current* camera pose — no programmatic multi-angle capture, no offscreen/headless render target. | The **offscreen multi-view capture** capability (render the part from N fixed angles into images for the AI correction loop). What exists is a single user-pose thumbnail for the gallery, not a correction-loop feed. No code in the SPA wires viewer captures back into the design pipeline. |

---

## §6.5 — Code view

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.5 | Code view HIDDEN/collapsed by default | **MISSING (vacuously)** | There is no code view to hide. The right panel's three tabs are Parameters / Quality / Export only (`components\RightPanel.tsx:617-621`). No code surface anywhere in the SPA. | The code view itself. |
| §6.5 | "Show me the code" reveals an OpenSCAD editor | **MISSING** | No "show code" affordance; grep for monaco/codemirror/editor/`.scad`/show-code across `frontend\src` = 0 real hits (only the word "editor" in comments). | The reveal affordance + editor. Studio has `[studio] components\Editor.tsx`, `EditorTabs.tsx` (Monaco) — not ported. |
| §6.5 | Full editor: syntax highlighting | **MISSING** | No editor library imported in `frontend\package.json`/`src`. | Monaco/syntax-highlighted editor. |
| §6.5 | Inline error/warning diagnostics | **MISSING** | No diagnostics surface. Studio has `[studio] components\DiagnosticsPanel.tsx` — not ported. The shipping SPA surfaces engine findings only as the Printability/Readiness cards (`RightPanel.tsx:554-611`), not as code-located diagnostics. | Inline code diagnostics. |
| §6.5 | Edit + re-run; a user edit RE-ENTERS the pipeline at validate/gate (no AI) | **MISSING** | The only deterministic (no-AI) re-entry is the **parameter** re-render (`/api/render/<id>`, `App.tsx:501-529`) — driven by sliders, not by editing source. There is no path to submit edited OpenSCAD text. | Free-form code-edit → validate/gate re-entry. |
| §6.5 | Multi-file awareness when relevant | **MISSING** | No file tree, no tabs. Studio has `[studio] components\FileTree\` + `EditorTabs.tsx` — not ported. | Multi-file editing/awareness. |
| §6.5 | (Data prerequisite) engine exposes the OpenSCAD source | **MISSING** | The engine emits `.scad` only as an internal render artifact; **no HTTP endpoint returns source**. `webapp.py` route table has mesh/gcode/step/designs/etc. but no `/api/source` or `/api/code` (`src\kimcad\webapp.py:687-690, 1046-1122`); `DesignResponse` (`api.ts:75-98`) has no `scad`/`source` field; `docs\api.md` confirms "there is no hidden surface" (api.md:5). | Even the *contract* to feed a code editor is absent — building §6.5 requires new engine API surface, not just front-end work. |

---

## §6.6 — Customizer (Parameters)

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.6 | Auto-extract the model's parameters → labeled controls with units, ranges, defaults | **PARTIAL** | Backend auto-extracts per-template params (`ParamSpec`: name/label/value/min/max/step/unit/integer/axis, `api.ts:61-73`); rendered as labeled sliders + editable numeric input with unit + range tooltip (`RightPanel.tsx:137-195`, `273-290`). **Templates only.** LLM-OpenSCAD parts get NO sliders (`RightPanel.tsx:298-323` falls back to a "no adjustable sliders, refine by chat" note). | Param extraction for **non-template / experimental (LLM-OpenSCAD)** parts. The PRD's "the model's parameters" is satisfied only for the deterministic template families; ad-hoc generated parts have zero parametric controls. |
| §6.6 | Sliders / inputs / **dropdowns** | **PARTIAL** | Sliders (`<input type=range>`) + click-to-type numeric input (`RightPanel.tsx:181-193`, `144-167`). | **No dropdown/enum control.** `ParamSpec` has no enum/choices field (`api.ts:61-73`); every param is a numeric range. OpenSCAD customizer enum dropdowns (`[a,b,c]` choices) are unsupported. |
| §6.6 | Grouped parameters | **MISSING** | Params render as one flat list — `parameters.map(...)` with no grouping (`RightPanel.tsx:278-290`). `ParamSpec` carries no `group`/`section` field (`api.ts:61-73`). | Parameter groups. Studio's customizer (`[studio] components\CustomizerPanel.tsx`, `customizer\`) groups; not ported. |
| §6.6 | Live re-render on change | **PRESENT** | Debounced (150 ms) slider/value change → `onRerender` → `POST /api/render/<id>` → new mesh swapped atomically (`RightPanel.tsx:18, 232-241`; `App.tsx:501-529`; `KCViewport.loadMesh` awaits-then-swaps so the old part stays visible, `Viewport.tsx:69-71`). | — |
| §6.6 | For templates: instant + NO MODEL CALL | **PRESENT** | `/api/render/<id>` is deterministic, no LLM (`docs\api.md:74-83`; `postRender` `api.ts:348-353`); card copy states "re-renders locally, no AI round-trip" (`RightPanel.tsx:275-276`). | — |
| §6.6 | Clamped values surfaced (engine reports which it adjusted) | **MISSING** | The engine **returns** `adjusted_params` (`{name, requested, applied}`) on `/api/render` per `docs\api.md:80-82`, **but the client drops it**: `DesignResponse` has no `adjusted_params` field (`api.ts:75-98`), `handleRerender` just `applyResult(next)` with no adjusted-value handling (`App.tsx:509-512`), and nothing in `RightPanel.tsx` renders a "we adjusted X" notice. The slider silently re-syncs to the server value via the `parameters` effect (`RightPanel.tsx:219-225`) — the user is never told a value was clamped. | The surfacing/notification. The data is on the wire; the UI throws it away. Client-side typed-input clamping (`clampToSpec`, `RightPanel.tsx:26-29`) is silent too. |

---

## Summary

- **Counts (20 requirements):** PRESENT **5** · PARTIAL **5** · MISSING **10**.
- **§6.4 Viewer (12):** 2 PRESENT (3D measure, build-plate), 3 PARTIAL (orbit/zoom w/o pan; single-view thumbnail not offscreen-multi-view; param-only context), 7 MISSING (preset views, ortho, wireframe, shadows, section plane, 2D/SVG mode, 2D measure).
- **§6.5 Code view (5+1):** entirely MISSING — there is **no OpenSCAD editor, no "show me the code," no diagnostics, no edit/re-run of source**; the engine doesn't even expose the `.scad` over HTTP, so this is an engine + front-end build, not a reskin.
- **§6.6 Customizer (6):** the live-rerender spine is solid (PRESENT: live re-render, instant/no-model-call), but extraction is **template-only**, controls are numeric-only (**no dropdowns, no groups**), and **clamped values are silently swallowed** despite the engine reporting them.
- **Biggest gap:** §6.5 is a hard zero against a whole PRD section — the assumed absorption of OpenSCAD Studio's Monaco editor + tree-sitter customizer + offscreen multi-view ThreeViewer never happened, and the §6.4 viewer is a single-purpose print-preview (orbit/zoom/measure) missing every "studio-grade" control (presets, ortho, wireframe, shadows, section, 2D). The §6.4 **offscreen multi-view capture that feeds the visual-correction loop** is the most consequential single miss: it is a load-bearing PRD mechanism for the AI self-correction loop, and only a single user-pose gallery thumbnail exists.
