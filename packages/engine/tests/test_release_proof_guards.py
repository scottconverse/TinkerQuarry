"""Guard-of-the-guard for the two release-proof CI checks (TEST-2, rev 5).

The whole point of these scripts is to go RED on a specific regression. This branch's recurring
lesson is that a check which cannot fail is worse than none, so each hardening below is pinned by
proving the check catches the exact mutation it used to miss:

  * ``scripts/check_no_committed_spa_bundle.py`` used to ``return 0`` when the whole
    ``packages/engine/src/kimcad/web/`` tree was gone — a deletion that breaks the placeholder
    ``/`` page passed the guard. It must now fail.
  * ``scripts/check_release_gate_wiring.py`` check D used to test ``"head_sha" in yaml.safe_dump``,
    satisfiable by a ``# ... head_sha ...`` comment inside a run block. It must now look only at
    comment-stripped executable text.

These import the repo-root scripts by path (they live outside the engine package), so the test is
collected by the engine suite (``testpaths = ["tests"]``) and runs in CI.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = REPO_ROOT / "scripts"


def _load(name: str) -> ModuleType:
    path = SCRIPTS / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader, f"could not load {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- SPA-bundle guard ------------------------------------------------------------------

def test_spa_guard_passes_on_the_real_repo():
    guard = _load("check_no_committed_spa_bundle")
    assert guard.main() == 0, "the real repo should be clean (placeholder present, no bundle)"


def test_spa_guard_fails_when_the_placeholder_dir_is_deleted(monkeypatch):
    """The blind spot: a deleted web/ tree used to return 0. It must now fail — the placeholder
    served at `/` is a required artifact."""
    guard = _load("check_no_committed_spa_bundle")
    gone = guard.REPO_ROOT / "packages" / "engine" / "src" / "kimcad" / "web__DELETED__"
    monkeypatch.setattr(guard, "WEB_DIR", gone)
    monkeypatch.setattr(guard, "INDEX", gone / "index.html")
    assert guard.main() == 1, "deleting the whole placeholder dir must FAIL the guard, not pass it"


# --- release-gate wiring, check D ------------------------------------------------------

def test_release_gate_wiring_passes_on_the_real_repo():
    guard = _load("check_release_gate_wiring")
    assert guard.main() == 0, "the real repo's release-proof wiring should be intact"


def test_check_d_ignores_head_sha_that_lives_only_in_a_comment():
    """A run block that only *mentions* head_sha in a comment must not satisfy check D."""
    guard = _load("check_release_gate_wiring")
    comment_only = {
        "steps": [
            {
                "run": (
                    "# we compare head_sha here so only this tag's run counts\n"
                    "gh api repos/x/actions/workflows/release-gate.yml/runs\n"
                )
            }
        ]
    }
    exe = guard._executable_step_text(comment_only)
    assert "head_sha" not in exe, "the comment mentioning head_sha must be stripped from executable text"
    assert "release-gate.yml" in exe, "the real executable API path must survive comment stripping"


def test_check_d_accepts_a_real_head_sha_query():
    guard = _load("check_release_gate_wiring")
    real = {
        "steps": [
            {"run": 'runs_url="repos/x/actions/workflows/release-gate.yml/runs?head_sha=%s"\n'}
        ]
    }
    exe = guard._executable_step_text(real)
    assert "head_sha" in exe and "release-gate.yml" in exe
