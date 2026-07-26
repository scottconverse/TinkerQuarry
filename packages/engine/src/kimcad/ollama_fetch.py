"""Fetch the portable Ollama runtime — the network half of the managed runtime (UX-COLD-001).

When a fresh machine has no system Ollama, KimCad downloads Ollama's official **portable**
Windows build (``ollama-windows-amd64.zip``, MIT-licensed, the artifact Ollama documents "for
embedding Ollama in existing applications, or running it as a system service via ``ollama
serve``") and unzips it into KimCad's per-user data dir. No installer, no admin, no tray app,
no background auto-updater — just the binary KimCad manages itself.

Pinned + integrity-checked: the version, URL, and SHA-256 are pinned to a known release
(verified against the GitHub release asset digest), and the download is rejected on hash
mismatch BEFORE anything is extracted. Extraction is zip-slip-guarded (exact, in-tree members
only), matching the rigor of :mod:`kimcad.design_store`'s import path.

Kept import-light and effect-injected: ``opener`` (the URL fetch) is a parameter, so the
download/verify/extract logic is unit-tested with a synthetic in-memory zip and a SHA-256 pin
(no network). The full REAL ~1.4 GB fetch+extract+serve is proven separately by the recorded
manual cold-start run (``docs/audits/coder-ui-qa-test-coldstart-2026-06-17/``) and by the
Walkthrough lane, which drives live bytes through this path.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable

# Pinned Ollama portable Windows build. v0.32.0 is the exact runtime used by the qwen3.5
# benchmark and the 2026-07-26 release-blocker A/B: unchanged v1.5.1 model tests were 1/3
# on v0.30.9 and 3/3 on v0.32.0 at the same 4096-token context. The asset identity below
# was independently verified against GitHub's release API. Bump deliberately: version,
# SHA-256, and exact size always move together.
PORTABLE_VERSION = "v0.32.0"
PORTABLE_ASSET = "ollama-windows-amd64.zip"
PORTABLE_URL = (
    f"https://github.com/ollama/ollama/releases/download/{PORTABLE_VERSION}/{PORTABLE_ASSET}"
)
PORTABLE_SHA256 = "56561a8f0a904483303c610e61af61c5a7b6f5496ce3707e207d25d4ff67b89e"
# The exact byte size of the pinned v0.32.0 ``ollama-windows-amd64.zip`` release asset
# (`gh api .../assets`, same 2026-07-26 verification as the SHA above). Used only to show honest
# progress when the server omits a Content-Length. The integrity check is the SHA-256, never the
# size. (≈1.4 GB)
PORTABLE_SIZE_BYTES = 1_503_047_573


class OllamaFetchError(RuntimeError):
    """A friendly, displayable failure of the portable-runtime download/verify/extract."""


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    """Extract every member into ``dest``, refusing any absolute path or ``..`` traversal
    (zip-slip). Mirrors design_store's exact-member discipline: a hostile/corrupt archive can
    never write outside the managed dir."""
    dest = dest.resolve()
    for member in zf.infolist():
        name = member.filename
        if name.endswith("/"):
            continue  # directory entry; created implicitly by file members
        target = (dest / name).resolve()
        try:
            target.relative_to(dest)
        except ValueError:
            raise OllamaFetchError(
                f"refusing to extract unsafe path from the Ollama archive: {name!r}"
            ) from None
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, open(target, "wb") as out:
            out.write(src.read())


def fetch_portable_ollama(
    dest_dir: Path,
    *,
    url: str = PORTABLE_URL,
    sha256: str = PORTABLE_SHA256,
    opener: Callable[[str], Any] = urllib.request.urlopen,
    progress: Callable[[int, int], None] | None = None,
    chunk: int = 1 << 20,
    timeout: float = 60.0,
) -> Path:
    """Download the pinned portable Ollama zip, verify its SHA-256, and stage it beside
    ``dest_dir`` before swapping the complete tree into place. Returns the path to the
    extracted ``ollama.exe``. Reports
    ``progress(downloaded_bytes, total_bytes)`` as it streams (``total`` is 0 when unknown).
    Raises :class:`OllamaFetchError` on a hash mismatch (before extracting) or a bad archive.

    The download streams to a temp file (a 1.4 GB blob never sits whole in RAM) that is removed
    after extraction. A partial download or extraction never mutates an existing runtime; only
    a fully verified, fully extracted tree crosses the final rename boundary."""
    dest_dir = Path(dest_dir)
    dest_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(
            prefix=f".{dest_dir.name}-staging-",
            dir=str(dest_dir.parent),
        )
    )
    hasher = hashlib.sha256()
    tmp_fd, tmp_name = tempfile.mkstemp(
        prefix="kimcad-ollama-", suffix=".zip", dir=str(staging)
    )
    tmp = Path(tmp_name)
    try:
        with os.fdopen(tmp_fd, "wb") as out, opener(url, timeout=timeout) as resp:  # type: ignore[call-arg]
            total = 0
            try:
                total = int(resp.headers.get("Content-Length") or 0)
            except (AttributeError, TypeError, ValueError):
                total = 0
            if not total:
                total = PORTABLE_SIZE_BYTES
            done = 0
            while True:
                buf = resp.read(chunk)
                if not buf:
                    break
                out.write(buf)
                hasher.update(buf)
                done += len(buf)
                if progress is not None:
                    progress(done, total)
        got = hasher.hexdigest()
        if got.lower() != sha256.lower():
            raise OllamaFetchError(
                "The downloaded Ollama runtime failed its integrity check "
                f"(expected {sha256[:12]}…, got {got[:12]}…). Nothing was installed; "
                "check your internet connection and try again."
            )
        try:
            with zipfile.ZipFile(tmp) as zf:
                _safe_extract(zf, staging)
        except zipfile.BadZipFile as e:
            raise OllamaFetchError(
                "The downloaded Ollama runtime archive was corrupt; nothing was installed. "
                "Check your internet connection and try again."
            ) from e
        tmp.unlink(missing_ok=True)

        staged_exe = staging / ("ollama.exe" if os.name == "nt" else "ollama")
        if not staged_exe.exists():
            raise OllamaFetchError(
                "The Ollama runtime download extracted, but the expected executable wasn't found. "
                "Please try again, or install Ollama from ollama.com."
            )

        # A same-volume directory rename is the commit point. If a corrupt/partial target from an
        # interrupted earlier attempt exists, preserve it until the complete staged tree has been
        # promoted; restore it if promotion fails.
        backup: Path | None = None
        if dest_dir.exists():
            backup = staging.with_name(staging.name.replace("-staging-", "-backup-", 1))
            os.replace(dest_dir, backup)
        try:
            os.replace(staging, dest_dir)
        except OSError:
            if backup is not None and backup.exists() and not dest_dir.exists():
                os.replace(backup, dest_dir)
            raise
        if backup is not None:
            shutil.rmtree(backup, ignore_errors=True)

        return dest_dir / staged_exe.name
    finally:
        tmp.unlink(missing_ok=True)
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
