# TinkerQuarry

**Describe it. Watch it get built, checked, and corrected. Print it. All on your machine.**

TinkerQuarry turns a plain-English description into a 3D-printable object — locally, no account,
no cloud, no CAD skills. It pairs a deterministic manufacturing pipeline (the **KimCad** engine)
with an AI **visual-correction loop** (the AI looks at what it built and fixes spatial mistakes),
behind a maker-first interface.

> Status: **early development.** This repo glues together two existing, tested codebases plus a new
> connector. See [`docs/STATUS.md`](docs/STATUS.md) for exactly what runs today vs. what needs a
> full local toolchain, and [`docs/TinkerQuarry-PRD-v0.3.md`](docs/TinkerQuarry-PRD-v0.3.md) for the
> product spec.

## Architecture (the glue)

```
 Frontend (maker UI)                Connector / HTTP API              Backend engine
 ──────────────────                 ────────────────────              ──────────────
 TinkerQuarry design   ──HTTP──▶    KimCad local API (docs/api.md)    KimCad pipeline (Python)
 (React composition)                + connector.py (MCP surface)      templates · render · gate ·
 frontend/                          backend/                          harden · orient · slice · send
        │                                   │                                  │
        └─ offline dev ───▶ backend/mock_api.py (stdlib mock of the API) ◀─────┘
```

- **`frontend/`** — the maker interface (a Claude Design composition; runs standalone with the
  vendored React/Babel runtime in `frontend/vendor/`). The *face* to be reskinned/wired.
- **`backend/connector.py`** — the universal connector: exposes the KimCad pipeline (design,
  render, slice, send, libraries, printers) as one MCP/JSON-RPC surface. Injectable + unit-tested.
- **`backend/mock_api.py`** — a dependency-free mock of KimCad's HTTP API (`docs/api.md` shapes) so
  the frontend can be developed and tested **offline**, with no OpenSCAD/Python-3.13 toolchain.
- The real engine is **KimCad** (sibling repo). TinkerQuarry depends on it for live geometry,
  validation, slicing, and printer sending.

## Reuse / license

TinkerQuarry combines **GPL-2.0** components (OpenSCAD-derived front-end runtime; the KimCad engine
invokes OpenSCAD) and is therefore licensed **GPL-2.0** — see [`LICENSE`](LICENSE). Bundled
third-party libraries retain their own (permissive) licenses; an in-app About/Licenses surface is a
planned requirement (PRD §6.14).

## Running

- **Offline frontend dev (works anywhere, no toolchain):** serve `frontend/` and point it at the
  mock API — see `docs/STATUS.md`.
- **Full pipeline (real geometry → print):** requires the KimCad engine on **Python 3.13** with
  OpenSCAD (and OrcaSlicer for slicing) — runs on the target Windows machine, not in a generic
  sandbox.

See [`docs/STATUS.md`](docs/STATUS.md) for current, evidence-backed run instructions.
