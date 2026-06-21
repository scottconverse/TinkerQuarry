# GauntletGate — Full lane — Engineering deep-dive — TinkerQuarry

**Role:** Principal Engineer (architecture, correctness, security, performance, provenance, deps/licensing)
**Date:** 2026-06-21 · **Mode:** audit-only (read product code, no modifications)
**Targets:** `KimCadClaude` (engine + SPA) · `tinkerquarry` (connector/scaffold)
**Consumed:** `walkthrough.md` (first-run/self-heal already verified — not re-walked)

## Severity counts

| Severity | Count |
|---|---|
| Blocker | 0 |
| Critical | 0 |
| Major | 2 |
| Minor | 4 |
| Nit | 3 |

No Blockers or Criticals. The web server's security model, the printability gate, and the
geometry-provenance boundary are genuinely well-engineered and defensively coded. The Major
findings are a licensing-consistency issue and a documentation/threat-model honesty gap, not
exploitable defects.

---

## Findings

### ENG-M-1 (Major) — License framing is inconsistent across the two repos, and the GPL provenance of the bundled tools is undocumented in-tree

**Category:** dependencies/licensing
**Evidence:**
- `KimCadClaude/LICENSE` = **Apache-2.0**.
- `tinkerquarry/LICENSE` = **GNU GPL-2.0**.
- `tinkerquarry/backend/connector.py:9-12` frames the whole licensing story around "the user
  brings their own GPLv3 SCAD library install, so there is no GPL-2.0 bundling conflict" — i.e.
  the project *believes* it is GPL-2.0 framed.
- `KimCadClaude/config/default.yaml:16-17` wires `openscad: tools/openscad/openscad.exe` and
  `orcaslicer: tools/orcaslicer/orca-slicer.exe` as **bundled** binaries fetched into the install
  tree. OpenSCAD is **GPLv2** and OrcaSlicer is **AGPLv3/GPLv3-family**.

**Observed vs expected:** The engine repo ships under Apache-2.0 while its sibling/scaffold ships
under GPL-2.0, and the headline tools it bundles and redistributes (OpenSCAD GPLv2, OrcaSlicer
GPL/AGPL-family) are invoked as separate processes — the standard "mere aggregation / arm's-length
exec" position — but **nothing in either tree documents that position, the third-party licenses, or
why Apache-2.0 is compatible with redistributing GPL binaries in the same installer.** Expected: a
single coherent licensing story (a `THIRD_PARTY_LICENSES`/`NOTICE` file enumerating OpenSCAD,
OrcaSlicer, Ollama, the models, and the SPA's npm deps; a one-paragraph statement that the GPL tools
are redistributed unmodified and invoked out-of-process).

**Why it matters:** This is a manufacturing product that *ships* GPL binaries. The arm's-length-exec
argument is defensible (the code already leans on it deliberately — `connector.py` library-chooser,
`openscad_runner` subprocess boundary), but an undocumented, internally-inconsistent license posture
is a real distribution risk and an easy thing for a downstream redistributor to get wrong.

**Blast radius:** Distribution/legal, not runtime. Affects anyone repackaging or commercializing the
installer. No user data or geometry impact.

**Fix path:** Pick one license story and document it: add `NOTICE`/`THIRD_PARTY_LICENSES.md` to
`KimCadClaude` listing every bundled tool + model with its license and "redistributed unmodified,
executed as a separate process"; reconcile the Apache-2.0 (engine) vs GPL-2.0 (glue) split
explicitly (state that the GPL glue links nothing from the Apache engine at the source level, or
relicense to match); verify the OrcaSlicer redistribution terms specifically (AGPL has network-use
obligations the loopback server should be checked against, even if loopback-only makes it moot).

### ENG-M-2 (Major) — Mock API has no session-token/CSRF guard and binds the same way the real server does — a drift-and-forget exposure risk

**Category:** security / architecture (cross-language seam)
**Evidence:** `tinkerquarry/backend/mock_api.py:224` `serve(host="127.0.0.1", port=8766)` wraps a
`ThreadingHTTPServer` with **no session token, no `Sec-Fetch-Site` check, no `--allow-remote` guard**
— none of the `webapp.py` hardening (the per-boot token at `webapp.py:1399`, the cross-site refusal
at `webapp.py:1103`, the non-loopback refusal at `cli.py:482`). It accepts state-changing POSTs
(`/api/design`, `/api/slice`, `/api/send`) from any origin that can reach the port.

**Observed vs expected:** The mock is documented as offline-dev-only and resets per process, which is
the right intent. But it is a *server that drives the same SPA contract* and shares the same bind
defaults as the real one, with the security stripped out. Expected: the mock either (a) refuses
non-loopback binds like the real server, or (b) carries a banner/guard making it impossible to
mistake for / promote to a reachable surface. A teammate copying `mock_api.serve` as a starting point
for a "lightweight real backend" inherits an unauthenticated, CSRF-open server.

**Why it matters:** The real server's whole security model is "loopback + per-boot token the
cross-origin attacker can't read." The mock silently breaks both invariants. It is the obvious
template a future dev reaches for, and the seam is explicitly designed to be swappable
(`mock_api.py` docstring: "Swap the base URL to a real `kimcad web` server").

**Blast radius:** Only if the mock is ever bound to a non-loopback interface or used beyond local
dev. Contained today, but it's a sharp edge on a shared seam.

**Fix path:** Add the `cli.py:482` non-loopback refusal to `mock_api.serve` (cheap, ~6 lines), and a
loud `X-TinkerQuarry-Mock` is already sent — extend the docstring to state "no auth; loopback only;
never expose."

### ENG-MIN-1 (Minor) — Connector only catches `ModuleNotFoundError`, not `ImportError`

**Category:** correctness / robustness (connector seam)
**Evidence:** `tinkerquarry/backend/connector.py:188, 204` — `_default_printer_server` and
`_default_pipeline_factory` guard the lazy kimcad imports with `except ModuleNotFoundError`. A
**partially-broken** engine install (a present-but-failing submodule, a C-extension ABI mismatch in
trimesh/manifold3d, a syntax error in a dep) raises `ImportError`/`OSError`, not
`ModuleNotFoundError`.

**Observed vs expected:** The `_engine_missing` actionable message ("install KimCad on Python 3.13 /
use mock_api") only fires for a clean missing-module. A broken-but-present install instead escapes to
the broad `except Exception` in `_call_tool:292`, returning a raw `f"{type(e).__name__}: {e}"` to the
MCP client — exactly the cryptic traceback `_engine_missing` exists to prevent.

**Why it matters:** Broken installs are the common real-world failure on a cross-language Python-3.13
toolchain (the very environments this connector targets). The friendly path misses them.

**Fix path:** Broaden to `except ImportError` (which subclasses ModuleNotFoundError's parent) and
consider also catching `OSError` from native-extension load failures; route both through
`_engine_missing`.

### ENG-MIN-2 (Minor) — `binary_path` "outside install root" check only *warns*; a tampered `local.yaml` can point OpenSCAD/OrcaSlicer at an arbitrary executable

**Category:** security (geometry provenance)
**Evidence:** `config.py:175-198` `binary_path()` resolves a configured binary; if it sits outside
`PROJECT_ROOT` it emits `warnings.warn(...)` (line 193) and **returns it anyway** — the path is then
handed to `subprocess.run` (`pipeline.py:406`, `slicer.py`). `_within_install_root` (line 201) exists
purely to drive the warning.

**Observed vs expected:** The code comment is explicit that this is operator-controlled config so a
warning (not a block) is intentional — "an absolute bundled-binary path is honored by design." That
is a reasonable stance for a single-user local app where `local.yaml` is already trusted config.
**But** `warnings.warn` goes to stderr and is routinely invisible in the GUI/WebView2 shell, so the
one signal a user gets that their slicer binary was repointed is effectively silent in the shipping
product. Expected: at minimum surface this on the `/api/health` payload (which already reports binary
presence) so a repointed binary is visible in-app, not only on a console nobody reads.

**Why it matters:** This is the geometry-provenance trust root. `local.yaml` is gitignored
per-machine config, but it is also what a "share my setup" / imported-config flow would write. A
silent repoint of `orcaslicer` → arbitrary exe runs attacker code at slice time with the user's
privileges. Exposure is low (requires already writing the user's config), hence Minor not Critical.

**Fix path:** Add an `outside_install_root: bool` (or a `binary_paths` block) to `/api/health` and
show a Settings warning chip when true; keep the non-blocking behavior but make it loud in the UI.

### ENG-MIN-3 (Minor) — `static_cache` is unbounded and lock-free across two keying schemes

**Category:** performance / memory
**Evidence:** `webapp.py:750` `static_cache: dict[...]` is keyed by both asset paths
(`_serve_static`, line 1209) and the index-shell key `f"index-shell:{path}:{session_token}"`
(line 1244). The comment (line 745-749) argues it is "naturally bounded" because the asset set is
fixed and the shell key includes the constant per-boot token.

**Observed vs expected:** True for the *current* call sites. But the dict has no cap and no lock, and
the reasoning depends on every future caller using a bounded key space. The lock-free claim is also
sound only because every key maps to a stable value for a given mtime/size — a correct but subtle
invariant a future edit can break (e.g. caching a per-request-derived key). Expected: a small bounded
cap (the asset set is ~dozens of entries) to make the bound structural, not argued.

**Why it matters:** Low risk today; it's a latent footgun in a hot path (`_serve_static` runs on
every asset request). A bounded `OrderedDict` (the pattern already used for `_cloud_cache`,
`design_progress`, the slice cache) would make the invariant enforced rather than commented.

**Fix path:** Cap `static_cache` with the same LRU `popitem(last=False)` pattern used elsewhere in
the file; size it to a small multiple of the asset count.

### ENG-MIN-4 (Minor) — CPU LLM inference (~100–140 s) runs inline on the request thread; admission cap is 2 but there is no queue/ETA feedback beyond the phase poll

**Category:** performance
**Evidence:** `webapp.py:230` `_MAX_INFLIGHT_DESIGNS = 2`; `webapp.py:1414` non-blocking
`design_slots.acquire(blocking=False)` → 429 `_busy` (line 884) over the cap. The design pipeline
(`pipeline.py:440 run`) runs the full plan→codegen→render→gate loop synchronously on the HTTP worker
thread. The progress poll (`/api/design/progress/<job_id>`, `webapp.py:1056`) returns a coarse phase
string only.

**Observed vs expected:** For the single-user loopback norm this is correct and the design is honest
(walkthrough confirms the elapsed-timer + Cancel UX). The cap of 2 is well-reasoned (comment at
line 224-230). The gap: a CPU-bound 2-min generation gives the UI only `{planning|generating|
rendering|validating}` with no determinate progress or ETA — flagged in the walkthrough (W-2 Nit) too.
Not a defect; a UX-latency reality of local inference. Recorded here because it's the dominant
request-path cost and worth an explicit perf note.

**Why it matters:** Sets user expectation on the headline action. No N+1 or accidental blocking calls
were found on the read paths — the heavy cost is the (unavoidable) model inference, correctly bounded
and serialized.

**Fix path:** Optional — emit a per-phase elapsed estimate from prior local runs, or a token/step
counter from the Ollama stream, to make the progress determinate.

### ENG-NIT-1 (Nit) — `/api/health?recheck=1` matched by exact full-path string

**Category:** correctness
**Evidence:** `webapp.py:990` matches `self.path == "/api/health?recheck=1"` literally. Any other
query ordering/extra param (`?recheck=1&t=2`, `?foo=1&recheck=1`) silently falls through to the
plain cached health. Harmless (cached health is the safe default; the cross-site guard at line 997
is the real protection), but brittle string-matching where the rest of the file carefully uses
`urlsplit`.

**Fix path:** Parse the query with `urlsplit` + `parse_qs` like the neighboring routes.

### ENG-NIT-2 (Nit) — `connector.py:design_result_dict` reads `gate.messages`, but `GateResult` exposes `findings`, not `messages`

**Category:** correctness (connector serialization)
**Evidence:** `connector.py:131` `"messages": list(getattr(gate, "messages", []) or [])`.
`printability.py:60 GateResult` has `findings: list[Finding]` and properties `status/blocking/failed`
— there is no `messages` attribute. The `getattr(..., [])` default means the connector always
serializes an **empty** `gate.messages`, so an MCP client never sees the gate's finding messages.

**Why it matters:** Silent data loss on the connector seam, not a crash. The defensive `getattr`
masks it. An MCP front-end driving `design` gets `gate.status` but no reasons.

**Fix path:** Map from `findings` (e.g. `[f.message for f in gate.findings]`), matching the
`printability.Finding` shape.

### ENG-NIT-3 (Nit) — `model-status` reports `running: true` with `model_present: false` during cold-load

**Category:** correctness (status contract)
**Evidence:** Already captured as walkthrough **W-1**; root is `webapp.py:1709-1710` setting
`running`/`model_present` independently from the probe. Confirmed in code, no new analysis.
**Fix path:** Gate `running` on a successful model probe or add an explicit `loading` state.

---

## What's working (credited)

This codebase is defensively engineered to a standard well above "it launches." Specific,
credited strengths:

1. **The CSRF / session-token model is correct and proportionate.** `webapp.py:1399`
   `hmac.compare_digest` constant-time compare of a per-boot `secrets.token_urlsafe(32)`
   (`serve()` line 2723), injected into the SPA shell at serve-time (`_serve_index_shell`,
   line 1233) and served `no-store` with **no ETag** so the bearer secret never persists to a
   browser/proxy cache or revalidates across boots (line 1253-1262). The threat model is written
   down honestly (loopback single-user; the token is anti-cross-origin, not remote auth) and the
   side-effecting GETs that can't carry the token (lazy STEP build, health re-probe) are
   *separately* guarded by `Sec-Fetch-Site` (`_is_cross_site`, line 1103). The wrong-verb 405 is
   correctly evaluated *before* the token 403 so integrators get the truer signal.

2. **The non-loopback bind is refused, not just warned.** `cli.py:482` returns exit 2 without
   `--allow-remote`, and even with it prints an explicit "NO authentication" warning. The
   `_ExclusiveBindServer` (line 2664) disables `SO_REUSEADDR` on Windows so a second instance fails
   deterministically instead of silently racing.

3. **The printability gate genuinely fails closed and actually blocks bad parts.**
   `printability.py` fails on non-finite extents *first* (line 102 — defends against NaN silently
   passing every `<` comparison), on non-watertight mesh (line 116), on build-volume exceedance
   (line 182), and on dimension mismatch (line 144). The web layer enforces it at **two**
   independent boundaries: slice is refused for a `gate_status == "fail"` part
   (`_handle_slice`, line 2480) and send is refused belt-and-suspenders even if a gcode entry
   somehow exists (`_handle_send`, line 1872). A reopened/imported design is **re-gated from the
   actual mesh** (`_regate_mesh` line 592, called at reopen line 2321) rather than trusted on its
   stored verdict, and the returned report's `gate_status` is synced to the re-gated result so the
   UI and the slice path can't disagree (line 2353-2361). A bad part cannot reach slice.

4. **Geometry provenance / untrusted-codegen boundary is tight.** `openscad_runner.sanitize_scad`
   (line 218) **blocks** (re-prompts) rather than strips, runs on comment-stripped full source so
   newline-split constructs can't evade, bans `minkowski`, `import()/surface()` file-I/O, and any
   `use/include` outside `library/` (`_approved_library_path` rejects `..`, backslash, drive-absolute,
   leading-slash). The child runs with a secret-scrubbed env (`scrubbed_env`, line 250) and an
   `OPENSCADPATH` pinned to the project root with cwd in an isolated temp.

5. **The `.kimcad` import is zip-slip AND zip-bomb safe.** `design_store.import_bytes` (line 269)
   reads only three known members by exact name (never the archive's own paths), bounds each member
   read (`_read_zip_member`, line 359, rejects > ceiling), validates `meta.json` shape, and re-keys
   to a server-minted uuid. `_safe_id` (line 326) guards the one client-supplied id against
   separators/`..`/Unicode-normalization escapes.

6. **The cloud-key exfiltration guard is real.** `config.validate_cloud_base_url` (line 427) requires
   https + a host on the allow-list **derived from the shipped `default.yaml`** (not the merged
   config — line 406), so a tampered `local.yaml` can't widen it; loopback is exempted by a proper
   IP-parse (`_is_local_base_url`, line 390, so `127.evil.example` can't sneak through). Vision is
   *always* local (`_SettingsAwareProvider.describe_photo`, line 465) even when cloud text is enabled
   — the photo never auto-leaves the machine.

7. **In-memory state is bounded everywhere it matters.** Registry cap (`MAX_REGISTRY`), separate
   slice-cache cap (`MAX_SLICE_CACHE`), progress-slot LRU (`_MAX_PROGRESS_SLOTS`), cloud-provider LRU
   (holding key material — line 419), bounded history (per-turn + aggregate + count), and bounded
   request bodies with a Windows-RST-safe drain (`_reject_oversized_body`, line 1304). Files are
   streamed from disk (`_stream_file`, line 903) rather than buffered. Atomic mesh export via
   temp+`os.replace` (`pipeline.py:587`). The concurrency comments read like they were earned by a
   real race (the M-2 settings-init lock, line 786).

8. **The connector seam degrades honestly.** Lazy heavy imports keep the protocol testable;
   `_engine_missing` (line 146) gives an actionable message; the pure `handle()` is unit-testable
   with no subprocess; gate-failed parts are never sliced/sent through it either (it passes
   `confirm_print=False`).

---

## What I could NOT assess

- **Runtime exploit verification.** Audit-only/static — I did not stand up the server and fire
  crafted requests (no live CSRF-bypass attempt, no actual zip-slip payload, no oversized-body RST
  repro). Findings are code-evidenced, not pen-tested. The walkthrough confirms tokenless POST → 403
  was observed live.
- **The built SPA bundle.** `web/assets/kimcad.js` / `Workspace.js` are minified build output; I read
  the Python contract they consume, not the compiled TS. Per instructions I consumed the walkthrough
  for UI behavior rather than re-walking it.
- **OrcaSlicer/OpenSCAD redistribution terms in detail.** I flagged the licensing inconsistency
  (ENG-M-1) but did not perform a full SPDX/obligations review of every bundled binary and model, or
  the SPA's transitive npm license tree — that needs a dedicated license scan.
- **`slicer.py` / `validation.py` / `hardening.py` internals.** I verified their *contracts* and
  call sites from the pipeline (gate enforcement, atomic export, watertight/repair reporting) but did
  not line-audit the trimesh/manifold3d hardening or the OrcaSlicer profile-resolution code paths.
- **Real performance numbers.** Inference cost (~100–140 s) is from in-code comments and the
  walkthrough timer, not my own measurement.
