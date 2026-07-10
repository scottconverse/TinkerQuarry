"""Pre-slice mesh hardening via Manifold3D (spec §6.8) — out of process since v1.5-1.

Trimesh's ``is_watertight`` is a necessary check, not a sufficient one: a mesh can be
watertight yet still carry non-manifold edges, duplicated/degenerate triangles, or
self-intersections that make a slicer mis-toolpath or silently auto-"repair" it in ways
the user never sees. Before a part is sliced (or exported as the download fallback), we
run it through Manifold3D, whose data model is a *guaranteed* 2-manifold: building a
``Manifold`` from the mesh merges coincident vertices, drops degenerate triangles, and
either yields a clean manifold or reports precisely why it could not.

Manifold3D is a HARD dependency (pinned in pyproject.toml: ``manifold3d>=3.0``) but it is
**never imported in this process**: it is Apache-2.0 and KimCad's bundle is GPL-2.0-only, so
it runs in :mod:`kimcad.manifold_worker` behind the same arm's-length subprocess boundary as
CadQuery, OpenSCAD, and OrcaSlicer (v1.5-1 license-clean bundle; the license-scan gate
enforces this stays true). The degrade path is unchanged from ENG-007: any worker problem —
package absent in a broken install, worker crash, timeout — returns the original
(already gate-validated) mesh with the reason in the report, never an exception.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from kimcad.subprocess_env import scrubbed_env as _scrubbed_env

_WORKER_PATH = Path(__file__).with_name("manifold_worker.py")
# Hardening a pipeline-scale mesh is sub-second; the budget covers a cold interpreter +
# numpy import on a loaded box. Env-tunable like the other worker timeouts.
_DEFAULT_TIMEOUT_S = 120


@dataclass
class HardenReport:
    """Outcome of the pre-slice hardening pass."""

    engine: str  # "manifold3d" or "skipped"
    ok: bool  # a clean manifold was produced
    status: str  # engine status string (e.g. "Error.NoError")
    genus: int | None  # topological genus, when known
    changed: bool  # vertex/face count differed after hardening (a real repair)
    before: tuple[int, int]  # (vertices, faces) in
    after: tuple[int, int]  # (vertices, faces) out
    note: str = ""

    def summary(self) -> str:
        if self.engine == "skipped":
            return f"hardening skipped ({self.note or 'manifold3d unavailable'})"
        if not self.ok:
            return f"hardening could not build a manifold ({self.status}); kept validated mesh"
        detail = f"genus {self.genus}" if self.genus is not None else self.status
        return f"hardened via manifold3d ({detail})" + (", repaired" if self.changed else "")


def _invoke_worker(mesh: Any) -> dict[str, Any]:
    """Run the manifold worker subprocess on ``mesh``; return its result dict, with the
    hardened ``vertices``/``faces`` arrays attached on success. Spawn/timeout/protocol
    problems come back as ``{"ok": False, "kind": ...}`` — this function never raises.
    (The seam tests monkeypatch to drive harden_mesh's mapping paths hermetically.)"""
    import os

    import numpy as np

    timeout_s = _DEFAULT_TIMEOUT_S
    raw = os.environ.get("KIMCAD_HARDEN_TIMEOUT_S", "")
    if raw.isdigit() and int(raw) > 0:
        timeout_s = int(raw)

    with tempfile.TemporaryDirectory(prefix="kimcad-harden-") as td:
        tdir = Path(td)
        mesh_path = tdir / "mesh.npz"
        out_path = tdir / "hardened.npz"
        result_path = tdir / "result.json"
        np.savez(
            mesh_path,
            vertices=np.asarray(mesh.vertices, dtype=np.float32),
            faces=np.asarray(mesh.faces, dtype=np.uint32),
        )
        request = {
            "mesh_path": str(mesh_path),
            "out_path": str(out_path),
            "result_path": str(result_path),
        }
        try:
            # Secret-scrubbed env + isolated cwd, mirroring the CadQuery/OpenSCAD runners
            # (ENG-002 discipline); a geometry worker needs neither keys nor the project dir.
            subprocess.run(
                [sys.executable, str(_WORKER_PATH)],
                input=json.dumps(request),
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=str(tdir),
                env=_scrubbed_env(),
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "kind": "exec", "error": f"worker exceeded {timeout_s}s"}
        except OSError as e:
            return {"ok": False, "kind": "exec", "error": f"worker spawn failed: {e}"}

        try:
            result: dict[str, Any] = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            return {"ok": False, "kind": "protocol", "error": f"no worker result ({e})"}
        if result.get("ok"):
            try:
                # Context-close the NpzFile: an open handle keeps the file locked on Windows
                # and TemporaryDirectory cleanup would raise PermissionError.
                with np.load(out_path) as data:
                    result["vertices"] = np.asarray(data["vertices"])
                    result["faces"] = np.asarray(data["faces"])
            except (OSError, KeyError, ValueError) as e:
                return {"ok": False, "kind": "protocol", "error": f"bad worker mesh ({e})"}
        return result


def harden_mesh(mesh: Any) -> tuple[Any, HardenReport]:
    """Return ``(hardened_mesh, report)``.

    On any problem — Manifold3D absent, the worker failing, or it rejecting the mesh — the
    original (already gate-validated) mesh is returned unchanged, with the reason recorded.
    Never raises: hardening is a best-effort robustness pass, not a gate.
    """
    before = (len(mesh.vertices), len(mesh.faces))
    result = _invoke_worker(mesh)

    if not result.get("ok"):
        kind = str(result.get("kind", "exec"))
        error = str(result.get("error", ""))
        if kind == "import":
            return mesh, HardenReport(
                engine="skipped", ok=False, status="ImportError", genus=None,
                changed=False, before=before, after=before,
                note=error or "manifold3d unavailable",
            )
        if kind == "status":
            return mesh, HardenReport(
                engine="manifold3d", ok=False, status=str(result.get("status", "")),
                genus=None, changed=False, before=before, after=before,
                note="manifold3d could not build a manifold; kept the validated mesh",
            )
        return mesh, HardenReport(
            engine="manifold3d", ok=False, status=error or kind, genus=None,
            changed=False, before=before, after=before,
            note="hardening raised; kept the validated mesh",
        )

    import trimesh

    # ENG-006: Manifold3D's mesh is float32 vertices / uint32 faces, so the hardened mesh is
    # float32-derived — every vertex is perturbed to ~7 significant digits (sub-micron at
    # print scale, far below the gate's 0.5 mm tolerance). This is why the pipeline re-derives
    # the report's facts from the hardened mesh when it actually changed (ENG-001), rather
    # than assuming a bit-identical round-trip.
    hardened = trimesh.Trimesh(
        vertices=result["vertices"], faces=result["faces"], process=False
    )
    after = (len(hardened.vertices), len(hardened.faces))
    genus = result.get("genus")
    return hardened, HardenReport(
        engine="manifold3d", ok=True, status=str(result.get("status", "")),
        genus=int(genus) if genus is not None else None,
        changed=(after != before), before=before, after=after,
    )
