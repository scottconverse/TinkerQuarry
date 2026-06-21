"""Dependency-free mock of KimCad's local HTTP API (the contract in KimCadClaude/docs/api.md).

Why this exists: the real engine needs Python 3.13 + OpenSCAD (+ OrcaSlicer/Ollama) and can't run in
a generic sandbox. This mock returns api.md-shaped responses so the TinkerQuarry frontend can be
developed, wired, and tested **offline** — and so the frontend↔backend *seam* is proven without the
heavy toolchain. Swap the base URL to a real `kimcad web` server for live geometry; the shapes match.

Design:
- :class:`MockKimCad.handle(method, path, body)` is a **pure** function returning ``(status, dict)`` —
  unit-testable with no socket. :func:`serve` wraps it in a stdlib ``http.server``.
- Stateful enough to be realistic (a design gets an id; slice/send/outcome gate on prior steps),
  but deterministic. State resets per process, exactly like the real server.

Run:  python -m backend.mock_api   (serves http://127.0.0.1:8766)

⚠️ SECURITY — DEV-ONLY, NEVER A PRODUCTION SERVER. This mock intentionally OMITS the real
server's hardening: there is **no per-boot session token / CSRF check**, no Sec-Fetch-Site
guard, no non-loopback refusal, and it sends a permissive ``*`` CORS header for offline
convenience. Do NOT copy this as the template for a real backend, and do NOT expose it beyond
loopback. The production pattern is the real ``kimcad web`` server (KimCadClaude/src/kimcad/
webapp.py): loopback bind + the ``X-KimCad-Session`` token the SPA reads from the page shell.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

MOCK_HEADER = ("X-TinkerQuarry-Mock", "1")
PRINT_OUTCOMES = {"clean", "issues", "failed", "skip"}


class MockKimCad:
    """Pure, deterministic mock of the KimCad API. One instance == one server run."""

    def __init__(self) -> None:
        self._next_rid = 1
        self._designs: dict[int, dict] = {}      # rid -> design record
        self._sliced: set[int] = set()           # rids with a (mock) slice
        self._real_sent: set[int] = set()        # rids sent to a non-simulated printer

    # --- the design the mockup demonstrates: a Pi 4 wall bracket, off-template, gate-pass ---
    def _design_record(self, rid: int, prompt: str) -> dict:
        return {
            "status": "completed",
            "has_mesh": True,
            "mesh_url": f"/api/mesh/{rid}",
            "step_url": None,
            "step_offer": "settings",
            "template": None,  # off-template → LLM-codegen path (matches the design's narrative)
            "params": [
                {"name": "wall", "label": "Wall thickness", "value": 3.0, "min": 1.2, "max": 6.0,
                 "step": 0.2, "unit": "mm", "integer": False, "axis": "Z"},
                {"name": "base_w", "label": "Base width", "value": 120.0, "min": 60.0, "max": 200.0,
                 "step": 1.0, "unit": "mm", "integer": False, "axis": "X"},
            ],
            "plan": {"object_type": "wall_bracket", "summary": prompt[:120],
                     "target_bbox_mm": [120, 80, 65]},
            "report": {
                "gate_status": "pass",
                "headline": "Ready to print",
                "backend": "openscad",
                "dims": [120, 80, 65],
                "findings": [
                    {"key": "manifold", "label": "Solid & watertight", "ok": True},
                    {"key": "walls", "label": "Walls thick enough", "ok": True, "detail": "3.0 ≥ 0.4"},
                    {"key": "build_volume", "label": "Fits the build plate", "ok": True, "detail": "120<256"},
                    {"key": "overhang", "label": "Overhang on the gusset", "ok": True, "warn": True,
                     "detail": "supports"},
                ],
                "readiness": {"score": 96, "verdict": "Ready to print", "tone": "pass"},
                # the visual-correction loop's result, surfaced to the UI
                "vcp": {"ran": True, "mode": "Full visual", "rounds": 3,
                        "issues_caught": ["a mounting hole was on the front face instead of the top"],
                        "approved": True},
            },
        }

    def handle(self, method: str, path: str, body: dict | None) -> tuple[int, dict]:
        body = body or {}
        p = urlsplit(path).path

        # ---- design ----
        if method == "POST" and p == "/api/design":
            prompt = (body.get("prompt") or "").strip()
            if not prompt:
                return 400, {"error": "A prompt is required."}
            rid = self._next_rid
            self._next_rid += 1
            rec = self._design_record(rid, prompt)
            self._designs[rid] = rec
            return 200, {"rid": rid, **rec}

        if method == "GET" and p.startswith("/api/design/progress/"):
            # a finished poll: real server reports null once resolved
            return 200, {"phase": None}

        if method == "POST" and p.startswith("/api/render/"):
            rid = _rid_of(p, "/api/render/")
            if rid not in self._designs:
                return 404, {"error": "unknown design"}
            self._sliced.discard(rid)  # re-render invalidates a slice (like the real server)
            values = body.get("values") or {}
            rec = dict(self._designs[rid])
            rec["mesh_url"] = f"/api/mesh/{rid}?v=2"
            rec["adjusted_params"] = []  # nothing clamped in the mock
            rec["applied_values"] = values
            return 200, {"rid": rid, **rec}

        # ---- slice / send / outcome ----
        if method == "POST" and p.startswith("/api/slice/"):
            rid = _rid_of(p, "/api/slice/")
            if rid not in self._designs:
                return 404, {"error": "unknown design"}
            if self._designs[rid]["report"]["gate_status"] != "pass":
                return 200, {"sliced": False, "reason": "stale", "note": "gate did not pass"}
            self._sliced.add(rid)
            printer = body.get("printer", "bambu_p1s")
            material = body.get("material", "pla")
            return 200, {"sliced": True, "gcode_url": f"/api/gcode/{rid}",
                         "estimate": "1h 12m · 18 g", "machine": printer, "process": "0.2mm",
                         "filament": material}

        if method == "POST" and p.startswith("/api/send/"):
            rid = _rid_of(p, "/api/send/")
            if rid not in self._sliced:
                return 200, {"sent": False, "reason": "not_sliced", "note": "slice first"}
            if body.get("confirm") is not True:
                return 200, {"sent": False, "reason": "unconfirmed",
                             "note": "explicit confirm:true required"}
            connector = body.get("connector", "mock")
            simulated = connector == "mock"
            if not simulated:
                self._real_sent.add(rid)
            return 200, {"sent": True, "simulated": simulated,
                         "job": {"job_id": f"job-{rid}", "state": "enqueued", "progress": 0.0}}

        if method == "POST" and p.startswith("/api/print-outcome/"):
            rid = _rid_of(p, "/api/print-outcome/")
            outcome = body.get("outcome")
            if outcome not in PRINT_OUTCOMES:
                return 422, {"error": f"outcome must be one of {sorted(PRINT_OUTCOMES)}"}
            if outcome != "skip" and rid not in self._real_sent:
                return 409, {"error": "Record an outcome after a real printer send."}
            return 200, {"recorded": outcome != "skip", "outcome": outcome}

        # ---- printers / catalog / status ----
        if method == "GET" and p == "/api/connectors":
            return 200, {"connectors": [
                {"name": "mock", "simulated": True, "configured": True},
                {"name": "Workshop P1S", "simulated": False, "configured": True},
            ]}
        if method == "GET" and p.startswith("/api/connector-status/"):
            return 200, {"online": True, "state": "ready", "detail": "idle",
                         "nozzle_temp_c": 28.0, "bed_temp_c": 24.0}
        if method == "GET" and p == "/api/options":
            return 200, {"printers": [
                {"name": "bambu_p1s", "label": "Bambu P1S", "build_volume": [256, 256, 256],
                 "sliceable": True},
                {"name": "neptune_4_max", "label": "Elegoo Neptune 4 Max",
                 "build_volume": [420, 420, 480], "sliceable": True},
            ], "materials": [{"name": "pla", "label": "PLA"}, {"name": "petg", "label": "PETG"}],
                "defaults": {"printer": "bambu_p1s", "material": "pla"}}
        if method == "GET" and p == "/api/templates":
            return 200, {"families": [
                {"name": "tube", "summary": "A ring / spacer / standoff.", "examples": ["tube", "ring"],
                 "seed": "a tube", "param_count": 3, "tier": "benchmarked"},
                {"name": "wall_bracket", "summary": "A flat mounting bracket.",
                 "examples": ["bracket", "wall mount"], "seed": "a wall bracket", "param_count": 5,
                 "tier": "baseline"},
            ]}
        if method == "GET" and p == "/api/model-status":
            return 200, {"backend": "local", "model": "qwen2.5:7b", "running": True,
                         "model_present": True, "vision_model": "qwen2.5vl:3b", "vision_present": True}
        if method == "GET" and p == "/api/health":
            return 200, {"version": "mock", "openscad": True, "orcaslicer": True, "cadquery": False}
        if method == "GET" and p == "/api/settings":
            return 200, {"printer": "bambu_p1s", "material": "pla",
                         "cloud_enabled": False, "cloud_model": None, "has_cloud_key": False,
                         "experimental_enabled": True, "key_storage": "keyring"}

        return 404, {"error": f"no mock route for {method} {p}"}


def _rid_of(path: str, prefix: str) -> int:
    try:
        return int(urlsplit(path).path[len(prefix):].split("/")[0])
    except (ValueError, IndexError):
        return -1


def make_handler(api: MockKimCad):
    class Handler(BaseHTTPRequestHandler):
        def _respond(self, status: int, payload: dict) -> None:
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header(*MOCK_HEADER)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Expose-Headers", "X-TinkerQuarry-Mock")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self) -> None:  # CORS preflight for browser fetch
            self._respond(204, {})

        def do_GET(self) -> None:
            status, payload = api.handle("GET", self.path, None)
            self._respond(status, payload)

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw) if raw else {}
            except ValueError:
                return self._respond(400, {"error": "invalid JSON"})
            status, payload = api.handle("POST", self.path, body)
            self._respond(status, payload)

        def log_message(self, *_args) -> None:  # quiet
            pass

    return Handler


def serve(host: str = "127.0.0.1", port: int = 8766) -> None:
    api = MockKimCad()
    httpd = ThreadingHTTPServer((host, port), make_handler(api))
    print(f"TinkerQuarry mock KimCad API on http://{host}:{port}  (X-TinkerQuarry-Mock: 1)")
    httpd.serve_forever()


if __name__ == "__main__":  # pragma: no cover
    serve()
