# backend/ — pre-fork connector seam lab (not shipped, not release evidence)

**Status: historical.** This directory is the original KimCad Connector experiment from
before Recovery Phase 2 forked the engine into [`packages/engine/`](../packages/engine/).
The living version of the connector is
[`packages/engine/src/kimcad/connector.py`](../packages/engine/src/kimcad/connector.py) —
it has diverged from the copy here and is the one the engine ships and maintains.

What's here:

- `connector.py` — the pre-fork connector draft ("OpenRouter, but for OpenSCAD
  manufacturing"): one JSON-RPC/MCP surface over the pipeline with bring-your-own AI
  engines, printers, and SCAD libraries.
- `mock_api.py` — a mock of the engine API used to develop the connector seam without a
  real engine.
- `tests/` — seam-shape tests against the mock. Per
  [`tests/README.md`](tests/README.md): they prove the JSON contract and glue layer only —
  **no real engine, no geometry, no gate, no slice** — and a green run here is **not**
  evidence the product works.

Nothing in the installer, CI, or release process references this directory. It is kept as
design history for the connector's protocol decisions. If you are looking for the real
thing, go to `packages/engine/` — and if the two connector copies ever need reconciling,
the engine's copy wins.
