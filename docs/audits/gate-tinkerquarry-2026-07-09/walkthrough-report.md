# GauntletGate walkthrough lane — TinkerQuarry v1.4.0 — 2026-07-09

**Build under test:** installed `TinkerQuarry_1.4.0_x64-setup.exe` (built this day from
`release/v1.4.0-prep`), silent-installed into `%TEMP%\TQGateInstall`.
**Method:** launched the installed exe with isolated profile env
(`LOCALAPPDATA`/`APPDATA`/`TINKERQUARRY_APPDATA_DIR` → fresh temp dirs) + WebView2 CDP; states
captured to JSON + PNG artifacts in `artifacts/`.

## Environment attestation

| What | State used | How VERIFIED |
|---|---|---|
| Profile / app-data isolation | fresh temp dirs per phase | app wrote `TinkerQuarryAppData\engine-output\engine.log` inside each phase's temp profile (paths in each `walkthrough-*.json`) |
| First-run flags | unset (fresh profile) | fresh dirs created per phase; app-data absent before launch |
| External dependency: Ollama (local model runtime) | ABSENT (processes killed), NOT INSTALLED (install dir renamed), and PRESENT v0.31.1 — one phase each | HTTP probe of `127.0.0.1:11434/api/version` before/after each phase, recorded in each JSON (`ECONNREFUSED` vs `{"version":"0.31.1"}`) |
| Data store | PARTIALLY clean — engine-side designs/recents read the real `Documents\TinkerQuarry` (not covered by env isolation) | "My Designs"/"Recent" showed this machine's data in captures; a true new machine has none. Caveat, not a product defect |
| Network | online | downloads observed progressing |

**Isolation verified?** YES for app-data/profile (engine.log paths captured); data-store cell
carries the caveat above. **First-run coverage: VALID** (with the stated caveat).
**Caution from early phases:** runs 1–3 were contaminated by a leftover engine process reusing
state across profiles (that engine also healed/reused system Ollama). Phases `notinstalled4`
and `present` were run with verified-clean port/process state and are the authoritative cells.

**Evidence artifacts:** `artifacts/walkthrough-{absent,notinstalled,notinstalled2,notinstalled3,notinstalled4,present}.json`,
`artifacts/first-run-*.png`, `artifacts/after-setup-click-notinstalled.png`, `artifacts/after-submit-present.png`.

## Provisioning matrix (cells walked)

| Cell | Result |
|---|---|
| first-run × Ollama NOT INSTALLED × online | ✅ guided: "Local AI setup needed … Set up local AI"; Build correctly disabled; one click starts the portable-runtime download, which progressed 0→953 MB in 210 s into the run's own isolated profile (timeline in `walkthrough-notinstalled4.json`) |
| first-run × Ollama installed-but-stopped | ✅ the app/engine auto-started the system Ollama (probe: absent at launch → present after; `walkthrough-absent.json`) |
| first-run × Ollama PRESENT | ✅ "Local AI ready"; real prompt → real LLM design run → workspace with verified dimensions (30×30×30), printability 68/100, correct Send-gated-on-slice rail (`walkthrough-present.json`) |
| model download run to completion | NOT walked (bounded at 4 min; ~1 GB runtime + ~7 GB models). Risk assessed low — standard pull path — but unproven here |
| returning user | NOT walked in this lane (save/reopen/branch covered by the release Playwright suite) |
| offline | NOT walked — the audit agent runs on this machine's network and cannot sever it |

## First-run verdict

**Reaches core feature: ✅.** A new user with nothing set up is guided (not dead-ended): Build is
gated with a working one-click setup path; with the model present the core prompt→design→workspace
flow completes against the real engine.

## Findings

- **W-1 · Major · UX/wiring** — During the multi-minute "Set up local AI" runtime download, the
  status box shows only a static "Setting up..." — no percent, no phase, no bytes — for the entire
  download (timeline: 8 samples over 210 s, text never changed while disk grew 0→953 MB). The UI
  has a `welcome-model-pull-progress` element and the engine tracks completed/total bytes for the
  engine row, so this is a progress-wiring gap. A wide-beta user will read minutes of silent
  "Setting up..." as a hang and quit. Fix: surface the engine-row progress (percent or MB) in the
  welcome status during setup. Impact: every new user without Ollama (the wide-beta default).
- **W-2 · Major · copy/first-run** — The engine-unreachable error branch renders source-checkout
  developer instructions (`py -3.13 -m venv .venv`, `pip install -r requirements.lock`,
  `kimcad.exe web --port 8765 --demo`) inside the INSTALLED app (`walkthrough-notinstalled.json`
  `clickSetup.finalStatusText`; screenshot `after-setup-click-notinstalled.png`). Trigger in this
  audit involved harness contention, but the branch is reachable in production (engine crash, port
  conflict) and its copy is wrong for installed-app users. Fix: platform-gate the copy — installed
  app says "restart TinkerQuarry / Check again"; dev steps only in source checkouts
  (`WelcomeScreen.tsx` SOURCE_ENGINE_STEPS branch).
- **W-3 · Minor · audit-harness fidelity** — Env-var profile isolation does not cover the
  engine-side designs/recents root (real `Documents\TinkerQuarry` leaked into "first-run"
  captures), and a surviving engine process can be silently reused across runs. Affects test
  harnesses (incl. `smoke-tauri-runtime.mjs`), not end users. Fix: harness kills stray engines and
  asserts port-free before launch; optionally an env override for the designs root.
- **W-4 · Minor · panel state** — In the workspace after a successful design run, the editor-side
  AI panel showed "Local or cloud AI not connected" while the model was demonstrably connected
  (the design had just generated; welcome status said ready). Stale/incorrect connection state on
  a visible panel. Needs a look at the panel's status wiring (`walkthrough-present.json`
  `rootTextAfter`).

## Readiness by area

| Area | State |
|---|---|
| First-run guidance (model absent) | working, with W-1/W-2 fixes needed |
| One-click local AI setup | working (download verified progressing; completion not walked) |
| Core prompt→design→workspace | working against the real engine |
| Manufacturing rail gating | correct (Send blocked until slice; readiness surfaced) |
| Isolation/self-heal of engine+Ollama | working (auto-start observed) |
