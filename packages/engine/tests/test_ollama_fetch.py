"""Unit tests for the portable-Ollama fetcher (kimcad.ollama_fetch).

Network is injected (a synthetic in-memory zip via a fake opener), so download → SHA-256 verify
→ zip-slip-guarded extract is proven here with no network. The full real ~1.4 GB fetch is proven
separately by the recorded manual cold-start run (docs/audits/coder-ui-qa-test-coldstart-2026-06-17/)
and by the Walkthrough lane (live bytes through this same path).
"""

from __future__ import annotations

import hashlib
import io
import zipfile
from pathlib import Path

import pytest

from kimcad import ollama_fetch as of


def _make_zip(members: dict[str, bytes]) -> bytes:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w") as zf:
        for name, content in members.items():
            zf.writestr(name, content)
    return bio.getvalue()


class _FakeResp:
    def __init__(self, data: bytes, *, send_length: bool = True) -> None:
        self._buf = io.BytesIO(data)
        self.headers = {"Content-Length": str(len(data))} if send_length else {}

    def read(self, n: int) -> bytes:
        return self._buf.read(n)

    def __enter__(self) -> "_FakeResp":
        return self

    def __exit__(self, *a: object) -> bool:
        return False


def _opener(data: bytes, *, send_length: bool = True):
    def _open(url: str, timeout: float | None = None) -> _FakeResp:
        return _FakeResp(data, send_length=send_length)

    return _open


def test_fetch_happy_path_extracts_and_reports_progress(tmp_path: Path) -> None:
    data = _make_zip({"ollama.exe": b"BINARY-CONTENT", "lib/ollama/runner.dll": b"RUN"})
    sha = hashlib.sha256(data).hexdigest()
    progress: list[tuple[int, int]] = []

    exe = of.fetch_portable_ollama(
        tmp_path,
        url="http://example/ollama.zip",
        sha256=sha,
        opener=_opener(data),
        progress=lambda d, t: progress.append((d, t)),
        chunk=4,
    )

    assert exe == tmp_path / "ollama.exe"
    assert (tmp_path / "ollama.exe").read_bytes() == b"BINARY-CONTENT"
    assert (tmp_path / "lib" / "ollama" / "runner.dll").read_bytes() == b"RUN"
    # progress climbed to the full size
    assert progress and progress[-1][0] == len(data)
    # the temp download was cleaned up
    assert not list(tmp_path.glob("kimcad-ollama-*.zip"))


def test_fetch_replaces_an_existing_version_dir_only_after_complete_extract(
    tmp_path: Path,
) -> None:
    """A managed-runtime upgrade is staged off to the side, then swapped into place.

    The prior runtime must not be mixed with files from the new archive.
    """
    dest = tmp_path / "v0.32.0"
    dest.mkdir()
    (dest / "ollama.exe").write_bytes(b"OLD")
    (dest / "stale.dll").write_bytes(b"STALE")
    data = _make_zip({"ollama.exe": b"NEW", "lib/ollama/runner.dll": b"RUN"})

    exe = of.fetch_portable_ollama(
        dest,
        sha256=hashlib.sha256(data).hexdigest(),
        opener=_opener(data),
    )

    assert exe.read_bytes() == b"NEW"
    assert (dest / "lib" / "ollama" / "runner.dll").read_bytes() == b"RUN"
    assert not (dest / "stale.dll").exists()
    assert not list(tmp_path.glob(".v0.32.0-*"))


def test_fetch_keeps_existing_runtime_when_staged_extract_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A partial extraction cannot replace the last complete managed runtime."""
    dest = tmp_path / "v0.32.0"
    dest.mkdir()
    (dest / "ollama.exe").write_bytes(b"KNOWN-GOOD")
    data = _make_zip({"ollama.exe": b"NEW"})

    def _partial_then_fail(_zf: zipfile.ZipFile, stage: Path) -> None:
        (stage / "ollama.exe").write_bytes(b"PARTIAL")
        raise of.OllamaFetchError("synthetic extraction failure")

    monkeypatch.setattr(of, "_safe_extract", _partial_then_fail)
    with pytest.raises(of.OllamaFetchError, match="synthetic extraction failure"):
        of.fetch_portable_ollama(
            dest,
            sha256=hashlib.sha256(data).hexdigest(),
            opener=_opener(data),
        )

    assert (dest / "ollama.exe").read_bytes() == b"KNOWN-GOOD"
    assert not list(tmp_path.glob(".v0.32.0-*"))


def test_fetch_unknown_length_falls_back_to_pinned_size(tmp_path: Path) -> None:
    data = _make_zip({"ollama.exe": b"X"})
    sha = hashlib.sha256(data).hexdigest()
    seen: list[tuple[int, int]] = []
    of.fetch_portable_ollama(
        tmp_path, sha256=sha, opener=_opener(data, send_length=False),
        progress=lambda d, t: seen.append((d, t)), chunk=1,
    )
    assert seen and all(t == of.PORTABLE_SIZE_BYTES for _, t in seen)


def test_fetch_rejects_hash_mismatch_without_extracting(tmp_path: Path) -> None:
    data = _make_zip({"ollama.exe": b"X"})
    with pytest.raises(of.OllamaFetchError, match="integrity"):
        of.fetch_portable_ollama(tmp_path, sha256="0" * 64, opener=_opener(data))
    assert not (tmp_path / "ollama.exe").exists()
    assert not list(tmp_path.glob("kimcad-ollama-*.zip"))  # temp cleaned even on failure


@pytest.mark.parametrize(
    "evil_name",
    [
        "../evil.txt",  # parent-dir traversal
        "C:/Windows/Temp/evil.txt",  # a drive-absolute Windows path
        "lib/../../evil.txt",  # traversal hidden inside an in-tree-looking prefix
        "..\\..\\evil.txt",  # backslash traversal (Windows separators in the member name)
    ],
)
def test_fetch_rejects_zip_slip(tmp_path: Path, evil_name: str) -> None:
    """TEST-GG-004: every flavor of unsafe archive member — parent traversal, a drive-absolute
    path, traversal hidden behind an in-tree prefix, and backslash separators — is refused
    BEFORE extraction, so a hostile/corrupt archive can never write outside the managed dir."""
    data = _make_zip({evil_name: b"PWN", "ollama.exe": b"X"})
    sha = hashlib.sha256(data).hexdigest()
    with pytest.raises(of.OllamaFetchError, match="unsafe path"):
        of.fetch_portable_ollama(tmp_path, sha256=sha, opener=_opener(data))
    assert not (tmp_path.parent / "evil.txt").exists()


def test_fetch_errors_when_exe_missing_from_archive(tmp_path: Path) -> None:
    data = _make_zip({"lib/ollama/runner.dll": b"RUN"})  # no ollama.exe
    sha = hashlib.sha256(data).hexdigest()
    with pytest.raises(of.OllamaFetchError, match="wasn't found"):
        of.fetch_portable_ollama(tmp_path, sha256=sha, opener=_opener(data))


def test_pinned_portable_release_is_the_proven_v0_32_0_asset() -> None:
    """The managed runtime must be the exact v0.32.0 Windows asset that passed the
    qwen3.5 release-blocker A/B, with every identity field pinned together."""
    assert of.PORTABLE_VERSION == "v0.32.0"
    assert of.PORTABLE_URL == (
        "https://github.com/ollama/ollama/releases/download/"
        "v0.32.0/ollama-windows-amd64.zip"
    )
    assert of.PORTABLE_SHA256 == (
        "56561a8f0a904483303c610e61af61c5a7b6f5496ce3707e207d25d4ff67b89e"
    )
    assert of.PORTABLE_SIZE_BYTES == 1_503_047_573
    assert 1.35 * 1024**3 < of.PORTABLE_SIZE_BYTES < 1.45 * 1024**3
