"""Manifold3D hardening worker — runs OUT OF PROCESS in its own interpreter.

v1.5-1 (license-clean bundle): manifold3d is Apache-2.0, which GPL-2.0-only KimCad must not
link in-process; it runs here at arm's length exactly like CadQuery, OpenSCAD, and OrcaSlicer
(subprocess boundary, spec §6.4/§12). Same interpreter binary, separate OS process — the
boundary is the process. Unlike the CadQuery worker there is no sandbox: this executes OUR
code on trusted mesh data; the split is a license/robustness boundary, not a security one.
(A crash bonus: re-importing the nanobind extension after a parent-side module reload
hard-crashes CPython — out-of-process, a dying worker is just a failed report.)

This file is deliberately **stdlib + numpy + manifold3d only** — it never imports ``kimcad``.
The in-process side (:func:`kimcad.hardening.harden_mesh`) invokes::

    <venv python> path/to/manifold_worker.py   # request JSON on stdin, result to result_path

Protocol
--------
Request  (stdin, one JSON object):
    {"mesh_path": "<in.npz: vertices float32 (n,3), faces uint32 (m,3)>",
     "out_path": "<out.npz written on success>", "result_path": "<result JSON>"}
Result   (written to ``result_path``; stdout fallback only for a malformed request):
    {"ok": true,  "status": "...", "genus": N}
    {"ok": false, "kind": "import|status|exec|protocol", "status": "...", "error": "..."}
"""

from __future__ import annotations

import json
import sys


def _run(request: dict[str, object]) -> dict[str, object]:
    mesh_path = request.get("mesh_path")
    out_path = request.get("out_path")
    if not isinstance(mesh_path, str) or not isinstance(out_path, str):
        return {"ok": False, "kind": "protocol", "error": "mesh_path and out_path required"}

    try:
        import numpy as np
    except ImportError as e:  # pragma: no cover - numpy is a hard engine dep
        return {"ok": False, "kind": "import", "error": f"numpy unavailable ({e})"}
    try:
        import manifold3d as m3d
    except ImportError as e:
        return {"ok": False, "kind": "import", "error": f"manifold3d unavailable ({e})"}

    try:
        with np.load(mesh_path) as data:
            vertices = np.asarray(data["vertices"], dtype=np.float32)
            faces = np.asarray(data["faces"], dtype=np.uint32)
        mesh_in = m3d.Mesh(vert_properties=vertices, tri_verts=faces)
        man = m3d.Manifold(mesh_in)
        status = str(man.status())
        if man.status() != m3d.Error.NoError or man.is_empty():
            return {"ok": False, "kind": "status", "status": status}
        out = man.to_mesh()
        np.savez(
            out_path,
            vertices=np.asarray(out.vert_properties)[:, :3],
            faces=np.asarray(out.tri_verts),
        )
        return {"ok": True, "status": status, "genus": man.genus()}
    except Exception as e:  # noqa: BLE001 - report, never crash the contract
        return {"ok": False, "kind": "exec", "error": f"{type(e).__name__}: {e}"}


def _emit(result: dict[str, object], result_path: str | None) -> None:
    payload = json.dumps(result)
    if result_path:
        try:
            with open(result_path, "w", encoding="utf-8") as f:
                f.write(payload)
            return
        except OSError:
            pass
    sys.stdout.write(payload)


def main() -> int:
    result_path: str | None = None
    try:
        request = json.loads(sys.stdin.read() or "{}")
        if not isinstance(request, dict):
            raise ValueError("request must be a JSON object")
        rp = request.get("result_path")
        result_path = rp if isinstance(rp, str) else None
    except (ValueError, TypeError) as e:
        _emit({"ok": False, "kind": "protocol", "error": str(e)}, result_path)
        return 0
    _emit(_run(request), result_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
