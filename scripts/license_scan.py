"""License gate for KimCad's GPL-2.0-only bundle (v1.5-1, spec §6.4).

Run with the ENGINE venv's interpreter — it scans the installed distributions of the running
environment plus the engine source tree:

    packages/engine/.venv/Scripts/python.exe scripts/license_scan.py

Three checks, all license-driven, scoped to the SHIPPED bundle — the distributions named in
``packages/engine/requirements.lock`` (what the installer venv contains). Dev-only tooling
(pytest, playwright, coverage …) is installed in the same venv but never distributed, so it
is out of scope by construction, not by exemption list.

1. FORBIDDEN packages must not appear in the lock or the venv (the openai SDK and its tail —
   removed in v1.5-1; their return would mean someone re-added the dependency).
2. ISOLATED_ONLY packages (Apache-2.0 geometry backends) may ship but must never be imported
   by in-process engine code — only by their ``*_worker.py`` subprocess files
   (arm's-length process boundary; FSF/ASF position: Apache-2.0 is not GPL-2.0-compatible).
3. Every other shipped distribution must carry a license from the GPL-2.0-only-compatible
   allowlist. Unknown/unparseable metadata FAILS the gate — triage it into OVERRIDES with the
   verified license and a source, so every exception is explicit and reviewable.

License-expression semantics: only a real SPDX ``License-Expression`` (PEP 639) carries a
formal grammar, so only there does ``OR`` mean a choice we may elect (ANY branch allowed
passes; ``AND`` requires every part). Bare ``License ::`` classifier lists have NO defined
OR/AND semantics — a second classifier may be a dual-license choice or may cover a bundled
component — so the fallback is conservative: EVERY classifier must be allowlisted, and a
genuine dual-license package that fails that goes into OVERRIDES as a human-verified,
documented election (see paho-mqtt).

Exit 0 = clean; exit 1 = violations (each printed); exit 2 = usage error.
"""

from __future__ import annotations

import ast
import re
import sys
from importlib import metadata
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ENGINE_SRC = REPO / "packages" / "engine" / "src" / "kimcad"
LOCK_FILE = REPO / "packages" / "engine" / "requirements.lock"

# Must not be installed in the bundle venv at all.
FORBIDDEN = {"openai", "distro"}

# Apache-2.0 backends: installed is fine, in-process import is not. Their transitive,
# equally-Apache runtime deps ride the same isolation argument (only imported by workers).
ISOLATED_ONLY = {"manifold3d", "cadquery"}

# Licenses (normalized, lowercase) that may link in-process with GPL-2.0-only.
# Apache-2.0 is deliberately absent — that incompatibility is this gate's reason to exist.
ALLOWED_LICENSES = {
    "mit", "mit license",
    "bsd", "bsd license", "bsd-2-clause", "bsd-3-clause", "0bsd",
    "isc", "isc license (iscl)",
    "python software foundation license", "psf-2.0", "python-2.0", "python-2.0.1",
    "mpl-2.0", "mozilla public license 2.0 (mpl 2.0)",
    "zlib", "zlib/libpng license",
    "mit-cmu",  # Pillow: the historic CMU/HPND-style permissive license, GPL-compatible
    "unlicense", "the unlicense (unlicense)", "public domain", "cc0-1.0",
    "hpnd", "historical permission notice and disclaimer (hpnd)",
    "lgpl-2.1", "lgpl-2.1-only", "lgpl-2.1-or-later",
    "gpl-2.0", "gpl-2.0-only", "gpl-2.0-or-later",
    "gnu general public license v2 or later (gplv2+)",
    "gnu library or lesser general public license (lgpl)",
}

# Distributions whose wheel metadata is missing/ambiguous, resolved by hand. Each entry
# states the verified license and where it was verified. Adding a package here is a code
# review event, not a config tweak.
OVERRIDES: dict[str, str] = {
    # pywebview's Windows backend pair; wheels ship no License metadata field.
    "clr-loader": "MIT (LICENSE in github.com/pythonnet/clr-loader)",
    "pythonnet": "MIT (LICENSE in github.com/pythonnet/pythonnet)",
    # Dual EPL-2.0 / EDL-1.0; EDL-1.0 is BSD-3-Clause in all but name and the dual grant
    # lets us elect it (LICENSE in github.com/eclipse-paho/paho.mqtt.python). Metadata says
    # only "OSI Approved".
    "paho-mqtt": "BSD-3-Clause (EDL-1.0 branch of the EPL/EDL dual license)",
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _canon(name: str) -> str:
    """PEP 503 name canonicalization: jaraco.classes == jaraco-classes == jaraco_classes."""
    return re.sub(r"[-_.]+", "-", _norm(name))


def _dist_license(dist: metadata.Distribution) -> tuple[str, str] | None:
    """Best license signal as ``(kind, value)``: a PEP 639 ``("expression", ...)`` with real
    SPDX grammar, else ``("classifiers", "a; b")`` (no grammar — treated conservatively),
    else ``("freetext", ...)`` from the License field's first line."""
    meta = dist.metadata
    expr = meta.get("License-Expression")
    if expr:
        return ("expression", expr)
    classifiers = [v for k, v in meta.items() if k == "Classifier"]
    lic = [c.split("::")[-1].strip() for c in classifiers if c.startswith("License ::")]
    if lic:
        return ("classifiers", "; ".join(lic))
    raw = meta.get("License")
    if raw:
        return ("freetext", raw.splitlines()[0][:120])
    return None


def _license_ok(name: str, signal: tuple[str, str] | None) -> bool:
    if name in OVERRIDES:
        # A human-verified election (e.g. the EDL branch of a dual license) — the override
        # text before the parenthesized source is the license we ship under.
        signal = ("freetext", OVERRIDES[name].split("(")[0])
    if not signal:
        return False
    kind, license_str = signal
    if kind == "expression":
        # Real SPDX grammar: OR is a choice (any allowed branch passes); AND needs all parts.
        for branch in re.split(r"\s+OR\s+", license_str):
            parts = [p for p in (_norm(p) for p in re.split(r"\s+AND\s+", branch)) if p]
            if parts and all(p in ALLOWED_LICENSES for p in parts):
                return True
        return False
    # Classifier lists / free text carry no OR grammar: conservatively require EVERY listed
    # license to be allowlisted. A genuine dual-license that fails this goes to OVERRIDES.
    parts = [p for p in (_norm(p) for p in license_str.split(";")) if p]
    return bool(parts) and all(p in ALLOWED_LICENSES for p in parts)


def _shipped_names(lock_file: Path = LOCK_FILE) -> set[str]:
    """Distribution names pinned in requirements.lock — the exact shipped-bundle set."""
    names: set[str] = set()
    for line in lock_file.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Za-z0-9][A-Za-z0-9._-]*)==", line.strip())
        if m:
            names.add(_canon(m.group(1)))
    return names


def check_installed() -> list[str]:
    shipped = _shipped_names()
    violations: list[str] = []
    seen: set[str] = set()
    for dist in metadata.distributions():
        name = _canon(dist.metadata.get("Name") or "")
        if not name:
            continue
        if name in FORBIDDEN:
            # Forbidden means gone from the venv entirely, shipped-set or not — a dev-only
            # reappearance is one `pip-compile` away from shipping again.
            violations.append(f"forbidden package installed: {name}")
            continue
        if name not in shipped or name in seen:
            continue  # dev-only tooling is not distributed; out of scope by construction
        seen.add(name)
        if name in ISOLATED_ONLY:
            continue  # allowed shipped; the import check enforces isolation
        lic = _dist_license(dist)
        if not _license_ok(name, lic):
            violations.append(
                f"license not allowlisted for in-process use: {name} "
                f"(metadata: {lic!r}) — verify and add to OVERRIDES with a source, "
                f"or remove/isolate the package"
            )
    missing = shipped - seen - FORBIDDEN - {"kimcad"}
    for name in sorted(missing):
        if name in ISOLATED_ONLY:
            continue
        violations.append(
            f"shipped package not installed in this venv, license unverified: {name} "
            f"(run the scan in an environment installed from requirements.lock)"
        )
    return violations


def _imported_roots(tree: "ast.Module"):
    """Yield ``(root_module, line)`` for every Import/ImportFrom node, however nested
    (function-local lazy imports included). AST-based so prose in docstrings/comments can
    never trip the gate (REVIEW finding, v1.5-1)."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name.split(".", 1)[0], node.lineno
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            yield node.module.split(".", 1)[0], node.lineno


def check_imports(src_root: Path = ENGINE_SRC) -> list[str]:
    watched = FORBIDDEN | ISOLATED_ONLY
    violations: list[str] = []
    for py in sorted(src_root.rglob("*.py")):
        text = py.read_text(encoding="utf-8", errors="replace")
        try:
            tree = ast.parse(text, filename=str(py))
        except SyntaxError as e:
            violations.append(f"cannot parse {py.relative_to(REPO)} for the import check: {e}")
            continue
        for pkg, line in _imported_roots(tree):
            if pkg not in watched:
                continue
            if pkg in ISOLATED_ONLY and py.name.endswith("_worker.py"):
                continue  # the worker subprocess files are the isolation boundary
            violations.append(
                f"in-process import of {pkg} at {py.relative_to(REPO)}:{line} "
                f"({'forbidden package' if pkg in FORBIDDEN else 'isolated-only: workers may import it, engine code may not'})"
            )
    return violations


def main() -> int:
    if not ENGINE_SRC.is_dir():
        print(f"ERROR: engine source not found at {ENGINE_SRC}", file=sys.stderr)
        return 2
    violations = check_installed() + check_imports()
    if violations:
        print("LICENSE GATE: FAIL")
        for v in violations:
            print(f"  {v}")
        return 1
    n = sum(1 for _ in metadata.distributions())
    print(f"LICENSE GATE: PASS ({n} distributions checked, imports clean)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
