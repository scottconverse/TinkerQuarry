# GauntletGate — Full lane — Engineering RE-AUDIT (round 2) — TinkerQuarry

**Role:** Principal Engineer (architecture, correctness, security, performance, provenance, deps/licensing)
**Date:** 2026-06-21 · **Mode:** audit-only (read product code, no modifications)
**Targets:** `KimCadClaude` @ `da65bc8` (verified HEAD) · `tinkerquarry` @ `fdd73d1` (verified HEAD)
**Round-1 report verified against:** `gate-tinkerquarry-2026-06-21/01-engineering.md`

## Severity counts

| Severity | Count |
|---|---|
| Blocker | 0 |
| Critical | 0 |
| Major | 0 |
| Minor | 1 |
| Nit | 2 |

The 7 round-1 findings are **all genuinely fixed** (verified in code, not just claimed). Re-audit
of the security/gate/provenance core found **no regressions** — the security-critical files were not
touched by the relicense commit and all round-1 "what's working" invariants still hold. However, the
relicense (ENG-M-1) was **incomplete in three shipping artifacts**, and the new engine-side connector
re-introduced the exact ENG-NIT-2 serialization bug. None are exploitable; the domain is **not** at a
clean 0 — it is at **0/0/0/1/2**.

---

## Round-1 findings — verification

### ENG-M-1 (license) — CONFIRMED FIXED, with a residual (see ENG-R2-MIN-1)

- `KimCadClaude/LICENSE` = full **GNU GPL Version 2, June 1991** (338 lines, standard text). ✓
- `pyproject.toml:17` `license = { text = "GPL-2.0-only" }`. ✓
- `THIRD_PARTY_LICENSES.md` exists and is **accurate and thorough**: documents OpenSCAD
  (GPL-2.0-or-later), OrcaSlicer (AGPL-3.0), Ollama/Qwen, the vendored SCAD libs (all
  GPLv2-compatible), and the Python/npm deps with correct aggregation-vs-combined-work reasoning. ✓
- GPL-2.0 reasoning **holds**: the combined work absorbs the GPL-2.0-only OpenSCAD-Studio front-end,
  which forces GPL-2.0 on the whole (THIRD_PARTY_LICENSES.md:7-11, README:500-507, hygiene test). ✓
- The round-1 "bundled binaries" concern is reconciled: `tools/` is **gitignored**
  (`.gitignore:15`) and **no binaries are git-tracked** (`git ls-files tools/` is empty) — the GPL
  engines are fetched from upstream at install time, not redistributed in the repo, matching the
  THIRD_PARTY_LICENSES §3 claim. ✓
- Regression guard added: `tests/test_project_hygiene.py:10-25` asserts GPL-2.0-only + GPL license
  text + THIRD_PARTY_LICENSES presence. ✓
- First-party **source/docs Apache scan is clean** *except* the residual below. (Apache hits in
  `.venv313/` are third-party deps; hits in `docs/audits/**` are historical audit records — both
  correctly out of scope.)

### ENG-M-2 (mock hardening) — CONFIRMED FIXED (one Nit, see ENG-R2-NIT-2)

`tinkerquarry/backend/mock_api.py:235-248` `serve()` now refuses non-loopback bind via
`_is_loopback` (`:231`) raising `SystemExit`, and prints a two-line `[DEV-ONLY] unauthenticated`
banner. Guard is correct for the realistic case (`0.0.0.0` is refused). ✓

### ENG-MIN-1 (ImportError) — CONFIRMED FIXED

`tinkerquarry/backend/connector.py:193` and `:209` both now `except ImportError as e` (broader than
`ModuleNotFoundError`), routed through `_engine_missing`. A broken-but-present engine install now
gets the friendly message. ✓

### ENG-MIN-2 (external_binaries on /api/health) — CONFIRMED FIXED, correct

`webapp.py:1496-1515` adds a `_tool(name) -> (present, outside_install_root)` helper using the real
static method `Config._within_install_root` (`config.py:201`), and emits
`"external_binaries": [...]` (`:1526`). **No leak/misreport:** it reports only the binary *names*
(`"openscad"`, `"orcaslicer"`), never the resolved path; a nonexistent binary raises and is caught to
`(False, False)` so it is correctly *not* listed as an external repoint. ✓

### ENG-MIN-3 (static-cache cap) — CONFIRMED FIXED

`webapp.py:751` `_STATIC_CACHE_MAX = 256`; both write sites (`:1221`, `:1259`) `clear()` on overflow
before insert. Clear-on-full (not LRU) but a valid structural bound on a fixed asset set. ✓

### ENG-NIT-1 (recheck query parse + import-shadowing) — CONFIRMED FIXED, clean

`webapp.py:990` now matches `self.path.split("?",1)[0] == "/api/health"` and computes
`wants_recheck = bool(parse_qs(urlsplit(self.path).query).get("recheck"))` (`:995`), gating the
re-probe on `wants_recheck and not self._is_cross_site()` (`:1002`). **Import-shadowing
specifically re-checked and clean:** `parse_qs/unquote/urlsplit` are imported **only** at module
level (`:41`); there is **no** function-local `urllib` import anywhere in `do_GET` (grep-verified) —
so the prior `UnboundLocalError`-on-every-GET footgun cannot recur. ✓

### ENG-NIT-2 (gate.findings vs gate.messages) — CONFIRMED FIXED in tinkerquarry; RE-INTRODUCED in engine (see ENG-R2-NIT-1)

`tinkerquarry/backend/connector.py:133-136` now reads `gate.findings` first and stringifies
`m.message`, falling back to `messages`. Verified against the real shape
(`printability.py:53-61`: `Finding.message`, `GateResult.findings`). MCP clients get real reasons. ✓

### ENG-NIT-3 (model_loading) — CONFIRMED FIXED

`webapp.py:1734` `payload["model_loading"] = bool(running and not present)` disambiguates the
server-up-but-model-pulling transient from server-down. ✓

---

## New / residual findings

### ENG-R2-MIN-1 (Minor) — The relicense missed the user-facing "Apache-2.0" label in the shipping SPA and the user manual

**Category:** dependencies/licensing (consistency) · residual of ENG-M-1
**Evidence:**
- `KimCadClaude/frontend/src/components/SettingsPanel.tsx:775` — the in-app **About** card renders
  `{health ? ... : ''}open-source (Apache-2.0)`. This TS source was **NOT touched** by the relicense
  commit `da65bc8` (the commit edited `FirstRunWizard.tsx`/`Landing.tsx`/`Topbar.tsx` for rebrand,
  but missed the actual license string here).
- `src/kimcad/web/assets/kimcad.js` (git-**tracked**, served to every user) still contains the
  compiled string `open-source (Apache-2.0)` — the bundle was not rebuilt from corrected source
  (and the source isn't corrected anyway).
- `docs/USER-MANUAL.md:568` — "KimCad is open source under Apache-2.0."
- (Lower concern, untracked build artifact: `src/kimcad.egg-info/PKG-INFO:6,41,533` still says
  Apache-2.0 — regenerated on build, not committed.)
- (Stale design docs, informational: `docs/design/KimCad-Unified-Product-Spec-v3.0.md:44,68`,
  `docs/design/stage-8.5-slice-5-onramps.md` — design records, not a license declaration.)

**Observed vs expected:** The binding `LICENSE` file is correctly GPL-2.0, but the **canonical
in-product license statement** (the About panel a user actually reads) and the user manual still
assert Apache-2.0 — directly contradicting the license. ENG-M-1's headline was "pick one license
story and document it consistently"; this is the one place a user sees it, and it's still wrong.
**Severity:** Minor (user-facing labeling defect, ships in the bundle; not exploitable and the
authoritative LICENSE is correct, so not Major).
**Fix:** Change `SettingsPanel.tsx:775` and `USER-MANUAL.md:568` to `GPL-2.0`, **rebuild the SPA**
so `web/assets/kimcad.js` no longer carries the stale string, and add a frontend/asset grep test for
the license label so the source and bundle can't drift again (the hygiene test guards LICENSE/pyproject
but not the SPA text).

### ENG-R2-NIT-1 (Nit) — The NEW engine-side connector `src/kimcad/connector.py` re-introduces the exact ENG-NIT-2 bug

**Category:** correctness (connector serialization)
**Evidence:** `KimCadClaude/src/kimcad/connector.py:131` (a 387-line file **added in the same
`da65bc8` commit** that fixed ENG-NIT-2 on the tinkerquarry side) does
`"messages": list(getattr(gate, "messages", []) or [])`. `GateResult` exposes `findings`, not
`messages` (`printability.py:61`), so this connector **always serializes an empty `messages`** — an
MCP client driving `python -m kimcad.connector` gets `gate.status` but never the gate's finding
reasons. Identical silent-data-loss bug to round-1 ENG-NIT-2, masked by the same defensive `getattr`.
**Fix:** Apply the same fix used in `tinkerquarry/backend/connector.py:133-136` — read
`gate.findings` first and map `[str(getattr(f,"message",f)) for f in ...]`.
**Note (safety OK):** This connector is stdio JSON-RPC only (no network bind/socket), passes
`confirm_print=False` (`connector.py:305`), and delegates printer tools unchanged to the gate-clean
`PrinterMCPServer` — so the fail-closed never-auto-send posture is preserved; only the reason
serialization is lossy.

### ENG-R2-NIT-2 (Nit) — `mock_api._is_loopback("")` treats empty-host bind as loopback, but `""` binds all interfaces

**Category:** security (mock seam) · residual sharp edge on ENG-M-2
**Evidence:** `tinkerquarry/backend/mock_api.py:232` `_is_loopback` returns `True` for `""`, and
`serve(host="")` would pass the guard and bind `ThreadingHTTPServer(("", port))` — which is
`INADDR_ANY` (**all** interfaces), not loopback. Reaching it requires a caller to explicitly pass
`host=""` (the default is `127.0.0.1` and `__main__` calls `serve()` with no args), so exposure is
low — hence Nit, not a re-open of ENG-M-2.
**Fix:** Drop `""` from `_is_loopback`, or normalize `""`→`127.0.0.1` before the loopback check.

---

## Verified fixed (round-1 → confirmed in current code)

| ID | Finding | Status |
|---|---|---|
| ENG-M-1 | KimCad relicensed Apache-2.0 → GPL-2.0 + THIRD_PARTY_LICENSES | **FIXED** (residual ENG-R2-MIN-1) |
| ENG-M-2 | mock_api refuses non-loopback + dev banner | **FIXED** (nit ENG-R2-NIT-2) |
| ENG-MIN-1 | connector catches `ImportError` | **FIXED** |
| ENG-MIN-2 | `/api/health` reports `external_binaries` | **FIXED**, correct, no leak |
| ENG-MIN-3 | static-cache explicit cap | **FIXED** |
| ENG-NIT-1 | recheck parses query; no import-shadowing | **FIXED**, re-verified clean |
| ENG-NIT-2 | tinkerquarry connector reads `gate.findings` | **FIXED** (re-introduced in engine: ENG-R2-NIT-1) |
| ENG-NIT-3 | model-status adds `model_loading` | **FIXED** |

ENG-MIN-4 (CPU-inline inference) and the round-1 "What I could NOT assess" items were UX/perf notes,
not defects, and remain as previously characterized.

---

## What's working (re-verified, no regression)

The security/gate/provenance core was **not touched** by either fix commit
(`git show da65bc8 -- src/kimcad/{config,design_store,openscad_runner,pipeline,printability}.py` →
all untouched). Re-confirmed intact on current code:

1. **Session-token / CSRF model** — per-boot `secrets.token_urlsafe(32)` (`webapp.py:2759`),
   constant-time `hmac.compare_digest` (`:1408`), 405-before-403 ordering (`:1405`), `no-store`
   shell with the bearer token, `Sec-Fetch-Site` guard on side-effecting GETs (`:1108`,`:1126`). The
   ENG-NIT-1 edit did not weaken any of this.
2. **Non-loopback bind refused** at `cli.py` (exit 2 without `--allow-remote`), `_ExclusiveBindServer`.
3. **Printability gate fails closed at two boundaries** — slice refused for `gate_status=="fail"`
   (`:2516`), send refused belt-and-suspenders (`:1902`), and a reopened/imported `.kimcad` is
   **re-gated from the actual mesh** (`_regate_mesh`, `:2357`) with the verdict synced into the
   returned report (`:2394`); unknown gate state defaults to `"fail"` (`:2194`,`:2358`). A bad part
   cannot reach slice.
4. **Untrusted-codegen boundary** — `openscad_runner.sanitize_scad` (block-not-strip), scrubbed env,
   pinned `OPENSCADPATH`, isolated temp cwd — untouched.
5. **`.kimcad` import is zip-slip / zip-bomb safe**, **cloud allow-list derived from shipped config**,
   **vision always local** — all in untouched `design_store.py`/`config.py`.
6. **New `src/kimcad/connector.py`** introduces **no new network surface** (stdio JSON-RPC only),
   composes the gate-clean printer server, and is `confirm_print=False`.
7. **`/api/settings` now 400s on unknown fields** (`webapp.py:1778`, QA-1) — bonus fix, prevents
   silent `saved:true` config-intent loss.

## What I could NOT assess

- **Runtime/pen-test** — static audit only; no live crafted-request firing. Findings are code-evidenced.
- **Full SPDX/obligations review** of every fetched binary + transitive npm tree — out of scope; the
  in-tree THIRD_PARTY_LICENSES is accurate as written but not externally SPDX-verified.
- **Whether `kimcad.js` was rebuilt from current TS otherwise** — I confirmed the stale license string
  in both source and bundle; I did not diff the full minified bundle against a fresh build.
