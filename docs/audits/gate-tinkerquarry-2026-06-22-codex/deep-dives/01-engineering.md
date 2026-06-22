# GauntletGate Full - Principal Engineer Deep Dive

**Project:** TinkerQuarry  
**Commit audited:** `0b13cb2d8725a5453496bca37a277c0e30d8df55`  
**Date:** 2026-06-22  
**Role:** Principal Engineer  
**Scope:** architecture, correctness, security, performance, data provenance, dependencies  
**Mode:** Full lane role pass; source files not edited.

## Role + Counts

| Severity | Count |
|---|---:|
| Blocker | 0 |
| Critical | 1 |
| Major | 4 |
| Minor | 0 |
| Nit | 0 |

## Findings

### ENG-001 - Critical - Public share title is stored XSS in the `/s/:id` HTML shell

**Category:** Security / data provenance

**Evidence:**
- `apps/web/functions/_lib/share.ts:53-60` only trims and truncates `title`; it does not HTML-escape quotes, `<`, or `>`.
- `apps/web/functions/api/share.ts:75-77` accepts the user-supplied title, and `apps/web/functions/api/share.ts:145-159` persists it into the share record.
- `apps/web/functions/s/[[shareId]].ts:27-38` builds a replacement meta tag by string interpolation: `content="${content}"`.
- `apps/web/functions/s/[[shareId]].ts:144-165` passes `share.title` into `og:title` and `twitter:title`.
- `apps/web/functions/s/[[shareId]].ts:168-171` adds COEP/COOP only; `apps/web/public/_headers:1-3` likewise has no Content-Security-Policy.
- Local AI provider keys are same-origin `localStorage` data in `apps/ui/src/stores/apiKeyStore.ts:8-16` and are only reversible obfuscation at `apps/ui/src/stores/apiKeyStore.ts:48-64`.

**Observed exploit shape:** a title like `x" /><script>globalThis.__pwned=1</script><meta name="` produces a rewritten shell containing a real `<script>` tag inside `<head>`. There is no CSP in the public web headers to stop execution.

**Impact:** Any attacker can create a share with a malicious title and send the `/s/<id>` link to another user. Script executes on the app origin, so it can read same-origin localStorage, including stored OpenAI/Anthropic/OpenAI-compatible keys, alter workspace state, and act as the user in public share APIs. This is a reachable security gap, not theoretical.

**Blast radius:** Public web app users who open an attacker-controlled share link; stored keys and same-origin app state on that domain.

**Fix path:** Escape every value inserted into HTML attributes (`&`, `"`, `'`, `<`, `>`) before `replaceMetaTag`, or stop generating HTML with regex/string concatenation and use a vetted serializer. Add a strict CSP for production, ideally nonce/hash-based for the two existing inline bootstrap scripts or move them to external files. Treat the CSP as defense-in-depth, not the primary fix.

**Test:** Add a share-meta test with a quoted/script title and assert the response contains encoded text, no `<script>`, and no attribute breakout. Add a browser-level regression that opens the share and verifies no injected global executes.

### ENG-002 - Major - Desktop Tauri app has no CSP and grants broad filesystem capability to every window

**Category:** Security / architecture

**Evidence:**
- `apps/ui/src-tauri/tauri.conf.json:21-25` sets `"csp": null` and enables `assetProtocol` with `"scope": ["**"]`.
- `apps/ui/src-tauri/capabilities/default.json:5-24` applies to `"windows": ["*"]`, includes `fs:default`, read/write/remove/rename/watch permissions, and scopes access to `$HOME/**` plus `$APPCACHE/**`.
- `apps/ui/src/platform/tauriBridge.ts:43-58` reads and writes arbitrary paths passed through the bridge, and `apps/ui/src/platform/tauriBridge.ts:80-91` writes exported bytes to a chosen save path.

**Impact:** A future renderer XSS or compromised dependency in the desktop shell becomes a high-blast-radius local file primitive. The app currently gives every webview broad home-directory read/write/remove capability and no CSP tripwire. Even if today I did not prove a desktop XSS source, the capability shape is not least privilege for a CAD editor.

**Blast radius:** User home directory files accessible under the Tauri FS scope; app cache; arbitrary exports through plugin APIs.

**Fix path:** Set a production CSP. Remove `fs:default` and unused write/remove/watch permissions; scope file access to explicit project roots selected through the dialog, app data, and export destinations brokered by native commands. Keep destructive operations behind command-specific validation.

**Test:** Add a capability snapshot test that fails if `$HOME/**`, `fs:default`, or `csp: null` returns. Add Tauri command tests for denied out-of-project reads/writes.

### ENG-003 - Major - Desktop MCP server is enabled by default and unauthenticated

**Category:** Security / architecture

**Evidence:**
- `apps/ui/src/stores/settingsStore.ts:154-157` defaults MCP to `enabled: true`, `port: 32123`.
- `apps/ui/src/App.tsx:350-366` syncs that setting on app start when filesystem capability exists.
- `apps/ui/src-tauri/src/mcp.rs:1123-1159` binds `127.0.0.1:{port}` and mounts `/mcp` without an application token or authorization check in this layer.
- Exposed tools include workspace binding and export paths: `apps/ui/src-tauri/src/mcp.rs:837-867` defines workspace and export parameters, and `apps/ui/src-tauri/src/mcp.rs:930-980` exposes tool handlers.
- The frontend handler accepts absolute export destinations at `apps/ui/src/services/desktopMcp.ts:778-789` and writes bytes at `apps/ui/src/services/desktopMcp.ts:912-916`.

**Impact:** Any same-user local process can connect to the MCP endpoint and drive app tools without a shared secret. That includes opening/binding workspaces and exporting rendered files to absolute paths accepted by the frontend bridge. Browser drive-by reachability was not proven in this pass because CORS/preflight behavior depends on the MCP transport, but local unauthenticated tool control is still a significant trust-boundary gap.

**Blast radius:** Open desktop session, active projects, render/export operations, filesystem writes through export paths.

**Fix path:** Default MCP off. When enabled, generate a per-install or per-session bearer token, require it on every `/mcp` request, and include it only in the UI snippets. Reject missing/foreign `Origin`/`Sec-Fetch-Site` where available. Consider explicit confirmation for export-to-absolute-path requests originating from MCP.

**Test:** Add native/server tests that unauthenticated MCP requests get 401/403, authenticated requests work, and a fresh settings store leaves MCP disabled. Add a regression for absolute export paths requiring authorization.

### ENG-004 - Major - Public share rate limit is a non-atomic KV get/put race

**Category:** Performance / abuse resistance

**Evidence:**
- `apps/web/functions/_lib/share.ts:78-88` reads the current counter from KV and then writes `current + 1`. There is no atomic increment, compare-and-swap, Durable Object serialization, or Cloudflare Rate Limiting rule in code.
- `apps/web/functions/api/share.ts:70-73` relies on that helper before accepting public share creation.

**Impact:** Concurrent requests from the same IP can all observe the same low counter and pass, producing more than the intended 30 shares/hour. Each accepted share stores compressed code in KV and returns a thumbnail upload token, so this is both spam and storage/cost exposure. This also amplifies ENG-005.

**Blast radius:** Public share endpoint, KV storage, R2 thumbnail follow-up path, operational costs.

**Fix path:** Move rate limiting to an atomic primitive: Cloudflare Rate Limiting, a Durable Object keyed by client/IP/hour, or another serialized counter. If KV stays, treat it as advisory and add a hard platform rule.

**Test:** Add a concurrency test issuing more than 30 same-IP creates in parallel and assert only 30 succeed. Unit tests that run sequentially are not enough for this bug class.

### ENG-005 - Major - Thumbnail upload reads the entire request before enforcing the 512 KiB cap

**Category:** Performance / abuse resistance

**Evidence:**
- `apps/web/functions/api/share/[id]/thumbnail.ts:86-88` calls `await context.request.arrayBuffer()` first, then checks `arrayBuffer.byteLength > 512 * 1024`.
- The token needed for this endpoint is returned to every successful share creator at `apps/web/functions/api/share.ts:128-165`.

**Impact:** A public user who creates shares can force the worker to buffer oversized thumbnail bodies before rejection. Cloudflare has platform request limits, but the application-level 512 KiB cap does not protect worker memory or CPU because it is enforced after allocation. Combined with the non-atomic share limiter, this is a realistic abuse path.

**Blast radius:** Pages Function memory/CPU, R2-adjacent upload path, public endpoint availability under abuse.

**Fix path:** Reject by `Content-Length` before reading when present; for chunked bodies, stream with a counting reader and abort once the cap is crossed. Keep the current post-read guard as a final assertion.

**Test:** Add a request double whose `arrayBuffer()` throws if called when `Content-Length` exceeds the cap, and assert the handler returns 413 without reading. Add a streaming over-cap test if the runtime test harness supports it.

## What's Working

- The local engine POST surface has a real per-boot session token guard: `packages/engine/src/kimcad/webapp.py:1482-1515` rejects state-changing requests with a missing/wrong `X-KimCad-Session`, and `packages/engine/src/kimcad/webapp.py:2856-2869` generates a fresh token by default.
- Request-size handling in the Python engine is deliberate: `packages/engine/src/kimcad/webapp.py:1410-1480` rejects oversized or malformed JSON before handing bodies to route logic and drains bounded data to avoid Windows socket-reset flakes.
- Geometry subprocesses use a shared secret-scrubbed environment: `packages/engine/src/kimcad/subprocess_env.py:20-43`, with CadQuery and OpenSCAD both using it at `packages/engine/src/kimcad/cadquery_runner.py:238-248` and `packages/engine/src/kimcad/openscad_runner.py:279-298`.
- The CadQuery sandbox blocks obvious Python escape hatches and OS/network modules at `packages/engine/src/kimcad/cadquery_runner.py:78-105`, then runs the worker out of an isolated output directory.
- Tool provenance is materially better than a typical local app: Windows OpenSCAD and OrcaSlicer downloads are pinned by URL and SHA-256 in `packages/engine/scripts/fetch_tools.py:52-99`, and checksum mismatch aborts before install at `packages/engine/scripts/fetch_tools.py:126-142`.

## Verification Notes

I performed static analysis and targeted local reproduction of the share-title HTML rewrite. I did not run the full test suite in this role pass, and I did not edit product source files.
