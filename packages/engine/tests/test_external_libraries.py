from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import pytest

import kimcad.external_libraries as extlibs
from kimcad.config import Config
from kimcad.openscad_runner import render_scad, sanitize_scad


def test_admit_library_copies_scad_subset_into_sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(extlibs, "writable_root", lambda: tmp_path / "appdata")
    source = tmp_path / "source"
    source.mkdir()
    (source / "threads.scad").write_text("module tq_thread() {}\n", encoding="utf-8")
    (source / "notes.md").write_text("# notes\n", encoding="utf-8")
    (source / "ignore.exe").write_bytes(b"nope")

    record = extlibs.admit_library("My Threads", str(source))

    assert record["slug"] == "my-threads"
    assert record["include_prefix"] == "external/my-threads/"
    assert record["scad_count"] == 1
    sandbox = Path(record["sandbox_path"])
    assert (sandbox / "threads.scad").read_text(encoding="utf-8").startswith("module")
    assert (sandbox / "notes.md").exists()
    assert not (sandbox / "ignore.exe").exists()
    assert extlibs.list_admitted()[0]["slug"] == "my-threads"
    public = extlibs.list_admitted(public=True)[0]
    assert public["slug"] == "my-threads"
    assert public["scad_count"] == 1
    assert "source_path" not in public
    assert "sandbox_path" not in public


def test_remove_admitted_library_removes_manifest_and_sandbox(tmp_path, monkeypatch):
    monkeypatch.setattr(extlibs, "writable_root", lambda: tmp_path / "appdata")
    source = tmp_path / "source"
    source.mkdir()
    (source / "lib.scad").write_text("module helper() {}\n", encoding="utf-8")
    record = extlibs.admit_library("Lib", str(source))

    assert extlibs.remove_admitted(record["slug"]) is True
    assert extlibs.list_admitted() == []
    assert not Path(record["sandbox_path"]).exists()


def test_admit_library_rejects_folder_without_scad(tmp_path, monkeypatch):
    monkeypatch.setattr(extlibs, "writable_root", lambda: tmp_path / "appdata")
    source = tmp_path / "source"
    source.mkdir()
    (source / "README.md").write_text("# docs only\n", encoding="utf-8")

    try:
        extlibs.admit_library("Docs Only", str(source))
    except ValueError as exc:
        assert "No .scad" in str(exc)
    else:
        raise AssertionError("docs-only library was admitted")


def test_sanitizer_allows_admitted_external_prefix_but_still_blocks_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(extlibs, "writable_root", lambda: tmp_path / "appdata")
    source = tmp_path / "source"
    source.mkdir()
    (source / "threads.scad").write_text("module helper() {}\n", encoding="utf-8")
    extlibs.admit_library("My Lib", str(source))

    ok = sanitize_scad("use <external/my-lib/threads.scad>;\ncube(1);")
    assert ok.safe

    bad = sanitize_scad("use <external/my-lib/../secret.scad>;\ncube(1);")
    assert not bad.safe

    missing = sanitize_scad("use <external/not-admitted/threads.scad>;\ncube(1);")
    assert not missing.safe


def test_concurrent_admissions_keep_manifest_valid(tmp_path, monkeypatch):
    monkeypatch.setattr(extlibs, "writable_root", lambda: tmp_path / "appdata")
    sources = []
    for idx in range(2):
        source = tmp_path / f"source-{idx}"
        source.mkdir()
        (source / f"lib{idx}.scad").write_text(f"module lib{idx}() {{}}\n", encoding="utf-8")
        sources.append(source)

    with ThreadPoolExecutor(max_workers=2) as pool:
        records = list(
            pool.map(
                lambda item: extlibs.admit_library(f"Lib {item[0]}", str(item[1])),
                enumerate(sources),
            )
        )

    rows = extlibs.list_admitted()
    assert {r["slug"] for r in rows} == {r["slug"] for r in records}
    for record in records:
        assert Path(record["sandbox_path"]).exists()


@pytest.mark.real_tool
def test_admitted_external_library_renders_with_real_openscad(tmp_path, monkeypatch):
    monkeypatch.setattr(extlibs, "writable_root", lambda: tmp_path / "appdata")
    source = tmp_path / "source"
    source.mkdir()
    (source / "helper.scad").write_text(
        "module external_helper(size=4) { cube([size,size,size], center=true); }\n",
        encoding="utf-8",
    )
    extlibs.admit_library("Render Lib", str(source))

    result = render_scad(
        "use <external/render-lib/helper.scad>;\nexternal_helper(5);",
        binary=Config.load().binary_path("openscad"),
        out_dir=tmp_path / "rendered",
        output_format="stl",
    )

    assert result.output_path.exists()
    assert result.output_path.stat().st_size > 0
