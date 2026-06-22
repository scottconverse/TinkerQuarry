# backend/tests — NOT product done-proof

These tests (`test_connector.py`, `test_mock_api.py`) validate the **mock API and connector seam shapes
only** — they prove the JSON contract and the glue layer, with **no real engine, no geometry, no
gate, no slice.**

**A green run here is NOT evidence the product works.** Per the recovery plan's Definition of Done and
the proof-bar in [../../docs/STATUS.md](../../docs/STATUS.md), "done" requires **real, non-mock behavior
in the canonical app**. Do not cite these tests as PRD/design completion.
