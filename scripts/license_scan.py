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

License-expression semantics: ``OR`` (and multiple License classifiers, which declare a
choice) passes if ANY branch is allowed — we elect the compatible branch; ``AND`` requires
every part allowed.

Exit 0 = clean; exit 1 = violations (each printed); exit 2 = usage error.
"""

from __future__ import annotations

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


def _dist_license(dist: metadata.Distribution) -> str | None:
    """Best license signal: PEP 639 License-Expression, else OSI classifiers, else the
    free-text License field (first line)."""
    meta = dist.metadata
    expr = meta.get("License-Expression")
    if expr:
        return expr
    classifiers = [v for k, v in meta.items() if k == "Classifier"]
    lic = [c.split("::")[-1].strip() for c in classifiers if c.startswith("License ::")]
    if lic:
        return "; ".join(lic)
    raw = meta.get("License")
    if raw:
        return raw.splitlines()[0][:120]
    return None


def _license_ok(name: str, license_str: str | None) -> bool:
    if name in OVERRIDES:
        license_str = OVERRIDES[name].split("(")[0]
    if not license_str:
        return False
    # OR-branches (and ';'-joined classifier lists, which declare a licensing CHOICE) pass if
    # any branch is allowed; each branch may be an AND-compound where every part must pass.
    branches = re.split(r"\s+OR\s+|;", license_str)
    for branch in branches:
        parts = [p for p in (_norm(p) for p in re.split(r"\s+AND\s+", branch)) if p]
        if parts and all(p in ALLOWED_LICENSES for p in parts):
            return True
    return False


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


_IMPORT_RE = re.compile(
    r"^\s*(?:import|from)\s+(" + "|".join(sorted(FORBIDDEN | ISOLATED_ONLY)) + r")\b",
    re.MULTILINE,
)


def check_imports(src_root: Path = ENGINE_SRC) -> list[str]:
    violations: list[str] = []
    for py in sorted(src_root.rglob("*.py")):
        text = py.read_text(encoding="utf-8", errors="replace")
        for m in _IMPORT_RE.finditer(text):
            pkg = m.group(1)
            if pkg in ISOLATED_ONLY and py.name.endswith("_worker.py"):
                continue  # the worker subprocess files are the isolation boundary
            line = text.count("\n", 0, m.start()) + 1
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
