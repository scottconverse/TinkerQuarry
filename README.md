# TinkerQuarry

**Status: partial implementation — real-product recovery in progress. Not done.**

TinkerQuarry's goal: describe a 3D-printable part in plain English (or a photo/sketch) and get a
checked, print-ready file, locally — with an AI **Visual Correction Loop** that looks at the rendered
model and fixes spatial errors. See the spec: [docs/prd/TinkerQuarry-PRD-v0.3.md](docs/prd/TinkerQuarry-PRD-v0.3.md)
and the design: [docs/design/Main Workspace.dc.html](docs/design/Main%20Workspace.dc.html).

## Honest state (read before trusting anything here)

This repo currently contains a **high-fidelity static prototype** (`frontend/index.html`), a
**dependency-free mock API** (`backend/mock_api.py`), connector glue, docs, and tests. The real
manufacturing engine lives in the sibling repo `KimCadClaude` and is strong. **But the product the PRD
and the supplied design specify is not built:**

- The **Visual Correction Loop** (the signature feature) is **not implemented**.
- **OpenSCAD Studio's front-end was not absorbed** — the running UI is KimCad's own SPA reskinned, not
  the supplied TinkerQuarry design.
- The **"show me the code" drawer**, the **rich 3D viewer**, **bundled/external libraries**, and the
  **About/Licenses** surface are missing or partial.

The full, evidence-backed picture is the **canonical status matrix**:
**[docs/STATUS.md](docs/STATUS.md)**. The recovery is governed by
**[docs/TinkerQuarry-Recovery-Plan-v2.md](docs/TinkerQuarry-Recovery-Plan-v2.md)** (audit-approved).
Per-area audits + gap report: [docs/audits/](docs/audits/).

> **Do not treat the prototype or the mock API as proof the product works.** They demonstrate the design
> intent and the API seam shapes only. "Done" means real, non-mock behavior in the canonical app, per the
> recovery plan's Definition of Done.

## What's genuinely real (and worth keeping)

- The **KimCad manufacturing engine**: prompt → design → printability gate → auto-orient → real
  OrcaSlicer slice (motion-bearing G-code proof) → printer send. Fail-closed safety, 6 connectors.
- **Local-first onboarding** with a complete managed model-download flow.
- **Security & privacy**: per-boot session token, SCAD sandbox + arm's-length worker, OS-keyring masked
  secrets, **zero telemetry**.
- Tests: **1,590** engine / **407** frontend / **19** glue pass.

## Repository decision (canonical)

- **`tinkerquarry`** is the **product repo of record.**
- **`KimCadClaude`** is a **separate product** for a different audience; its engine is **forked** into
  `tinkerquarry/packages/engine` during recovery (see the plan's D3).
- **`openscad-studio`** is the **upstream front-end base to fork**, not inspiration.

## Run (today)

```
# offline design prototype + mock API (design preview only — NOT product proof):
python scripts/dev.py            # workspace :8753 + mock API :8766

# the real engine (KimCad's SPA, pre-absorption) lives in the sibling repo:
#   cd ../KimCadClaude && .venv313/Scripts/kimcad.exe web
```

A single canonical `tinkerquarry` run command arrives in **Phase 1** of the recovery plan, once the
forked OpenSCAD-Studio base boots inside this repo against the real engine.

## License

**GPL-2.0** — see [LICENSE](LICENSE). The combined work absorbs GPL-2.0-only components; an in-app
About/Licenses surface with upstream source links is a **required, not-yet-built** v1 item (status
matrix). Third-party attribution: [../KimCadClaude/THIRD_PARTY_LICENSES.md](../KimCadClaude/THIRD_PARTY_LICENSES.md).
