# PRD Audit 4 — Onboarding, Part Families/Libraries, Projects/History, Export, Settings

**Scope:** PRD v0.3 §6.1, §6.11, §6.12, §6.13, §6.14 and screens §7.1/§7.2/§7.14/§7.15/§7.16/§7.17.
**Method:** Line-by-line read of the reskinned KimCad SPA (`frontend/src`), the KimCad engine (`src/kimcad`), and the TinkerQuarry connector glue (`tinkerquarry/backend`). Status = PRESENT / PARTIAL / MISSING with file:line evidence.

> **Top-line:** Onboarding and the managed model download are genuinely strong. The three biggest PRD gaps in this scope are all "honesty" failures: (1) the **seven bundled OpenSCAD libraries do not exist** — there is no BOSL2/threads/rounding/enclosure/bin library vendored anywhere; (2) the **external-library chooser is a dead registry** — its own code says it is not wired to the renderer, and the SPA has no UI for it at all; (3) the **third-party-licenses / GPL source-availability surface is a one-line string**, not a viewable attribution surface with upstream links. Version history, restore, and the iteration log are also largely absent from persisted designs.

## §6.1 — First-run, onboarding & local-model setup

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.1 | Detect local runtime + report running / model-present / **vision-present** | **PRESENT** | `FirstRunWizard.tsx:27-41` (`modelLabel`/`modelTone` read `running`/`model_present`/`vision_present`); `model_advisor.probe_ollama` via `/api/model-status` | — |
| §6.1 | Just-work if a usable model is present (no config screen) | **PRESENT** | `FirstRunWizard.tsx:236-237` `modelOk`; wizard is skippable (`:269`) and only blocks on a dead model in the recap | — |
| §6.1 | Managed one-click download, **fixed server-defined set** | **PRESENT** | `model_pull.py:5-8` (list "fixed to KimCad's own two models, never caller-supplied"); `:171-221` `start_setup`; wizard `beginPull` `FirstRunWizard.tsx:108-134` | — |
| §6.1 | **Disk-space check** before download | **PRESENT** | `model_pull.py:146-158` (per-model pre-check) and `:250-261` (cold-path pre-check, engine+models); friendly message with the fix | — |
| §6.1 | **Per-model download progress** (status/completed/total) | **PRESENT** | `model_pull.py:160-163,374-382` (per-layer monotonic %); rendered `FirstRunWizard.tsx:384-408` | — |
| §6.1 | **Slow/large download reassurance** | **PRESENT** | `FirstRunWizard.tsx:411-417,563-567` ("designing in words works now — the photo & sketch reader is still downloading"); `:357` no total timeout | — |
| §6.1 | **Recoverable failure + retry** | **PRESENT** | `model_pull.py:85-96,328-331` friendly per-model errors; retry `FirstRunWizard.tsx:376-404` ("try again") | — |
| §6.1 | **Done** state | **PRESENT** | `FirstRunWizard.tsx:396` (`✓ done`), re-probe `:120-123` so "Ready" is measured | — |
| §6.1 | Cloud-key path, **labeled advanced** | **PRESENT** | `FirstRunWizard.tsx:422-459` (`<details>` "Advanced — cloud speed-ups", masked password input, off-machine disclosure) | — |
| §6.1 | **Tool health check** (OpenSCAD / slicer / CAD-exchange) + "check again" | **PARTIAL** | Health probe exists in **Settings only** — `SettingsPanel.tsx:677-763` (OpenSCAD/OrcaSlicer/CadQuery rows + "check again" `:733`). The **first-run wizard performs NO tool health check** — `FirstRunWizard.tsx` never imports `getHealth`; grep shows only a printer "no slicer profile" note (`:493`) | The §7.1 First-run screen is required to show tool health + "check again"; it is absent from the wizard. A first-run user with no OpenSCAD/slicer gets no guidance until they design and fail, or stumble into Settings. |
| §6.1 / §7.2 | Example prompts always shown on the entry surface (not gated behind AI config) | **PRESENT** | `Landing.tsx:15-37` (`EXAMPLES`), rendered `:164-176`; Landing renders independent of model status | (Examples are on Home/Landing, not the wizard — that satisfies the PRD's "entry surface" intent.) |

## §6.11 — Part families, templates & libraries

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.11 | Browsable catalog of part **families** | **PRESENT** | `LibraryModal.tsx:9-141` (searchable grid from `/api/templates`); families are pure data `templates.py:114-165` | — |
| §6.11 | Honesty **tiers** (benchmarked / baseline) | **PRESENT** | `templates.py:137-143` (`tier: Literal["benchmarked","baseline"]`); surfaced `LibraryModal.tsx:89-127` ("Verify before use" for baseline) | — |
| §6.11 | Families are the product primitive + parameters (not raw libraries) | **PRESENT** | `LibraryModal.tsx:84-87,116` (pick → seed prompt → normal flow); `templates.py:166-200` `TemplateMatch`/`emit_scad` | — |
| §6.11 | **SEVEN bundled OpenSCAD libraries always available** (foundation + rounding + threads/fasteners + enclosures + insert/countersink + bin + mechanical-primitives) | **MISSING** | The only `.scad` on disk is KimCad's **own** 16 hand-written modules under `library/` (`library/manifest.yaml:5-177`: box, bracket, fasteners, fillets, mounts, hooks, clips, containers, holders, organizers, frames, hangers, dishes, parts). **No BOSL2, no threads.scad, no NopSCADlib, no third-party library is vendored** — `find` for `*bosl*`/`*libraries*` returns nothing | The PRD's seven *named* third-party-style OpenSCAD libraries do not exist. KimCad's hand-rolled modules are real and auto-wired, but they are not "the seven bundled libraries" the PRD (and STRATEGY-RECON's "planned" note) describe. This is a vendoring gap, not just a UI gap. |
| §6.11 | Auto-wired includes (user doesn't pick) | **PARTIAL (for the modules that DO exist)** | `openscad_runner.py:151-181` `inject_library_uses` auto-prepends `use <library/FILE.scad>` for KimCad's own modules; manifest injected into the codegen prompt `system_openscad.md:78-90` | Auto-wiring works for KimCad's modules; but since the seven PRD libraries are absent, the "only the relevant library capabilities surfaced per prompt" promise is over the wrong (missing) corpus. |
| §6.11 | **External library chooser** (advanced: point at a folder, view bundled, add/enable external) | **MISSING (dead registry)** | `tinkerquarry/backend/connector.py:59-94` `FileLibraryStore` — its own docstring (`:62-66`) says it "owns the *registry* … **Actually admitting those roots to the renderer — extending `openscad_runner`'s `library/` allowlist and `OPENSCADPATH` — is the next slice**". The renderer hard-codes `_APPROVED_PREFIX = "library/"` and strips any `use`/`include` outside it (`openscad_runner.py:38-43,116-129`) — external roots are **never admitted**. The chooser is exposed only as MCP tools (`connector.py:301-382`), **not via any `/api` route or SPA component** (grep of `api.ts` shows no `getLibraries`/`addLibrary`) | The external-library chooser is (a) not wired to the renderer sandbox, and (b) has no in-app UI whatsoever. It is a JSON-file registry reachable only by an MCP client. PRD §6.11/§6.14/§7.15 all require an in-app "manage libraries" surface; none exists. |

## §6.12 — Projects, history & versions

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.12 | Save designs | **PRESENT** | `design_store.py:156-200` `DesignStore.save`; `/api/designs/save`; auto-save UX `MyDesigns.tsx:329-331` | — |
| §6.12 | Reopen recent (a "recent" surface on entry) | **PRESENT** | `MyDesigns.tsx:201-351` (grid, search, sort newest); `reopenDesign` `api.ts:676` | — |
| §6.12 | **Version / iteration history**, viewable, incl. **each visual-correction round** | **PARTIAL** | An **in-session** version rail exists — `VersionRail.tsx:5-88` (v1,v2… pills, undo/redo, compare), fed by App-side snapshots `App.tsx:59,338-348`. But these are **conversation-thread snapshots held in React state**, not persisted: `DesignVersion` = `messages` + result (`api.ts:277-285`). `DesignStore` persists **one** snapshot per design (`design_store.py:32` `_DESIGN_FILES = ("meta.json","mesh.stl","thumb.png")`) and `save` **overwrites** it. Visual-correction rounds are **not** captured as versions. | Versions vanish on reload/reopen (only the latest persists). No per-round (visual-loop) history. PRD wants "every meaningful iteration including each visual-correction round retained and viewable." |
| §6.12 | User can **restore** a previous version | **PARTIAL** | In-session only: `VersionRail` `onSwitch` steps the live rail; refining from a prior version **truncates** forward history (`App.tsx:339` "branching replaces forward history") | No restore of a *persisted* prior version (none are saved). Restore is lost on reopen. |
| §6.12 | Branching desirable | **MISSING** | `App.tsx:339` explicitly: "future versions are truncated (branching replaces forward history)" — refining from an older version **destroys** the newer ones rather than branching | Branching is the opposite of implemented; it is destructive truncation. |
| §6.12 | **Iteration log** view (what was tried, gate verdict, visual-loop findings) | **MISSING** | No iteration-log component exists (no file matches). `history.py:86-142` `HistoryStore` is a **print-outcome learning** store (`PrintRecord`: clean/issues/failed), not a design-attempt log. The visual-loop's per-round views/findings/verdict (PRD §6.3.1 "Logging") are not surfaced anywhere in the UI | No view of attempts, gate verdicts per round, or visual-loop findings/fixes. |

## §6.13 — Export & portable designs

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.13 | Export `.stl` | **PRESENT** | `ExportPanel.tsx:205-208` ("Download 3D model (.STL)"); `/api/mesh/` `webapp.py:1046` | — |
| §6.13 | Export `.3mf` | **PRESENT** (post-slice only) | `ExportPanel.tsx:323-331` ("Download print file (.3mf)"); `/api/gcode/` `webapp.py:1051` | Only available **after** a successful slice, not as a standalone format pick. |
| §6.13 | Export `.step` (CAD-exchange when engine present) | **PRESENT** (conditional) | `ExportPanel.tsx:209-213,223-234`; gated on CadQuery health `SettingsPanel.tsx:677-742`; `/api/step/` `webapp.py:1054`. Honest "experimental generator parts export .STL only" `:235-243` | Requires CadQuery install; correctly disclosed. |
| §6.13 | Export `.scad` source | **MISSING** | No `.scad` download in `ExportPanel.tsx`; no `/api/scad` route (`webapp.py` route grep). The `.scad` is written to disk server-side (`openscad_runner.py:296`) but never offered to the user | The PRD explicitly lists `.scad` source export. The code-view drawer is out of this audit's components, but no export affordance exists. |
| §6.13 | Export rendered `.png` | **MISSING** | No PNG export in `ExportPanel.tsx`; thumbnails (`thumb.png`) are saved for the gallery (`design_store.py:32`) but there is no "download PNG" affordance and no `/api/png` route | Listed format absent. |
| §6.13 | Export `.svg` / `.dxf` for 2D designs | **MISSING** | No 2D export anywhere; the only `.svg` reference is a static-file MIME entry (`webapp.py:85`), not a route. No `.dxf` anywhere in the engine | 2D (laser/flat) export listed in PRD is entirely absent. |
| §6.13 | Explain formats for non-experts | **PARTIAL** | `ExportPanel.tsx:214-243` explains STL/STEP/3MF well | The formats that exist are explained; the missing ones (scad/png/svg/dxf) have nothing to explain. |
| §6.13 | **Portable design export + re-import** | **PRESENT** | Export `.kimcad` zip `design_store.py:250-267`, `MyDesigns.tsx:158-165`; import `design_store.py:269-297`, `MyDesigns.tsx:240-258`; honest "backup, not a printable STL" tooltip `MyDesigns.tsx:162` | — |

## §6.14 — Settings sub-screens

| PRD ref | Requirement | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.14 | **AI engines:** local + vision status | **PRESENT** | `SettingsPanel.tsx:356-444` (model health, vision row) | — |
| §6.14 | AI engines: managed download (re-entry to wizard) | **PRESENT** | `SettingsPanel.tsx:654-667` ("Run the setup walkthrough again — the guided model download lives there") | — |
| §6.14 | AI engines: cloud key **masked only** | **PRESENT** | `SettingsPanel.tsx:531-550` (masked read-only + Replace/Remove); storage disclosed `:590-597` | — |
| §6.14 | AI engines: **per-task model choice** (e.g., stronger model for the visual loop) | **MISSING** | `SettingsPanel.tsx` exposes one cloud model slug (`:600-624`) and one local model. No per-task (chat vs visual-loop vs vision) model selection | The "a stronger model for the visual loop" control is absent. |
| §6.14 | **Printers:** add/edit/remove/test/default, secrets never shown | **PARTIAL** | Default `SettingsPanel.tsx:278-291`; edit + secret-as-env-var (never shown) `ConnectionsCard.tsx:147-160`. | **No remove** (`ConnectionsCard` only edits the fixed server-listed connections — `connector.py`/`/api/connections`; no add-new-printer, no delete). **No explicit "test connection"** button — status is passive (`configured`/`note`), not a user-triggered test. The card only renders for printers already known server-side (`ConnectionsCard.tsx:50`). |
| §6.14 | **Appearance:** theme light + dark | **PRESENT** | `SettingsPanel.tsx:312-327` (Light/Dark/System); `useTheme` token inversion | — |
| §6.14 | **Libraries:** view bundled, add/remove/enable external | **MISSING** | There is **no Libraries section in `SettingsPanel.tsx`** (section IDs `:112-115` have no `set-libraries`; no nav group). The only library code is the dead MCP registry (§6.11) | The entire Settings → Libraries sub-screen (§7.14 names it explicitly) does not exist. |
| §6.14 | **Privacy:** telemetry OFF by default + credential-storage disclosure | **PARTIAL** | Credential storage **is** disclosed (`SettingsPanel.tsx:590-597`, `FirstRunWizard.tsx:452-456`). Telemetry is effectively off (no analytics/posthog/sentry in `src/kimcad` — grep clean; the one "telemetry" hit is a "telemetry-free" comment in `ollama_runtime.py:178`). | **No Privacy sub-screen exists** — §7.14 names "Privacy" as a required sub-screen with explicit controls. There is no telemetry toggle, no privacy card. The good news (no telemetry shipped) is undisclosed to the user. |
| §6.14 | **About / Licenses:** version + **third-party licenses & attribution viewable in-app, WITH links to source/upstream repos** (GPL source-availability) | **MISSING (one-line string only)** | `SettingsPanel.tsx:770-777`: the About card shows `v{version} · open-source (GPL-2.0)` — a **single literal string**. There is **no third-party-licenses surface**, no attribution texts, no upstream/source links, no `/api/licenses` route, no LICENSES component (grep clean) | This is a likely **GPL-2.0 compliance gap**: the PRD (and the license itself) require viewable license texts + attributions for OpenSCAD, the front-end base, and the bundled libraries, **with links to corresponding source**. Only a bare "GPL-2.0" label is shown. |
| §6.14 | **Advanced/Developer:** show-code default · visual-loop max rounds · gate override · experimental toggle | **PARTIAL** | **Experimental generator toggle PRESENT** — `SettingsPanel.tsx:630-653`. The other three are **MISSING** from Settings: no show-code-default control, no visual-loop-max-rounds control (the budget exists in the engine per §6.3.1 but isn't user-settable here), no gate-override control (per-design `proceed_anyway` exists at the connector `connector.py:347` and the export path, but there is no Settings developer toggle) | 3 of 4 Advanced/Developer controls are absent from the Settings UI. |

## Screen-inventory cross-check (§7.1/§7.2/§7.14/§7.15/§7.16/§7.17)

| Screen | Status | Note |
|---|---|---|
| §7.1 First-run/Setup | **PARTIAL** | Strong model-download flow; **missing the tool-health + "check again" panel** the screen spec requires. |
| §7.2 Welcome/Home | **PRESENT** | Describe input, example chips (`Landing.tsx:164-176`), recent designs, browse families, works with no AI configured. |
| §7.14 Settings | **PARTIAL** | Missing sub-screens: **Libraries**, **Privacy**, **About/Licenses** (real licenses surface), and most of **Advanced/Developer**. |
| §7.15 Part-family / Library browser | **PARTIAL** | Family browser with tiers is good (`LibraryModal.tsx`); **external-library chooser is entirely absent** from the UI. |
| §7.16 Projects/History | **PARTIAL** | Recent + portable export/import present; **version history, restore, branch, and iteration log are missing from persisted designs** (in-session only / absent). |
| §7.17 Export dialog | **PARTIAL** | STL/STEP/3MF with good explanations; **.scad/.png/.svg/.dxf missing**. |

---

## Summary (5 lines)

1. **Onboarding is the strongest area:** the managed one-click model download is real and complete — fixed server set, disk-space pre-check, per-model progress, slow-download reassurance, recoverable retry, and a measured "done" (`model_pull.py`, `FirstRunWizard.tsx`). The one gap is no tool-health/"check again" panel in the wizard itself (it lives only in Settings).
2. **The "seven bundled OpenSCAD libraries" do not exist** — no BOSL2/threads/rounding/enclosure/bin/etc. is vendored anywhere; `library/` holds KimCad's own 16 hand-written, auto-wired modules instead (`library/manifest.yaml`). STRATEGY-RECON's "planned" status still holds.
3. **The external-library chooser is a dead registry:** `FileLibraryStore` (connector.py) is a JSON file whose own docstring states it is **not** admitted to the renderer (the `OPENSCADPATH`/allowlist work is "the next slice"), and it has **no SPA UI** — it is reachable only as MCP tools.
4. **Version history / restore / branching / iteration log are largely missing:** versions are in-session React snapshots that don't persist; `DesignStore` overwrites a single snapshot; branching is destructive truncation; there is no iteration-log view of attempts, gate verdicts, or visual-loop findings.
5. **Two compliance/honesty gaps stand out:** (a) Export lists `.scad/.png/.svg/.dxf` but only STL/STEP/3MF exist (no 2D export at all); (b) the **About/Licenses GPL source-availability surface is a bare "GPL-2.0" string** with no in-app license texts, attributions, or upstream-source links — plus there is no Settings → Libraries or → Privacy sub-screen at all.
