# Security Policy

The KimCad engine (TinkerQuarry's local manufacturing engine) turns plain-English descriptions into
3D-printable geometry on the user's own machine. Its security model is **local-first and
defense-in-depth**:

- **SCAD sandbox.** Generated OpenSCAD is sanitized before rendering — file-I/O and out-of-library
  `include`/`use` are stripped, `minkowski()` is blocked, and rendering runs in an isolated temporary
  directory with a scrubbed environment (`src/kimcad/openscad_runner.py`).
- **CSRF / session token.** The local web server mints a fresh, unguessable per-boot session token; a
  drive-by cross-origin POST can't read it, so state-changing requests are refused
  (`src/kimcad/webapp.py`).
- **No telemetry.** The engine does not phone home; secrets (e.g. printer connector credentials) are
  kept in the OS keyring and masked in logs.
- **Fail-closed gate.** Slicing and sending refuse a design whose readiness gate did not pass.

## Reporting a vulnerability

If you discover a security issue, please **report security issues privately** to the project
maintainer rather than opening a public issue, and allow reasonable time for a fix before disclosure.
Include the affected version, a reproduction, and the impact you observed.
