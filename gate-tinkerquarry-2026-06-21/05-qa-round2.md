# GauntletGate Round 2 — QA Engineer re-audit — TinkerQuarry (real runtime)

**Date:** 2026-06-21 · **Role:** QA Engineer (runtime API / protocol / CLI)
**Target:** real `kimcad web --demo` 0.9.3 on http://127.0.0.1:8765 · code @ `KimCadClaude@da65bc8` (HEAD = round-1 fix commit)
**Method:** PowerShell `Invoke-WebRequest` + `System.Net.Http.HttpClient` (to read 4xx bodies reliably; not CORS-bound) against the live server, plus source confirmation in `src/kimcad/webapp.py`, `docs/api.md`, and `backend/mock_api.py`.
**Audit-only:** no product code modified. Token scraped from the page shell `<meta name="kimcad-session-token">`.

## Severity counts — **0 / 0 / 0 / 0 / 0**
- Blocker: 0
- Critical: 0
- Major: 0  (QA-1 fixed + verified)
- Minor: 0  (QA-2 fixed + verified)
- Nit: 0   (QA-3 fixed + verified)

All three round-1 findings are fixed at runtime AND in the docs. No new protocol issue found this round. **QA is at 0.**

---

## Round-1 fix verification (runtime evidence)

### QA-1 (was Major) — settings rejects unknown/typo'd fields — **FIXED ✓**
`webapp.py:1775-1784` now computes `unknown = [k for k in data if k not in known_fields]` and 400s before merging (mirrors `_handle_connections_post`). `known_fields = {default_printer, default_material, cloud_enabled, cloud_model, openrouter_api_key, experimental_enabled}`.

```
POST /api/settings {"defualt_printer":"x"}            -> 400 {"error":"Unknown settings field(s): defualt_printer."}
POST /api/settings {"bogus_field":"x"}                -> 400 {"error":"Unknown settings field(s): bogus_field."}
POST /api/settings {"default_printer":"bambu_p2s","bogus":1} -> 400 {"error":"Unknown settings field(s): bogus."}   (mixed known+unknown)
POST /api/settings {"default_material":"pla"}         -> 200  saved=true, default_material=pla        (VALID field still saves)
POST /api/settings {"default_printer":"bambu_p2s"}    -> 200  saved=true
POST /api/settings {"experimental_enabled":false}     -> 200  saved=true
POST /api/settings {"default_material":"PLA"}         -> 400  (bad VALUE — "PLA" is the display name; key is "pla")
POST /api/settings {"default_printer":null}           -> 200  (null clears override)
POST /api/settings {"reset":true}                     -> 200  saved=true
POST /api/settings {"reset":true,"junk":1}            -> 200  (reset short-circuits before the unknown-field check — documented special verb; defensible)
POST /api/settings {}                                 -> 200  saved=true (empty no-op)
POST /api/settings (no X-KimCad-Session)              -> 403  {"reason":"session"}
```
Confirmed: unknown field → 400 (no more silent `saved:true`); valid field still 200 `saved:true`.

### QA-2 (was Minor) — print-outcome unknown rid → 404, api.md documents 404-vs-409 — **FIXED ✓**
```
POST /api/print-outcome/999  {"outcome":"clean"} -> 404 {"error":"That design is no longer available."}
POST /api/print-outcome/abc  {"outcome":"clean"} -> 404 {"error":"That design is no longer available."}
POST /api/print-outcome/99999 {"outcome":"banana"} -> 400 (bad outcome value rejected too)
```
`docs/api.md:131-141` now spells out both refusals explicitly: **404** = unknown `<rid>` (checked first; "an arbitrary/probed id lands here"), **409** = known design but no real non-simulated send. The doc and code now agree; the 409 path is reachable only for a known rid (correct).

### QA-3 (was Nit) — health recheck query parsing + cross-origin wording — **FIXED ✓**
`webapp.py:990-1008` now parses `wants_recheck = bool(parse_qs(urlsplit(self.path).query).get("recheck"))` instead of exact-matching the full path.
```
GET /api/health?recheck=1                       -> 200  (same-origin; re-probe triggered)
GET /api/health?x=y&recheck=1                    -> 200  (extra/ordered param still parses recheck)
GET /api/health                                  -> 200  (cached, no re-probe)
GET /api/health?recheck=1  Sec-Fetch-Site:cross-site -> 200 cached (skips the side-effecting re-probe, returns cached health — NOT a 403)
GET /api/step/nonexistent  Sec-Fetch-Site:cross-site -> 403 (real side-effecting build IS hard-refused — contrast holds)
```
`docs/api.md:262-264` reworded: health recheck "**skips only the side-effecting CPU re-probe** for a cross-origin caller and still answers 200 with cached health... The protected invariant is 'no cross-origin-triggered re-probe,' not refusing the response outright." Distinguished from `/api/step` hard-403. Accurate.

### New (ENG-MIN-2) — `/api/health` returns `external_binaries` — **CONFIRMED ✓**
`webapp.py:1508-1526`. Shape: a JSON array of tool names whose resolved path is OUTSIDE the install root (the silent-repoint vector), surfaced as health status not just a stderr warning.
```
GET /api/health -> {"version":"0.9.3","openscad":true,"orcaslicer":true,"cadquery":false,"external_binaries":["openscad","orcaslicer"]}
```
Field is always present (empty list when all binaries are in-root). On this box both bundled binaries resolve outside the install root (system/portable layout), so both are listed — correct, honest behavior.

### model_loading (ENG-NIT-3 / W-1) — shape confirmed
```
GET /api/model-status -> {"model":"qwen2.5:7b","backend":"local","vision_model":"qwen2.5vl:3b","running":true,"model_present":true,"model_loading":false,"vision_present":true}
```
`model_loading = bool(running and not present)` disambiguates the transient {running:true, present:false} from {running:false}. (Note: this box has the real local model installed, so `model_present:true` even under `--demo`; `--demo` skips the LLM *call*, not the presence probe.)

---

## Safety invariants — re-verified, ALL HOLD (tried to break them)

**Session token on every state-changing POST.** 403 without `X-KimCad-Session`, accepted with the page-shell token.
```
POST /api/design   (no token)   -> 403   POST /api/design  token="deadbeef" -> 403   token="" -> 403
POST /api/slice/1  (no token)   -> 403   POST /api/send/1  (no token)       -> 403   POST /api/settings (no token) -> 403
403 body: {"error":"Missing or invalid session token. Reload KimCad.","reason":"session"}  (typed reason:"session" for the SPA Reload banner)
```

**slice/send refuse no-design / gate-failed.**
```
POST /api/slice/99999 {}              -> 404 {"error":"Design the part first, then send it to a printer."}
POST /api/send/99999  {"confirm":true} -> 404 {"error":"Slice the part first, then send it to a printer."}
```
Gate-failed parts fail **closed** in both `_handle_slice` and `_handle_send` server-side (source: `gate_status` default "fail"; both return `{sliced/sent:false,"reason":"gate_failed"}` regardless of client claims) — re-confirmed from `webapp.py`.

**send requires confirm:true.** `POST /api/send/99999 {}` → 404 (no-design check fires first, refuses either way). Source `webapp.py` + `mock_api.py:129-131` both require explicit `confirm:true` (`reason:"unconfirmed"`) before a real send.

**print-outcome 404/409 unless a real send.** Unknown rid → 404; known-but-not-really-sent → 409 (source + api.md). A simulated `mock` send never unlocks an outcome (`send` records real only when `not connector.drives_hardware`).

**oversize → 413.** `POST /api/design` with a ~1.1 MiB body → 413 (drained).

**empty/garbage prompt handled (never 500).**
```
POST /api/design {"prompt":"   "} -> 400 {"error":"Please describe the part you want."}
POST /api/design {}               -> 400
POST /api/design "hello"          -> 400  (non-object body)
POST /api/design {not json        -> 400 {"error":"Request body isn't valid JSON."}
```

**Connector simulated semantics (honesty).**
```
GET /api/connector-status/mock      -> 200 {"simulated":true, ...}
GET /api/connector-status/bambu_p2s -> 200 {"simulated":false,"ready":false,"reason":"config", ...}  (secret never echoed)
```

---

## Mock ↔ real parity (`backend/mock_api.py`)
Safety-critical contracts mirror: 404 unknown design (slice/send), 409 print-outcome no-real-send, `confirm:true` required (`reason:"unconfirmed"`), `simulated` semantics. **Minor parity gap (mock side, not the shipping product):** the mock has only a GET `/api/settings` (no POST), so the round-2 settings-400 path is not modeled in the mock; the mock `/api/health` (line 177) also omits the new `external_binaries` field. These are diagnostic/honesty surfaces, not safety gates, and the mock is a deliberately partial frontend dev double. Worth a one-line note for frontend devs but not a defect in the runtime under audit.

---

## What I could NOT exercise live this session
- **Live gate-FAIL → slice/send refusal end-to-end:** confirmed by source (fail-closed in both handlers) and the no-design 404s; a fresh gate-failed design was not generated this run (`--demo` skips the LLM). Walkthrough lane proved gate-PASS end-to-end; oversize/unprintable covered by prior `output/tq-adv-toobig` artifact + code path.
- **Real hardware send / non-simulated print-outcome unlock:** no real printer configured (`bambu_p2s` → `reason:config`); simulated-vs-real verified by connector status + source, not a hardware send.
- **`/api/photo-seed` / `/api/sketch-seed` 422 unreadable-image path:** token-gated (403 without it); the 422 shape not exercised.

These are environmental limits (no printer, demo mode), not gaps in the fixes. None affects the round-1 fix verification or the safety invariants, all of which are confirmed.
