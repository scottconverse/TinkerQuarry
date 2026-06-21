# TinkerQuarry — build status

**As of:** 2026-06-21 · **Commit:** slice 1 (`f83bbc6`) + gate fixes
**Honest one-liner:** the **glue is built and tested**, the **UI now fetches from the backend** on
load, and the **seam is proven in a real browser** — but **no real geometry runs yet**: the backend
is the **mock**, and the live engine needs a Python-3.13 + OpenSCAD machine this build box is not.

---

## What runs and is verified (here, today)

| Piece | Evidence |
|---|---|
| **Backend connector** (`backend/connector.py`) — KimCad's pipeline + printers as one MCP surface | **8/8** protocol tests pass (py3.12, injected fakes) |
| **Mock KimCad API** (`backend/mock_api.py`) — dependency-free, api.md-shaped | **9/9** tests pass; encodes the real safety invariants (gate→slice, confirm→send, simulated flagging, outcome-only-after-real-send) |
| **API client** (`frontend/api-client.js`) | exercised live by the seam check |
| **Frontend↔backend seam** (`frontend/_seam/`) | **6/6 checks `OK`** in a real browser, offline: health · local-first model status · design→gate-pass→readiness 96 · visual-correction result · slice · simulated send |
| **Design composition** (`frontend/index.html`) | renders standalone (vendored React/Babel in `frontend/vendor/`) |

Run the backend tests:
```
python backend/tests/test_connector.py
python backend/tests/test_mock_api.py
```

## What does NOT run here (needs the target machine)

The **real KimCad engine** — actual geometry, the printability gate, hardening, orientation,
slicing, and printer sending — requires **Python 3.13 + OpenSCAD** (and OrcaSlicer for slicing,
Ollama for local AI). This build box is Python 3.12 with none of those, so:

- **No real part is generated, validated, sliced, or sent here.** Every backend response you've
  seen so far is from the **mock**.
- The **seam is proven against the mock**, which proves the *frontend↔backend wiring and shapes* —
  **not** the real pipeline's behavior. The real pipeline enforces the same invariants and is
  covered by KimCad's own 1,128-test suite, but that has **not** been run in an integrated
  TinkerQuarry runtime yet.

## Honest caveats (from the slice-1 gate)

- **The design now fetches from the backend on mount** (slice 2 — `frontend/index.html` calls
  `api-client.js`, verified in console: `[TinkerQuarry wired] backend OK …`). Live backend data now
  shows in the UI — slice 4 added an `engine: …` status badge (`mock · qwen2.5:7b · gate pass` when
  up, `offline` when the backend is unreachable, both DOM-verified) — and the first interactive
  control is wired: slice 5 makes clicking **Slice to G-code** call `/api/slice` and reflect the
  result (`Sliced ✓ · 1h 12m · 18 g`), verified by an actual `preview_click`. The scripted animation
  still drives the *centerpiece* visuals; wiring the remaining controls (describe→design,
  send-to-printer) is incremental, same pattern. The pristine `Main Workspace.dc.html` is untouched —
  edits live only in the runnable `index.html`.
- **The connector needs KimCad installed to run for real.** Its production path imports `kimcad`;
  with the engine absent it now raises a clear `EngineNotAvailable` error (hardened post-gate)
  rather than a raw traceback. TinkerQuarry's dependency on KimCad still needs to be formally
  declared/located (watchlist).
- **`mock_api.py`'s permissive `*` CORS is a mock-only convenience** — never the production pattern.
  The real KimCad server uses loopback + a per-boot session token; keep it that way.

## How to run (offline dev — works on any machine)

```
# one command — starts the mock API + serves the frontend together:
python scripts/dev.py
#   workspace : http://127.0.0.1:8753/   (open the console: "[TinkerQuarry wired] backend OK …")
#   mock API  : http://127.0.0.1:8766
#   real API  : open http://127.0.0.1:8753/?api=http://127.0.0.1:8765  (point at a real `kimcad web`)

# seam proof (optional): python -m http.server 8754 --directory frontend/_seam  -> 6/6 checks green
```

## How to run for real (target Windows machine)

Requires the **KimCad** engine on **Python 3.13** with OpenSCAD (+ OrcaSlicer, + Ollama for local
AI). Then point `frontend/api-client.js`'s `baseUrl` at the real `kimcad web` server
(`http://127.0.0.1:8765`) instead of the mock — the response shapes match, so the UI is unchanged.
*(This path is not yet automated; it's the next integration slice.)*

## Gate

- **Slice 1 — GauntletGate `lite`:** ⚠️ PARTIAL CHECK · **0 Blocker / 0 Critical** · 1 Major (now
  fixed) · 3 Minor · 1 Nit. Full report: [`gauntletgate-slice1-lite-v0.1.md`](gauntletgate-slice1-lite-v0.1.md).
- A **CLEAR TO ADVANCE** decision requires `gauntletgate all` (walkthrough + full) — and that should
  run on the **real** integrated runtime (3.13 + OpenSCAD), where first-run onboarding and the real
  safety invariants can be adversarially runtime-verified. Not achievable on this build box.

## Next slices (in order)

1. ~~Wire the UI to the backend~~ — **done (slice 2):** the workspace fetches from the API on mount;
   API base is configurable (`?api=<url>` / `window.TINKERQUARRY_API_BASE`) so mock→real is one setting.
2. ~~Render live data + wire interactive controls~~ — **done (slices 4–5):** status badge (up/down)
   + a working **Slice** control, verified by a real click. Remaining controls (describe→design,
   send-to-printer) are incremental — same pattern, lower marginal value, so deferred.
3. **Real integration (the blocker)** — stand KimCad up on the **Python-3.13 + OpenSCAD** machine
   (run `kimcad web`), open the UI with `?api=http://127.0.0.1:8765`, and confirm a real part flows
   end-to-end. **This needs hardware/toolchain not present in the build sandbox** — it is the
   substantive remaining work and cannot be done here.
4. **Gate it for real** — `gauntletgate walkthrough full` on the integrated runtime.
5. **Reskin / polish** once the plumbing is real.
