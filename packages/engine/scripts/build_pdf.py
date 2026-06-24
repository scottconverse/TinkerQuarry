"""Retired KimCad-era PDF generator.

TinkerQuarry's maintained user and architecture documentation now lives in:

- docs/USER-MANUAL.md
- docs/ARCHITECTURE.md
- docs/STATUS.md

This script remains only to prevent old automation from silently regenerating a
stale KimCad/KimCadClaude/MIT-branded PDF.
"""

from __future__ import annotations

import sys


def main() -> int:
    sys.stderr.write(
        "The old README-FULL.pdf generator has been retired. "
        "Use docs/USER-MANUAL.md and docs/ARCHITECTURE.md for the current "
        "TinkerQuarry v1.3.1 GPL-2.0-only documentation.\n",
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
