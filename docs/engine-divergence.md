# Engine divergence from upstream KimCad (KimCadClaude)

Forked 2026-06-22 into tinkerquarry/packages/engine per Recovery Plan v2 D3.
Owner: (assign). Upstream: KimCadClaude @ 0962260.

## Changes vs upstream
- (none yet — Phase 2 fork baseline)
- Phase 2 fix: copied top-level library/ (SCAD template modules) that the initial src-only fork missed.
- Phase 4: webapp.py accepts TINKERQUARRY_DEV_TOKEN env (dev session token for the vite-proxied front end); unset -> per-boot random token (prod unchanged).
