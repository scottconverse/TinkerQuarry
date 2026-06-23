from pathlib import Path

from kimcad.config import PROJECT_ROOT
from kimcad.llm_provider import build_library_manifest
from kimcad.openscad_runner import sanitize_scad


VENDOR_DIR = PROJECT_ROOT / "library" / "vendor"


def test_approved_vendor_libraries_are_present_with_attribution():
    expected = {
        "BOSL2",
        "Round-Anything",
        "YAPP_Box",
        "catchnhole",
        "gridfinity-rebuilt-openscad",
        "MCAD",
        "tq-threads",
    }
    assert expected <= {p.name for p in VENDOR_DIR.iterdir() if p.is_dir()}

    attribution = (VENDOR_DIR / "ATTRIBUTION.md").read_text(encoding="utf-8")
    for name in expected:
        assert name in attribution


def test_tq_threads_vendor_pin_and_provenance_are_current():
    attribution = (VENDOR_DIR / "ATTRIBUTION.md").read_text(encoding="utf-8")
    manifest = (PROJECT_ROOT / "library" / "manifest.yaml").read_text(encoding="utf-8")
    assert "cdfd4cc6a1d6baaa7f2a50ea5b9073fe43460e00" in attribution
    assert "v0.4.0" in attribution
    assert "cdfd4cc6a1d6baaa7f2a50ea5b9073fe43460e00" in manifest
    assert (VENDOR_DIR / "tq-threads" / "PROVENANCE.md").exists()
    assert (VENDOR_DIR / "tq-threads" / "ACCEPTANCE-REPORT-v0.4.0.md").exists()


def test_gpl3_threads_library_is_not_vendored():
    assert not (VENDOR_DIR / "gridfinity-rebuilt-openscad" / "src" / "external" / "threads-scad").exists()
    attribution = (VENDOR_DIR / "ATTRIBUTION.md").read_text(encoding="utf-8")
    assert "is not bundled" in attribution
    assert "GPL-3.0-or-later" in attribution


def test_vendor_manifest_entries_are_advertised_and_sandbox_approved():
    manifest = build_library_manifest()
    for include in (
        "vendor/BOSL2/std.scad",
        "vendor/Round-Anything/polyround.scad",
        "vendor/YAPP_Box/YAPPgenerator_v3.scad",
        "vendor/catchnhole/catchnhole.scad",
        "vendor/gridfinity-rebuilt-openscad/gridfinity-rebuilt-lite.scad",
        "vendor/MCAD/regular_shapes.scad",
        "vendor/tq-threads/tq_threads.scad",
    ):
        assert f"use <library/{include}>;" in manifest
        result = sanitize_scad(f"use <library/{include}>;\ncube(1);")
        assert result.safe, include
        assert not result.blocked
