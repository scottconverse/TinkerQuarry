"""Guard: no public-facing doc may present the WITHDRAWN v1.5.0 build as the current release.

Background (v1.5.1 re-gate, 2026-07-22): v1.5.0 was published, failed its GauntletGate, and was
moved back to pre-release; v1.4.0 is the current release (docs/STATUS.md is the source of truth).
STATUS.md and the README Install section were corrected, but the correction never fully propagated:
README's "## What Is In v1.5.0" still called v1.5.0 "the current product line", the landing page's
hero + footer still branded the page "v1.5.0" while its Download button resolves to v1.4.0, and a
"public v1.5.0 release" line survived. A first-time visitor hit a document that contradicted itself.

This guard fails if any of README.md / docs/index.html / docs/STATUS.md reintroduces a "v1.5.0 is
current" claim, brands the product as v1.5.0, or hardcodes a link to the withdrawn tag. It does NOT
forbid mentioning v1.5.0 — the withdrawal itself has to be documented ("v1.5.0 was moved back to
pre-release", "signed as of v1.5.0", "Not v1.5.0"). It targets only the current-claim phrasings.

When v1.5.0 is eventually re-cut or superseded, update WITHDRAWN below.

Run it:  python scripts/check_no_withdrawn_version_claims.py
Exit 0 = clean. Exit 1 = a doc presents the withdrawn build as current (printed).

All printed text is ASCII on purpose: this runs on Windows consoles that default to cp1252.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WITHDRAWN = "1.5.0"

FILES = ["README.md", "docs/index.html", "docs/STATUS.md"]

# (compiled pattern, human explanation). Each targets a CURRENT-claim phrasing, never a bare mention.
_V = re.escape(f"v{WITHDRAWN}")
BAD_PATTERNS = [
    (re.compile(rf"releases/tag/{re.escape('v' + WITHDRAWN)}"),
     f"a hardcoded link to the withdrawn {WITHDRAWN} tag - use /releases/latest so it resolves to the current release"),
    (re.compile(rf"current\s+product\s+line\s+is\s+\**\s*TinkerQuarry\s+{_V}", re.IGNORECASE),
     f"'current product line is TinkerQuarry v{WITHDRAWN}' - v{WITHDRAWN} is withdrawn"),
    (re.compile(rf"{_V}[^\n]{{0,40}}\bis\s+the\s+current\s+release", re.IGNORECASE),
     f"'v{WITHDRAWN} is the current release' - it is withdrawn to pre-release"),
    (re.compile(rf"\bpublic\s+{_V}\s+release\b", re.IGNORECASE),
     f"'public v{WITHDRAWN} release' - v{WITHDRAWN} is withdrawn to pre-release"),
    (re.compile(rf"{_V}\s+Windows\s+beta", re.IGNORECASE),
     f"the landing hero brands the page as the v{WITHDRAWN} beta - v{WITHDRAWN} is withdrawn"),
    (re.compile(rf"TinkerQuarry\s+{_V}\s*/"),
     f"the landing footer brands the product as v{WITHDRAWN} - it is withdrawn"),
]


def main() -> int:
    problems: list[str] = []
    for rel in FILES:
        path = REPO_ROOT / rel
        if not path.is_file():
            problems.append(f"{rel} is missing - the guard cannot check it.")
            continue
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), 1):
            for pattern, why in BAD_PATTERNS:
                if pattern.search(line):
                    problems.append(f"{rel}:{line_no}: {why}\n      -> {line.strip()[:120]}")

    if problems:
        print("withdrawn-version-claim guard FAILED:\n")
        for problem in problems:
            print(f"  FAIL {problem}\n")
        print(
            f"{len(problems)} problem(s). v{WITHDRAWN} is withdrawn; docs/STATUS.md is the source of "
            f"truth (v1.4.0 current). See the docstring in {Path(__file__).name}."
        )
        return 1

    print(
        f"withdrawn-version-claim guard OK: no public doc presents the withdrawn v{WITHDRAWN} as current."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
