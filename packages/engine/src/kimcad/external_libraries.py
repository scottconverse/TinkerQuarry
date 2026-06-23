"""Admitted external OpenSCAD libraries.

Users can point at a library they installed themselves, but the renderer never trusts that
path directly. Admission copies a small, SCAD-oriented subset into the app's writable data
root and exposes it under ``external/<slug>/...`` for OpenSCAD include/use statements.
"""

from __future__ import annotations

import json
import re
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any

from kimcad.paths import writable_root

_ALLOWED_SUFFIXES = {".scad", ".md", ".txt", ".json", ".yaml", ".yml"}
_MAX_FILES = 2_000
_MAX_BYTES = 50 * 1024 * 1024
_LOCK = threading.Lock()


def _state_root() -> Path:
    return writable_root() / "external_scad_libraries"


def sandbox_root() -> Path:
    """The OPENSCADPATH root that contains admitted ``external/<slug>/`` folders."""
    return _state_root() / "sandbox"


def _manifest_path() -> Path:
    return _state_root() / "manifest.json"


def _slug(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "-", name.strip()).strip(".-").lower()
    return slug or "library"


def _read_manifest() -> list[dict[str, Any]]:
    try:
        data = json.loads(_manifest_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return data if isinstance(data, list) else []


def _write_manifest(rows: list[dict[str, Any]]) -> None:
    path = _manifest_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    temp.replace(path)


def _public_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": record.get("name"),
        "slug": record.get("slug"),
        "include_prefix": record.get("include_prefix"),
        "file_count": record.get("file_count"),
        "scad_count": record.get("scad_count"),
        "bytes": record.get("bytes"),
    }


def list_admitted(*, public: bool = False) -> list[dict[str, Any]]:
    rows = _read_manifest()
    if public:
        return [_public_record(r) for r in rows]
    return rows


def admitted_slugs() -> set[str]:
    return {
        str(r.get("slug"))
        for r in _read_manifest()
        if isinstance(r.get("slug"), str) and r.get("slug")
    }


def remove_admitted(slug_or_name: str) -> bool:
    with _LOCK:
        key = slug_or_name.strip()
        rows = _read_manifest()
        match = next((r for r in rows if r.get("slug") == key or r.get("name") == key), None)
        kept = [r for r in rows if r is not match]
        if match:
            shutil.rmtree(sandbox_root() / "external" / str(match.get("slug")), ignore_errors=True)
        _write_manifest(kept)
        return match is not None


def admit_library(name: str, source_path: str) -> dict[str, Any]:
    with _LOCK:
        source = Path(source_path).expanduser().resolve()
        if not source.is_dir():
            raise ValueError("Choose a folder that exists.")
        clean_name = name.strip() or source.name
        slug = _slug(clean_name)
        target = sandbox_root() / "external" / slug
        temp = target.with_name(f".{slug}.{uuid.uuid4().hex}.tmp")
        temp.mkdir(parents=True, exist_ok=True)

        file_count = 0
        scad_count = 0
        byte_count = 0
        try:
            for item in source.rglob("*"):
                if item.is_symlink():
                    continue
                if not item.is_file() or item.suffix.lower() not in _ALLOWED_SUFFIXES:
                    continue
                rel = item.relative_to(source)
                if any(part.startswith(".") for part in rel.parts):
                    continue
                size = item.stat().st_size
                file_count += 1
                if item.suffix.lower() == ".scad":
                    scad_count += 1
                byte_count += size
                if file_count > _MAX_FILES or byte_count > _MAX_BYTES:
                    raise ValueError("Library is too large to admit safely.")
                dest = temp / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, dest)

            if scad_count == 0:
                raise ValueError("No .scad library files were found in that folder.")

            if target.exists():
                shutil.rmtree(target)
            temp.rename(target)
        except Exception:
            shutil.rmtree(temp, ignore_errors=True)
            raise

        record = {
            "name": clean_name,
            "slug": slug,
            "source_path": str(source),
            "sandbox_path": str(target),
            "include_prefix": f"external/{slug}/",
            "file_count": file_count,
            "scad_count": scad_count,
            "bytes": byte_count,
        }
        rows = [r for r in _read_manifest() if r.get("slug") != slug and r.get("name") != clean_name]
        rows.append(record)
        _write_manifest(rows)
        return record
