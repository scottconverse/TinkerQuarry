"""Tests for the Manifold3D pre-slice hardening pass (Stage 1, Slice 4)."""

import sys

import numpy as np
import pytest
import trimesh

from kimcad.hardening import HardenReport, harden_mesh

_HAS_MANIFOLD = True
try:
    import manifold3d  # noqa: F401
except ImportError:  # pragma: no cover
    _HAS_MANIFOLD = False


@pytest.mark.needs_manifold
@pytest.mark.skipif(not _HAS_MANIFOLD, reason="manifold3d not installed")
def test_harden_clean_box_is_manifold_and_preserved():
    box = trimesh.creation.box(extents=[20, 20, 10])
    out, rep = harden_mesh(box)
    assert rep.engine == "manifold3d"
    assert rep.ok is True
    assert rep.genus == 0
    # geometry preserved: still watertight, same volume + extents
    assert out.is_watertight
    assert abs(out.volume - box.volume) < 1.0
    assert np.allclose(sorted(out.extents), sorted(box.extents), atol=1e-3)


@pytest.mark.needs_manifold
@pytest.mark.skipif(not _HAS_MANIFOLD, reason="manifold3d not installed")
def test_harden_hollow_box_keeps_genus_zero_solid():
    # A box with a smaller box subtracted would be genus 0; a true torus is genus 1.
    # Use a plain solid here (boolean backend independent) — the point is the round-trip
    # yields a clean manifold with a sensible genus.
    box = trimesh.creation.box(extents=[30, 20, 10])
    out, rep = harden_mesh(box)
    assert rep.ok and rep.genus == 0
    assert out.is_watertight


@pytest.mark.needs_manifold
@pytest.mark.skipif(not _HAS_MANIFOLD, reason="manifold3d not installed")
def test_harden_torus_reports_genus_one():
    # NEW-3: a real genus-1 solid (a torus) exercises the non-zero-genus path that the
    # solid-box test never reaches.
    torus = trimesh.creation.torus(major_radius=12.0, minor_radius=4.0)
    out, rep = harden_mesh(torus)
    assert rep.ok is True
    assert rep.genus == 1
    assert out.is_watertight


@pytest.mark.needs_manifold
@pytest.mark.skipif(not _HAS_MANIFOLD, reason="manifold3d not installed")
def test_harden_rejects_real_nonmanifold_mesh_keeps_original():
    # TEST-003: drive the real rejection branch — an open (non-manifold) mesh that
    # Manifold3D can't build into a clean manifold returns the original, ok=False.
    box = trimesh.creation.box(extents=[20, 20, 20])
    open_mesh = trimesh.Trimesh(
        vertices=box.vertices.copy(), faces=box.faces[1:].copy(), process=False
    )
    out, rep = harden_mesh(open_mesh)
    assert rep.engine == "manifold3d"
    assert rep.ok is False
    assert out is open_mesh  # the validated mesh is returned unchanged


def test_harden_exception_path_keeps_validated_mesh(monkeypatch):
    # TEST-003: if the worker fails mid-run (crash/timeout/raise), hardening must swallow it
    # and return the original mesh (the "never raises" contract). Since v1.5-1 the manifold
    # round-trip lives in a subprocess, so the failure is injected at the worker seam — the
    # real in-worker exception path is the same reporting branch, exercised end-to-end by
    # test_harden_rejects_real_nonmanifold_mesh_keeps_original.
    from kimcad import hardening

    monkeypatch.setattr(
        hardening, "_invoke_worker",
        lambda mesh: {"ok": False, "kind": "exec", "error": "RuntimeError: manifold boom"},
    )
    box = trimesh.creation.box(extents=[10, 10, 10])
    out, rep = harden_mesh(box)
    assert rep.engine == "manifold3d"
    assert rep.ok is False
    assert out is box
    assert "hardening raised" in rep.note


def test_harden_skips_cleanly_when_manifold3d_absent(monkeypatch):
    # Simulate manifold3d not being installed: the worker reports the import failure and
    # the original mesh is returned unchanged with a clear note. (The worker-side ImportError
    # branch itself is three lines of manifold_worker._run; this drives the parent mapping.)
    from kimcad import hardening

    monkeypatch.setattr(
        hardening, "_invoke_worker",
        lambda mesh: {
            "ok": False, "kind": "import",
            "error": "manifold3d unavailable (No module named 'manifold3d')",
        },
    )
    box = trimesh.creation.box(extents=[10, 10, 10])
    out, rep = harden_mesh(box)
    assert rep.engine == "skipped"
    assert rep.ok is False
    assert out is box  # untouched pass-through
    assert "unavailable" in rep.summary()


@pytest.mark.needs_manifold
@pytest.mark.skipif(not _HAS_MANIFOLD, reason="manifold3d not installed")
def test_harden_never_imports_manifold3d_in_process():
    """v1.5-1 license boundary: manifold3d (Apache-2.0) must run only in the worker
    subprocess — a successful harden leaves no manifold3d module in THIS interpreter."""
    saved = sys.modules.pop("manifold3d", None)
    try:
        box = trimesh.creation.box(extents=[15, 15, 15])
        out, rep = harden_mesh(box)
        assert rep.engine == "manifold3d" and rep.ok is True
        assert out.is_watertight
        assert "manifold3d" not in sys.modules
    finally:
        if saved is not None:
            sys.modules["manifold3d"] = saved


def test_harden_report_summary_strings():
    ok = HardenReport(
        engine="manifold3d", ok=True, status="Error.NoError", genus=0,
        changed=False, before=(8, 12), after=(8, 12),
    )
    assert "manifold3d" in ok.summary() and "genus 0" in ok.summary()
    repaired = HardenReport(
        engine="manifold3d", ok=True, status="Error.NoError", genus=0,
        changed=True, before=(10, 16), after=(8, 12),
    )
    assert "repaired" in repaired.summary()
    failed = HardenReport(
        engine="manifold3d", ok=False, status="Error.NotManifold", genus=None,
        changed=False, before=(8, 12), after=(8, 12),
    )
    assert "could not build a manifold" in failed.summary()
