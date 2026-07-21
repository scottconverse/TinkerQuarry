"""Guard: the engine package must not carry a committed, pre-built SPA.

Background (gate finding WALK-3, 2026-07-19): ``packages/engine/src/kimcad/web/`` held a
Vite build output that ``kimcad web`` served directly. It was last regenerated at 3d61bc5
(PR #23); ``apps/ui/src`` took eight more PRs before the v1.5.0 tag. Nothing checked its
freshness, so anyone who ran ``kimcad web`` standalone and opened the port got a materially
different, non-functional UI - an onboarding wizard ("Welcome to TinkerQuarry", "Skip
setup", "What do you want to make today?") whose copy no longer existed anywhere in
``apps/ui/src``.

The decision was to delete the bundle rather than wire a CI regeneration step: the
documented dev workflow already pairs ``kimcad web`` with ``pnpm dev`` for a fresh
frontend, and the installed release builds the frontend fresh via Tauri. ``kimcad web``
now serves a static placeholder that says where the real UI comes from.

This guard keeps it deleted. Re-commit a build output under the engine package and it goes
red with the reason, instead of quietly rotting for another eight PRs.

Run it:  python scripts/check_no_committed_spa_bundle.py
Exit 0 = clean. Exit 1 = a bundle (or a shell that references one) came back.

All printed text is ASCII on purpose: this runs on Windows consoles that default to cp1252.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = REPO_ROOT / "packages" / "engine" / "src" / "kimcad" / "web"
INDEX = WEB_DIR / "index.html"

# Build output extensions. Icons stay: favicon.ico / kim.ico are hand-made source assets the
# server and the WebView2 shell both reference, not Vite output.
BUILD_SUFFIXES = {".js", ".mjs", ".cjs", ".css", ".map", ".woff", ".woff2", ".ttf"}
ALLOWED_FILES = {"index.html", "favicon.ico", "kim.ico"}


def main() -> int:
    problems: list[str] = []

    if not WEB_DIR.is_dir():
        print(f"note: {WEB_DIR.relative_to(REPO_ROOT).as_posix()} does not exist - nothing to guard.")
        return 0

    stray = sorted(
        p.relative_to(WEB_DIR).as_posix()
        for p in WEB_DIR.rglob("*")
        if p.is_file()
        and "__pycache__" not in p.parts
        and (p.suffix.lower() in BUILD_SUFFIXES or p.name not in ALLOWED_FILES)
    )
    if stray:
        problems.append(
            "committed build output is back under packages/engine/src/kimcad/web/: "
            f"{stray}. That directory is served verbatim by `kimcad web` with no freshness "
            "check against apps/ui/src, which is how it went eight PRs stale and served an "
            "onboarding wizard that no longer existed in the source (WALK-3). Delete it; the "
            "dev workflow is `kimcad web` + `pnpm dev`, and releases build the frontend fresh "
            "through Tauri."
        )

    if not INDEX.is_file():
        problems.append(
            "packages/engine/src/kimcad/web/index.html is missing. `kimcad web` serves it at "
            "`/`, so removing it turns the port into a bare 404 with no explanation."
        )
    else:
        html = INDEX.read_text(encoding="utf-8")
        refs = sorted(set(re.findall(r'(?:src|href)="(/assets/[^"]+)"', html)))
        if refs:
            problems.append(
                f"the placeholder shell references bundled assets {refs}, which means it is a "
                "build artifact again, not a placeholder."
            )
        if "<title>TinkerQuarry" not in html:
            problems.append(
                "the placeholder shell's <title> must still start with 'TinkerQuarry' "
                "(tests/test_webapp.py asserts it on the live `/` response)."
            )
        if "pnpm dev" not in html:
            problems.append(
                "the placeholder shell does not tell the reader how to get the real UI "
                "(expected the `pnpm dev` workflow to be named). A placeholder that does not "
                "explain itself is no better than the stale bundle it replaced."
            )

    if problems:
        print("engine SPA-bundle guard FAILED:\n")
        for problem in problems:
            print(f"  FAIL {problem}\n")
        print(f"{len(problems)} problem(s). See the docstring in {Path(__file__).name}.")
        return 1

    print(
        "engine SPA-bundle guard OK: packages/engine/src/kimcad/web/ holds only the "
        "placeholder shell and its icons - no committed build output to go stale."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
