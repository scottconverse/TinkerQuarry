# GauntletGate — full lane — Technical Writer deep-dive — TinkerQuarry (real runtime)

**Date:** 2026-06-21 · **Role:** Technical Writer (docs / README / architecture / manual / marketing accuracy + honesty)
**Build:** KimCadClaude@0.9.3 (engine), tinkerquarry rebranded SPA · audit-only (read, no modify)
**Scope read:** `tinkerquarry/docs/STATUS.md`, `prd/TinkerQuarry-PRD-v0.3.md`, `gauntletgate-slice1-lite-v0.1.md`,
`tinkerquarry/README.md`, `tinkerquarry/LICENSE`; `KimCadClaude/docs/api.md`, `README.md`,
`ARCHITECTURE.md`, `LICENSE`; consumed `gate-tinkerquarry-2026-06-21/walkthrough.md`. Verified counts
against the live repo (pytest collect, grep).

## Severity counts

| Severity | Count |
|---|---|
| Blocker | 0 |
| Critical | 0 |
| Major | 3 |
| Minor | 4 |
| Nit | 3 |

**One-line verdict:** The rewritten STATUS.md is *mostly* honest and well-caveated about the real
end-to-end run, and api.md is an accurate contract — but STATUS.md ships a **materially wrong test
count** (243 vs the real ~1,688 / 1,128), there is a **license-framing contradiction** (engine is
Apache-2.0, the product docs call the whole thing GPL-2.0 with no reconciliation), and the
**KimCad↔TinkerQuarry relationship is never explained for a reader** even though the repo, CLI, engine,
and protocol identifiers are all still `kimcad`. None are blockers; all are fixable in docs.

---

## Findings

### D-1 (Major) — STATUS.md test count is materially wrong (243 vs ~1,688)
**Evidence:** `tinkerquarry/docs/STATUS.md:19` — the toolchain table asserts
`KimCad imports; **243 core-engine tests pass**`. Reality: `pytest --collect-only` in
`KimCadClaude` collects **1,688 tests** (1,128 `def test_` functions; the difference is
parametrization). The project's *own* PRD agrees with reality, not with STATUS:
`prd/TinkerQuarry-PRD-v0.3.md:497` says *"~1,128 KimCad test functions."* So STATUS.md contradicts both
the ground truth and a sibling doc, understating the suite by ~5–7×.
**Why it matters:** The gate explicitly cares about honesty, and STATUS.md is the document that "just
claims the real engine runs here." A reader cross-checking the headline number finds it off by a
large factor — which *undermines* the otherwise-true claim. (Ironically, the true number is far more
impressive.) A wrong specific number is worse than no number.
**Fix:** Replace "243" with the verified count (e.g. "1,128 engine test functions / 1,688 collected
cases pass") or cite the PRD figure. If "243" was a partial/subset run (e.g. a single module), label
it as such ("243 in the slice/connector suite"), don't present it as the whole engine.

### D-2 (Major) — License framing contradicts the engine's actual license, unreconciled
**Evidence:** `tinkerquarry/LICENSE` is **GPL-2.0**; `tinkerquarry/README.md:38-41` and
`PRD §6.14 / §11` frame the product as **GPL-2.0** ("combines GPL-2.0 components … therefore licensed
GPL-2.0"). But the engine it depends on, `KimCadClaude/LICENSE`, is **Apache-2.0**, and
`KimCadClaude/README.md:500-505` states *"Core: Apache-2.0 … bundled engines invoked as separate
subprocesses, never linked: OpenSCAD (GPL-2.0), OrcaSlicer (AGPL-3.0) … their licenses do not attach
to KimCad's own code."* The two repos assert **opposite** copyleft conclusions about the same
subprocess-isolation architecture, and nothing in the TinkerQuarry docs explains the difference.
**Why it matters:** Licensing is a correctness claim a downstream user relies on. A reader sees the
product is GPL-2.0 but the engine it bundles/depends on is Apache-2.0 with an explicit "GPL does not
attach" argument — they cannot tell which framing governs redistribution. This is exactly the kind of
"stated as settled but actually unresolved" claim the gate should flag.
**Fix:** Add one paragraph (STATUS or README "Reuse / license") reconciling it: TinkerQuarry's GPL-2.0
arises from the **OpenSCAD-Studio-derived front-end runtime** it *links/embeds* (not from the
arm's-length engine), whereas KimCad's engine stays Apache-2.0 because it only *invokes* GPL/AGPL tools
as subprocesses. State explicitly which license governs the combined TinkerQuarry distribution and why.

### D-3 (Major) — The KimCad ↔ TinkerQuarry relationship is never explained for a reader
**Evidence:** The product is "TinkerQuarry," but the engine, the repo (`KimCadClaude`), the CLI
(`kimcad web`, `kimcad design`), the data dir (`~/.kimcad`, `%LOCALAPPDATA%\KimCad`), the portable
design file (`.kimcad`), and the protocol identifiers (`X-KimCad-Session`, meta
`kimcad-session-token`) are all `kimcad`. There are **104** `KimCad`/`kimcad`/`.kimcad` references
across the tinkerquarry repo. The docs mention "the KimCad engine" in passing
(`README.md:6-7,20-34`, `PRD §2,§11`, `STATUS.md`) but **nowhere** is there a short, explicit "what is
KimCad vs TinkerQuarry" statement — e.g. *"TinkerQuarry is the product; KimCad is its internal engine
and CLI; you will see the name `kimcad` in commands, file paths, and headers — that is expected."*
**Why it matters:** A first-time reader following STATUS.md's run instructions types
`KimCadClaude\.venv313\Scripts\kimcad.exe web` for a product called "TinkerQuarry," lands on a UI that
says TinkerQuarry, but every command, log line, and saved-file extension says `kimcad`. With no
orientation sentence, this reads as either an unfinished rebrand or two different products. The
walkthrough itself straddles both names ("`kimcad web` (real engine)… rebranded SPA," walkthrough.md:3).
**Fix:** Add a 3–4 line "TinkerQuarry & KimCad" box at the top of README/STATUS: product = TinkerQuarry;
engine/CLI/protocol = KimCad (intentionally retained internally); list the identifiers a user *will*
correctly still see as `kimcad` (CLI verb, `~/.kimcad`, `.kimcad` files, `X-KimCad-Session`).

### D-4 (Minor) — STATUS.md "remaining" list contradicts the walkthrough's "rebrand done" claim
**Evidence:** `STATUS.md:58-64` "What remains" lists item **2. TinkerQuarry reskin/rebrand — apply the
TinkerQuarry visual design + name to KimCad's functional SPA … this is the cosmetic/branding layer**
as *not done*. But the walkthrough (walkthrough.md:51-55, and line 4 "rebranded+rethemed SPA")
**credits the rebrand+retheme as rendering correctly on the real engine** ("title/wordmark/palette").
STATUS also still says (line 35) the UI is "the absorbed Studio-derived front-end" with no mention the
reskin landed.
**Why it matters:** Same document era (both 2026-06-21) disagree on whether the rebrand is done. A
reader can't tell if the TinkerQuarry skin exists yet. Minor because it under-claims (lists done work
as remaining), not over-claims — but it's still a status inaccuracy.
**Fix:** Update STATUS.md "What remains" to reflect that the reskin/retheme has landed in the
tinkerquarry SPA (per walkthrough), or scope item 2 to whatever rebrand work genuinely remains.

### D-5 (Minor) — STATUS.md run instructions are partially non-reproducible as written
**Evidence:** `STATUS.md:52-54` gives `KimCadClaude\.venv313\Scripts\kimcad.exe web --port 8765`.
Verified: `.venv313` and `kimcad.exe` exist, `config/local.yaml` exists, and OpenSCAD resolves to
`…\CODE\_tools\openscad\openscad-2021.01\openscad.exe` (pytest emits a warning that this is *outside*
the install root). But the commands are **bare relative paths with no `cd`/working-dir anchor**, and
the offline-dev block (`STATUS.md:45-46`) references `python scripts/dev.py`, `backend/tests/
test_connector.py`, `backend/tests/test_mock_api.py` — those live in the **tinkerquarry** repo while
the `kimcad.exe` paths live in **KimCadClaude**, with no statement of which directory each command runs
from. A fresh reader doesn't know the two-repo layout.
**Why it matters:** "Can a reader reproduce the runtime from the docs?" — partially. The pieces exist
and are correct, but the missing working-directory context and the unstated two-repo split make it a
trial-and-error reproduction rather than a clean copy-paste.
**Fix:** State the repo root for each block ("from `C:\…\KimCadClaude`:" / "from `C:\…\tinkerquarry`:"),
and note that OpenSCAD/OrcaSlicer live under `..\_tools` per `config/local.yaml`.

### D-6 (Minor) — Stale/orphaned cross-references in the lite report and STATUS
**Evidence:** `gauntletgate-slice1-lite-v0.1.md:60` flags **[m-2] "README links a file that doesn't
exist" (docs/STATUS.md)** — now resolved (STATUS exists), so the lite report is stale but is the most
recent gate doc a reader will find next to it. Separately, `STATUS.md` and README link
`prd/TinkerQuarry-PRD-v0.3.md` and `KimCadClaude/docs/api.md` (both exist ✓), but the PRD's
"Foundation confidence" (`PRD:495-498`) hedges *"Not re-executed in the authoring environment"* —
which is now **out of date**, since the walkthrough *did* execute the real engine end-to-end.
**Why it matters:** A reader triaging the gate folder sees a lite report still listing a fixed issue
and a PRD still saying "not executed here" after it has been executed. Low harm, but erodes trust in
the doc set's currency.
**Fix:** Add a one-line "superseded by the 2026-06-21 walkthrough (real runtime executed)" note to the
PRD's Foundation-confidence paragraph and to the lite report's m-2.

### D-7 (Minor) — STATUS.md asserts `kimcad web` serves "the full functional SPA" but the rebranded face is untested
**Evidence:** `STATUS.md:35-37` claims the real web UI "serves the full functional SPA (the absorbed
Studio-derived front-end)… verified in-browser." The tinkerquarry `frontend/` that carries the
TinkerQuarry rebrand is a Claude-Design composition (`Main Workspace.dc.html`, `index.html`, vendored
React/Babel) with **zero test files** (`find frontend -name "*.test.*" → 0`). The 405-ish frontend
test suite the project elsewhere relies on is the **KimCadClaude** SPA (`KimCadClaude/frontend`, ~388
unit cases), i.e. a *different* front-end than the rebranded face the walkthrough screenshotted.
**Why it matters:** "Full functional SPA … verified" can be read as "the TinkerQuarry-skinned UI is
test-covered." It isn't — the skinned composition is visually verified (walkthrough), the *engine's*
SPA is unit-tested. The distinction should be explicit so no one over-reads UI test coverage. (The
prompt's expected "405 frontend tests" claim does **not** actually appear in STATUS.md — good; STATUS
makes no frontend test-count claim, which is the honest choice.)
**Fix:** In STATUS, distinguish "the rebranded SPA (visual composition, screenshot-verified)" from "the
engine's React SPA (unit-tested)"; don't let "full functional SPA verified" imply test coverage of the
skin.

### D-8 (Nit) — `.kimcad` / `~/.kimcad` portable-file naming will confuse a TinkerQuarry user
**Evidence:** `KimCadClaude/README.md:111`, `api.md:160` — saved designs persist to `~/.kimcad/
designs/` and export as a portable `.kimcad` file. Correct to keep internally, but a TinkerQuarry user
who exports a design gets a `.kimcad` file with no doc explaining it's "a TinkerQuarry portable
design."
**Fix:** One line wherever export is documented for TinkerQuarry: "exports as a `.kimcad` portable
design file (the engine's format)."

### D-9 (Nit) — Marketing one-liner promises the visual-correction loop; STATUS confirms it's not wired
**Evidence:** `tinkerquarry/README.md:3,7-8` and `PRD §1,§2` lead with *"Watch it get built, checked,
**and corrected**"* / "the AI looks at what it built and fixes spatial mistakes" as the signature.
`STATUS.md:58-63` and `PRD §13 Table C` are honest that the **visual-correction loop is net-new / being
wired into the codegen path** (not yet live). The walkthrough exercised describe→plan→gate→slice but
**not** a visual-correction round.
**Why it matters:** The top-line marketing promise is the one core feature that doesn't run yet. The
PRD/STATUS caveat it correctly, but README's hero copy states it as present-tense capability.
**Fix:** Soften README hero to target-state framing ("designed to watch, check, and correct") or add a
"(in progress)" marker consistent with PRD §13, so the headline matches the reality map.

### D-10 (Nit) — Prompt-referenced `STRATEGY-RECON.md` does not exist
**Evidence:** The audit brief lists `tinkerquarry/…/STRATEGY-RECON.md` as a top-level doc to read; it
is **absent** (`glob **/*.md` returns only README, STATUS, PRD, the lite report, the walkthrough).
**Why it matters:** Not a product defect, but if any doc or hand-off references STRATEGY-RECON.md, that
link is dead. Flagging so the gate owner knows it wasn't skipped — it isn't there.
**Fix:** None required; confirm whether it was renamed/never-committed.

---

## api.md accuracy vs the real endpoints (cross-check)

`KimCadClaude/docs/api.md` is **accurate**. Every endpoint the walkthrough exercised, and every other
endpoint in the contract, resolves in `src/kimcad/webapp.py`:

| api.md endpoint | In webapp.py | Walkthrough used |
|---|---|---|
| `POST /api/design` | ✓ (l.1410, 1450+) | ✓ |
| `GET /api/design/progress/<id>` | ✓ (l.1453+) | ✓ (progress UI) |
| `GET /api/model-status` | ✓ (l.954) | ✓ (model_present:false) |
| `GET /api/health` | ✓ (l.987-993) | ✓ (openscad/orcaslicer true) |
| `GET /api/options` | ✓ (l.948) | ✓ |
| `GET/POST /api/settings` | ✓ (l.951, 781) | ✓ |
| render / slice / send / print-outcome / mesh / gcode / step / designs* / connectors / connector-status / templates / connections / photo-seed / sketch-seed / model-pull(+progress) | all ✓ | (covered earlier runs) |

The session-token description in api.md (§Security, `X-KimCad-Session`, meta `kimcad-session-token`,
constant-time compare, 403, GET-exemptions, `--allow-remote` honesty) matches `webapp.py:1378-1400`
and `ARCHITECTURE.md:231-241` exactly. **No drift found.** The `X-KimCad-Session` /
`kimcad-session-token` / `.kimcad` identifiers are **correct to keep** — they are wire/at-rest protocol
names; renaming them would be a breaking change for no gain. The only doc gap is *explaining* them to a
TinkerQuarry reader (D-3), not changing them.

## Honest caveats present? (credited)

The doc set is, on balance, **honest** about the hard parts:
- **Mock vs real** is clearly separated (STATUS "Offline dev" §, README architecture diagram, the lite
  report's m-3 explicitly flagging the unwired demo).
- **Physical printer deliberately deferred** is stated repeatedly and consistently (STATUS one-liner +
  item 1; PRD §6.10 / §13; both READMEs; ARCHITECTURE).
- **Vision model** honestly marked not-yet-pulled (STATUS item 3) and capability-vs-quality split is
  well-reasoned (PRD §14 spike).
- **Walkthrough self-grades PARTIAL** on isolation and flags W-1/W-2 honestly.
- **KimCad README "Beta notes — honest status"** is exemplary: unsigned installer/SmartScreen, mock-vs-
  metal connector validation, 0/0/0/0/0 gate framing.

## What's working (docs)

- **api.md is a faithful, drift-free contract** — every documented endpoint exists; security model
  matches the implementation line-for-line.
- **ARCHITECTURE.md (KimCad)** is unusually thorough and accurate (module map matches `src/kimcad/`),
  and its trust-boundary / fail-closed prose matches the code.
- **The real end-to-end claim is substantially TRUE** — `.venv313`, `kimcad.exe`, `config/local.yaml`,
  and the `_tools/openscad` path all verified present; pytest collects 1,688 cases; the toolchain cells
  in STATUS's table check out. STATUS's headline ("full software pipeline runs end-to-end on this box")
  is corroborated by the walkthrough and the filesystem.
- **Caveats are present and largely honest** (mock/real, physical-printer, vision, partial isolation).

## Couldn't assess
- Did not execute the frontend Vitest or Playwright suites (no live `405` figure to confirm; the claim
  isn't in STATUS anyway). Did not re-run the full headless `design --slice` chain in this audit
  (relied on the walkthrough's evidence + filesystem verification). `STRATEGY-RECON.md` absent (D-10).
