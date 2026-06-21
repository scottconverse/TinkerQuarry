# GauntletGate report — TinkerQuarry — Slice 1 (backend glue)

**Date:** 2026-06-21 · **Build/commit:** f83bbc6 · **Run by:** Claude (Opus 4.8)
**Lanes run:** `lite` · **Lanes NOT run:** walkthrough, full
**How run / environment:** local; Python 3.12 (the real KimCad engine needs 3.13 + OpenSCAD and is
NOT runnable here). Backend tests executed; seam verified in a real browser against the mock API.

---

## Verdict (read first)

> ⚠️ **PARTIAL CHECK** — lanes run: `lite`. This is **not** an advancement gate. Run
> `gauntletgate all` for a clear-to-advance decision.

- **First-run:** **N/A** for product onboarding (this slice has no user-facing first-run surface —
  it is glue/library/API). Dependency-absent dimension audited (below). First-run coverage: N/A.
- **Severity roll-up (lite):** Blocker 0 · Critical 0 · Major 1 · Minor 3 · Nit 1
- **One-line why:** the glue is sound and the frontend↔backend seam is genuinely proven in-browser,
  but it is proven against a **mock**; the real pipeline's safety invariants are not runtime-verified
  here, and the connector's dependency-absent path errors raw.

---

## Environment provisioning (attestation)

| What | State used | How VERIFIED |
|---|---|---|
| Profile / app-data isolation | n/a (no app-data writes in slice) | mock_api + connector are stateless-per-process; no config written |
| First-run flags | n/a | no onboarding surface in this slice |
| External dependency: **KimCad engine** | **ABSENT** | not importable on this 3.12 box; the real pipeline needs 3.13 + native deps |
| External dependency: **OpenSCAD / OrcaSlicer** | **ABSENT** | not installed here |
| Data store | empty / per-process | mock resets state per run (verified: rids restart at 1 across restarts) |
| Network | offline-capable | mock is stdlib loopback; seam ran with no outbound internet (CDN libs vendored locally) |

**Isolation verified?** N/A (no first-run product surface) · **First-run coverage:** N/A (reasoned)
**Evidence artifacts:** backend test output (17/17, captured in session); browser console of the seam
run (6/6 checks `OK`, captured via `preview_console_logs`); `frontend/_seam/index.html` (the runnable
proof).

---

## Lane results — Lite

**TL;DR:** ship the slice as a *foundation* (it's honest, tested glue) — but it is not a working
product and must not be presented as one. No Blocker/Critical.

### Findings

**[M-1] Major · Correctness/Dependency — connector's dependency-absent path errors raw.**
`backend/connector.py` `__init__` eagerly calls `_default_printer_server()` when no server is
injected, which does `from kimcad.mcp_server import PrinterMCPServer`; `main()` also imports
`kimcad.config`. With the KimCad engine absent, `python -m backend.connector` raises a raw
`ModuleNotFoundError`, not a clear "KimCad engine not found — install it / point at it" message.
TinkerQuarry also declares no dependency-on-KimCad or discovery path. *Blast radius:* anyone running
the connector for real without KimCad installed hits an unhelpful traceback. *Fix:* wrap the engine
imports and raise a typed, actionable error; document the KimCad dependency + path in STATUS. (The
*protocol* layer is fine — fully tested via injected fakes.)

**[m-2] Minor · Docs — README links a file that doesn't exist.** `README.md` references
`docs/STATUS.md`, which is not yet created. *Fix:* create STATUS.md (planned this session).

**[m-3] Minor · UX/Honesty — the design mockup is an unwired scripted demo.**
`frontend/index.html` runs a hard-coded demo sequence (timers in the `dc-script`), not real backend
calls. Nothing on screen signals "not connected." Risk: it looks like a working app. *Fix:* document
clearly (STATUS) that the design is the *visual reference*; the seam is the proven plumbing; wiring
them is a later slice.

**[m-4] Minor · Security-hygiene — mock uses permissive `*` CORS.** Acceptable for a clearly-labeled
mock (`X-TinkerQuarry-Mock`, loopback bind), but it must **never** become the real server's pattern.
The real KimCad correctly uses loopback + a per-boot session token. *Fix:* note in STATUS; do not
copy mock CORS into production.

**[n-5] Nit — `frontend/_seam/` is a committed dev artifact.** Fine to keep; exclude from any
production build.

### Escalation recommendation
**Not required now** (0 Blocker, <3 Critical, root cause not architectural). **Do** run
`walkthrough`+`full` when the **real KimCad integration** lands (connector production path + the
product's local-model onboarding) — that is where first-run reachability and the real safety
invariants (gate-before-slice, confirm-before-send, simulated-never-narrated-real,
outcome-only-after-real-send) need adversarial **runtime** verification on the 3.13 box. Right now
those invariants are verified only in the **mock** (9/9 tests) + the real engine's own 1,128 tests —
not in an integrated runtime.

---

## Blocking punch list (must clear to advance)
None (no Blocker/Critical). This is a PARTIAL CHECK; advancement is not on the table from a lite run.

## Next-stage watchlist
- **[M-1]** Harden the connector's dependency-absent error + declare/locate the KimCad dependency.
- Wire the real design UI to `api-client.js` (replace the scripted demo) — the next integration slice.
- When integrated, gate with `walkthrough full` on the 3.13 + OpenSCAD machine (real first-run +
  real safety invariants).

## What's working (credited, specific)
- **Mock API faithfully encodes the safety invariants** and is unit-tested 9/9: gate-failed → no
  slice; not-sliced/unconfirmed → no send; mock send flagged `simulated:true`; print-outcome `409`
  unless a real (non-simulated) send happened.
- **Connector is a clean MCP superset** of the printer server, composed via the public protocol,
  tested 8/8 (initialize, tools/list superset, design dispatch, library chooser, printer delegation,
  error paths).
- **The frontend↔backend seam is genuinely proven** — a real browser, offline, through
  `api-client.js` to the mock API: health, local-first model status, design→gate-pass→readiness 96,
  visual-correction result surfaced, slice, simulated send — **6/6 `OK`** in the console. That's an
  integration proof, not a claim.

---

## Sign-off checklist
- [x] Verdict matches lanes run (lite → PARTIAL CHECK, not CLEAR TO ADVANCE).
- [x] Attestation filled; first-run marked **N/A** with reason (no product onboarding in this slice);
      dependency-absent dimension audited (→ M-1).
- [x] First-run reachability stated (N/A — no Blocker hidden behind it).
- [x] No `full`/`all` lane claimed.
- [x] The one Major has evidence, blast radius, fix path.
- [x] What's-working present (not all-red).
