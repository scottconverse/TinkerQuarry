import pytest

from kimcad.config import PROJECT_ROOT
from kimcad.config import Config
from kimcad.llm_provider import build_library_manifest
from kimcad.openscad_runner import render_scad
from kimcad.openscad_runner import sanitize_scad


VENDOR_DIR = PROJECT_ROOT / "library" / "vendor"


def test_approved_vendor_libraries_are_present_with_attribution():
    expected = {
        "BOSL2",
        "Round-Anything",
        "YAPP_Box",
        "gridfinity-rebuilt-openscad",
    }
    assert expected <= {p.name for p in VENDOR_DIR.iterdir() if p.is_dir()}
    assert not (VENDOR_DIR / "catchnhole").exists()
    assert not (VENDOR_DIR / "MCAD").exists()
    assert not (VENDOR_DIR / "tq-threads").exists()

    attribution = (VENDOR_DIR / "ATTRIBUTION.md").read_text(encoding="utf-8")
    for name in expected:
        assert name in attribution
    for removed in ("Catch'n'Hole", "MCAD", "tq-threads"):
        assert removed not in attribution


def test_first_party_threads_wrapper_replaces_tq_threads_vendor_tree():
    attribution = (VENDOR_DIR / "ATTRIBUTION.md").read_text(encoding="utf-8")
    manifest = (PROJECT_ROOT / "library" / "manifest.yaml").read_text(encoding="utf-8")
    assert "first-party `library/threads.scad`" in attribution
    assert "threads.scad" in manifest
    assert "tq_metric_bolt" in manifest
    assert (PROJECT_ROOT / "library" / "threads.scad").exists()
    assert not (VENDOR_DIR / "tq-threads").exists()


def test_gpl3_threads_library_is_not_vendored():
    assert not (VENDOR_DIR / "gridfinity-rebuilt-openscad" / "src" / "external" / "threads-scad").exists()
    attribution = (VENDOR_DIR / "ATTRIBUTION.md").read_text(encoding="utf-8")
    assert "is not bundled" in attribution
    assert "GPL-3.0-or-later" in attribution


def test_vendor_manifest_entries_are_advertised_and_sandbox_approved():
    manifest = build_library_manifest()
    for include in (
        "threads.scad",
        "vendor/BOSL2/std.scad",
        "vendor/Round-Anything/polyround.scad",
        "vendor/YAPP_Box/YAPPgenerator_v3.scad",
        "vendor/gridfinity-rebuilt-openscad/src/core/base.scad",
    ):
        assert f"use <library/{include}>;" in manifest
        result = sanitize_scad(f"use <library/{include}>;\ncube(1);")
        assert result.safe, include
        assert not result.blocked
    for removed in (
        "vendor/catchnhole/catchnhole.scad",
        "vendor/MCAD/regular_shapes.scad",
        "vendor/tq-threads/tq_threads.scad",
    ):
        assert f"use <library/{removed}>;" not in manifest


@pytest.mark.real_tool
def test_first_party_threads_wrapper_renders_with_real_openscad(tmp_path):
    binary = Config.load().binary_path("openscad")
    smokes = {
        "thread_rod": "use <library/threads.scad>;\ntq_threaded_rod(d=8, pitch=1.25, length=16, fn=32);\n",
        "thread_bolt_nut": (
            "use <library/threads.scad>;\n"
            "tq_metric_bolt(size=6, length=18, head=\"hex\", fn=32);\n"
            "translate([18,0,0]) tq_metric_nut(size=6, fn=32);\n"
        ),
        "threaded_hole": (
            "use <library/threads.scad>;\n"
            "difference() { cube([24,24,12]); "
            "translate([12,12,-0.1]) tq_threaded_hole(d=8, pitch=1.25, depth=12.2, fn=32); }\n"
        ),
    }
    for name, code in smokes.items():
        result = render_scad(code, binary=binary, out_dir=tmp_path / name, output_format="stl", timeout_s=180)
        assert result.output_path.stat().st_size > 10_000


@pytest.mark.real_tool
def test_kept_gridfinity_vendor_core_renders_with_real_openscad(tmp_path):
    result = render_scad(
        "use <library/vendor/gridfinity-rebuilt-openscad/src/core/base.scad>;\n"
        "gridfinityBase([1,1], thumbscrew=false);\n",
        binary=Config.load().binary_path("openscad"),
        out_dir=tmp_path,
        output_format="stl",
        timeout_s=180,
    )
    assert result.output_path.stat().st_size > 10_000
