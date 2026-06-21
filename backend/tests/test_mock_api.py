"""Tests for the mock KimCad API (backend/mock_api.py).

Pure handle() assertions — no socket, no toolchain. Runnable two ways:
  * pytest backend/tests/test_mock_api.py
  * python backend/tests/test_mock_api.py   (standalone; loads the module by path)
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

_MOCK = Path(__file__).resolve().parents[1] / "mock_api.py"


def _load():
    spec = importlib.util.spec_from_file_location("tq_mock_api", _MOCK)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _load()


def _api():
    return M.MockKimCad()


def test_design_completes_with_gate_pass_and_vcp():
    api = _api()
    status, r = api.handle("POST", "/api/design", {"prompt": "a wall bracket for a Pi 4, M3, 3mm walls"})
    assert status == 200
    assert r["status"] == "completed" and r["has_mesh"] is True
    assert r["report"]["gate_status"] == "pass"
    assert r["report"]["readiness"]["score"] == 96
    # the signature visual-correction loop surfaced its result
    assert r["report"]["vcp"]["ran"] is True and r["report"]["vcp"]["approved"] is True
    assert isinstance(r["rid"], int)


def test_design_requires_prompt():
    status, r = _api().handle("POST", "/api/design", {})
    assert status == 400 and "prompt" in r["error"].lower()


def test_slice_requires_existing_design():
    status, r = _api().handle("POST", "/api/slice/999", {"printer": "bambu_p1s", "material": "pla"})
    assert status == 404


def test_full_flow_design_slice_send_outcome():
    api = _api()
    _, d = api.handle("POST", "/api/design", {"prompt": "a wall bracket"})
    rid = d["rid"]
    # can't send before slicing
    _, s0 = api.handle("POST", f"/api/send/{rid}", {"confirm": True})
    assert s0["sent"] is False and s0["reason"] == "not_sliced"
    # slice
    _, sl = api.handle("POST", f"/api/slice/{rid}", {"printer": "bambu_p1s", "material": "pla"})
    assert sl["sliced"] is True and sl["gcode_url"].endswith(str(rid))
    # send without confirm is refused
    _, s1 = api.handle("POST", f"/api/send/{rid}", {"confirm": False})
    assert s1["sent"] is False and s1["reason"] == "unconfirmed"
    # send to the mock printer => simulated, never narrated as real
    _, s2 = api.handle("POST", f"/api/send/{rid}", {"confirm": True, "connector": "mock"})
    assert s2["sent"] is True and s2["simulated"] is True
    # outcome on a simulated send is refused (409) — outcomes only after a REAL send
    _, o0 = api.handle("POST", f"/api/print-outcome/{rid}", {"outcome": "clean"})
    assert o0  # dict
    st, o0b = api.handle("POST", f"/api/print-outcome/{rid}", {"outcome": "clean"})
    assert st == 409


def test_real_send_then_outcome_records():
    api = _api()
    _, d = api.handle("POST", "/api/design", {"prompt": "a bracket"})
    rid = d["rid"]
    api.handle("POST", f"/api/slice/{rid}", {"printer": "bambu_p1s", "material": "pla"})
    _, s = api.handle("POST", f"/api/send/{rid}", {"confirm": True, "connector": "Workshop P1S"})
    assert s["simulated"] is False
    st, o = api.handle("POST", f"/api/print-outcome/{rid}", {"outcome": "issues"})
    assert st == 200 and o["recorded"] is True and o["outcome"] == "issues"


def test_print_outcome_validates_value():
    api = _api()
    _, d = api.handle("POST", "/api/design", {"prompt": "x"})
    st, o = api.handle("POST", f"/api/print-outcome/{d['rid']}", {"outcome": "nope"})
    assert st == 422


def test_render_invalidates_slice():
    api = _api()
    _, d = api.handle("POST", "/api/design", {"prompt": "a bracket"})
    rid = d["rid"]
    api.handle("POST", f"/api/slice/{rid}", {"printer": "bambu_p1s", "material": "pla"})
    api.handle("POST", f"/api/render/{rid}", {"values": {"wall": 4}})
    # after a re-render, a send must fail (stale slice cleared)
    _, s = api.handle("POST", f"/api/send/{rid}", {"confirm": True})
    assert s["sent"] is False and s["reason"] == "not_sliced"


def test_catalog_and_status_shapes():
    api = _api()
    assert api.handle("GET", "/api/health", None)[1]["openscad"] is True
    ms = api.handle("GET", "/api/model-status", None)[1]
    assert ms["backend"] == "local" and ms["vision_present"] is True
    conns = api.handle("GET", "/api/connectors", None)[1]["connectors"]
    assert any(c["simulated"] for c in conns) and any(not c["simulated"] for c in conns)
    fams = api.handle("GET", "/api/templates", None)[1]["families"]
    assert {f["tier"] for f in fams} <= {"benchmarked", "baseline"}
    assert api.handle("GET", "/api/settings", None)[1]["cloud_enabled"] is False


def test_unknown_route():
    st, r = _api().handle("GET", "/api/nope", None)
    assert st == 404


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\n{len(fns)}/{len(fns)} mock-API tests passed")
