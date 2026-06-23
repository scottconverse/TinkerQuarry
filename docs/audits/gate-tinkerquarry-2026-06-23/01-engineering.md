# GauntletGate Full - Principal Engineer Deep Dive

**Date:** 2026-06-23  
**Role:** Principal Engineer  
**Scope:** Architecture, correctness, security, performance, data provenance, dependencies  
**Repo:** `C:\Users\Scott\Desktop\CODE\tinkerquarry`  
**Inputs read:** `docs/audits/gate-tinkerquarry-2026-06-23/walkthrough-summary.md`, current git diff, `apps/ui/src/App.tsx`, `apps/ui/src/services/engineClient.ts`, `packages/engine/src/kimcad/external_libraries.py`, `packages/engine/src/kimcad/openscad_runner.py`, `packages/engine/src/kimcad/webapp.py`

## Severity Counts

Blocker: 0  
Critical: 1  
Major: 2  
Minor: 1  
Nit: 0

## Findings

### ENG-01 - Persisted iteration restore can target a stale or wrong engine design id

**Severity:** Critical  
**Category:** Correctness / data provenance / manufacturing safety

**Evidence:** `apps/ui/src/App.tsx:811-833` persists the iteration log in browser `localStorage`, including each entry's `rid`, `scad`, `gate`, and `stepUrl`. `apps/ui/src/App.tsx:1656-1672` restores an entry by writing the old SCAD into the editor and directly assigning `lastEngineRidRef.current = entry.rid`, without re-registering that SCAD with the engine or verifying that the server still maps the id to the same mesh. The server-side registry is process-local: `packages/engine/src/kimcad/webapp.py:887-893` creates a fresh `DesignRegistry` per handler/server, and `packages/engine/src/kimcad/design_registry.py:47-88` initializes in-memory `meshes`, `gate_status`, `snapshot`, and an id counter starting at 1. It also evicts old ids past `MAX_REGISTRY` via `packages/engine/src/kimcad/webapp.py:2579-2580`.

**Expected:** Restoring a persisted iteration should either re-register/re-render the SCAD into a fresh engine id, or mark the entry as source-only and require a new engine pass before slice/send/orient/export STEP can act on it.

**Actual:** The UI treats restored persisted entries as live engine designs by assigning the historic `rid`. After an engine restart, registry eviction, or id reuse, subsequent slice/orient/send/export actions can 404, act on a different current design with the same numeric id, or present stale `stepUrl` provenance.

**Why it matters:** This crosses the boundary between local UI memory and manufacturing actions. A stale id can make the visual/source shown in the UI diverge from the mesh/g-code the engine slices or sends. In a product that drives "Make it real", that is a pre-ship correctness and provenance failure.

**Blast radius:** Any user who restores an iteration from localStorage after restarting the engine/app, after enough generated designs trigger registry eviction, or after a new server has reused the same small integer id. The issue affects slice, orient, send, and STEP download flows because those use the current rid/step URL rather than a revalidated design identity.

**Fix path:** Treat iteration entries as immutable source snapshots. On restore, clear `lastEngineRidRef/currentStepUrl/lastSlicedRid` unless the engine confirms a design fingerprint match. Better: add an engine endpoint to register/reopen SCAD snapshots and return a fresh rid, gate, mesh, and step metadata; store a content hash with each log entry and require server confirmation before enabling manufacturing actions. Remove persisted `stepUrl` unless it is refreshed from the server for the new rid.

**Test:** Add a UI/unit integration test that seeds `localStorage` with an old entry, restores it after a mocked engine restart/id mismatch, and asserts Slice/Send are disabled until re-registration. Add an e2e or API-level regression where server ids restart at 1 with a different mesh and the restored UI cannot slice using the stale id.

### ENG-02 - `/api/libraries` exposes absolute user filesystem paths as a read-only unauthenticated payload

**Severity:** Major  
**Category:** Security / privacy / data minimization

**Evidence:** `packages/engine/src/kimcad/external_libraries.py:110-118` records `source_path` and `sandbox_path` as absolute paths in the manifest. `packages/engine/src/kimcad/webapp.py:1741-1750` returns `list_admitted()` directly from `GET /api/libraries`. The route is registered as GET-only in `packages/engine/src/kimcad/webapp.py:847-851`, and the POST session-token guard applies only to `do_POST` at `packages/engine/src/kimcad/webapp.py:1626-1659`. The TypeScript API also models and displays these paths: `apps/ui/src/services/engineClient.ts:240-248`.

**Expected:** The API should return only the data needed by the UI: `name`, `slug`, `include_prefix`, file count, and maybe byte count. Absolute source and sandbox paths should remain server-local unless the user explicitly opens a local diagnostics panel.

**Actual:** Any caller that can read loopback JSON can enumerate admitted library source locations and writable app-data sandbox paths. Browser CORS reduces drive-by web read exposure, but the API intentionally treats GETs as tokenless and the data is not needed for ordinary rendering.

**Why it matters:** Local path disclosure leaks usernames, project names, drive layout, and potentially sensitive client/work directory names. It also expands the observable attack surface around where admitted code is staged.

**Blast radius:** All users who admit an external SCAD library. The metadata persists in the manifest and is returned on every libraries listing.

**Fix path:** Store absolute paths internally if needed, but return a redacted public shape from `list_admitted(public=True)` or in `_handle_libraries_get`. Prefer omitting `source_path` entirely and exposing only a basename/last path component if the UI needs reassurance. Consider token-gating `/api/libraries` if it remains a local-environment disclosure endpoint.

**Test:** Add a webapp test for `GET /api/libraries` asserting no absolute `source_path` or `sandbox_path` fields are present. Keep unit coverage for manifest internals separately.

### ENG-03 - External library admission has no synchronization around sandbox/manifest writes

**Severity:** Major  
**Category:** Correctness / dependency management

**Evidence:** `packages/engine/src/kimcad/external_libraries.py:70-122` performs multi-step admission: resolve source, create a shared temp directory, recursively copy files, replace the target directory, read the manifest, append a record, and rewrite `manifest.json`. `remove_admitted` similarly updates the same sandbox and manifest at `packages/engine/src/kimcad/external_libraries.py:59-67`. The HTTP handlers at `packages/engine/src/kimcad/webapp.py:1752-1783` call these functions directly under `ThreadingHTTPServer`; there is no module-level lock or atomic write/replace for the manifest.

**Expected:** Admission/removal should be serialized per process, and manifest writes should be atomic (`write temp -> replace`) so a concurrent add/remove cannot lose records or leave a partial JSON file.

**Actual:** Two quick admissions/removals can race on the same `.slug.tmp`, target directory, or manifest read-modify-write cycle. Even in a single-user app, double-clicks or parallel settings/API calls are enough to trigger this class.

**Why it matters:** External libraries are now part of the render dependency graph. A lost manifest record or partially replaced sandbox can make generated SCAD fail to render, render with an older library copy than the UI reports, or lose a user's admitted dependency.

**Blast radius:** Users admitting multiple external libraries, removing while adding, or retrying after a slow copy. The failure mode is persistent because the manifest is on disk.

**Fix path:** Add a process-local `threading.Lock` in `external_libraries.py` and wrap admit/remove/list-manifest write operations that mutate state. Use unique temp directories (`.<slug>.<uuid>.tmp`) and atomic manifest replacement. If multiple app processes can share the same writable root, add a file lock.

**Test:** Add a concurrency regression using two threads admitting/removing different libraries against the same monkeypatched writable root, asserting the manifest remains valid and both expected final records/sandboxes exist.

### ENG-04 - External include sanitization allows the broad `external/` namespace rather than admitted prefixes

**Severity:** Minor  
**Category:** Security hardening / provenance

**Evidence:** `packages/engine/src/kimcad/openscad_runner.py:118-128` approves any clean relative path beginning with `external/`. Admission records expose specific `include_prefix` values in `packages/engine/src/kimcad/external_libraries.py:115`, but the sanitizer does not compare includes against the current admitted manifest. `packages/engine/tests/test_external_libraries.py:38-43` only verifies the broad prefix and traversal rejection.

**Expected:** The sanitizer should allow `external/<slug>/...` only when `<slug>` is currently admitted, or the render should explicitly record unresolved external includes as dependency misses.

**Actual:** Any `external/<anything>/...` include survives sanitization. OpenSCAD will only resolve files that exist under the sandbox root, so this is not currently a traversal escape, but it weakens provenance and makes dependency misses less explicit.

**Why it matters:** The render contract says admitted libraries are copied and exposed under a known prefix. Letting arbitrary external prefixes pass makes it harder to prove which external dependencies were actually admitted and used, especially as the feature grows.

**Blast radius:** Generated or user SCAD that references unadmitted external namespaces. Today this is mostly an error-quality/provenance issue because `OPENSCADPATH` points at the sandbox root, not the original filesystem.

**Fix path:** Load admitted slugs into the sanitizer or add a post-sanitize dependency validation step before invoking OpenSCAD. Return a clear blocked/missing-dependency error naming the unadmitted slug.

**Test:** Extend `test_external_libraries.py` to assert `use <external/not-admitted/foo.scad>` is blocked or reported as an explicit missing admitted dependency.

## What's Working

- The OpenSCAD execution path retains the right trust posture: generated code is sanitized before tool invocation, `import()`/`surface()` and `minkowski()` are blocked, traversal is rejected, execution runs in a temp working directory, output size is bounded, and the subprocess environment is secret-scrubbed (`packages/engine/src/kimcad/openscad_runner.py:255-304`).
- External library admission copies a suffix-limited subset into an app-owned sandbox instead of rendering directly from arbitrary user-selected paths (`packages/engine/src/kimcad/external_libraries.py:18-20`, `70-105`). That is the right architectural direction.
- STEP support is lazy and version-aware: the server caches template STEP output but rebuilds through `step_source` and version guards rather than doing slow CAD export on the hot design/render path (`packages/engine/src/kimcad/webapp.py:1335-1415`, `2538-2596`, `3076-3097`).
- Large binary artifacts are streamed instead of buffered, which is appropriate for mesh, G-code, and STEP payloads (`packages/engine/src/kimcad/webapp.py:1115-1138`).
- The walkthrough summary shows strong test signal for the current slice: lint/type-check, 660 UI tests, 1611 engine tests, live Playwright manufacturing flow, native Tauri build, installer smoke, and diff check all passed. First-run isolation remains explicitly partial, which is honest and important.

## Coverage Notes

I did not edit product source. I did not rerun the full test suite in this engineering pass; I relied on the walkthrough's recorded successful commands and performed static audit over the requested implementation and diff. First-run/dependency-absent coverage is still not fully proven per the walkthrough summary: installed-app smoke used real app data, web e2e used cleared localStorage against a provisioned engine/toolchain, and dependency-absent states are represented in code/tests rather than a fully verified isolation matrix.
