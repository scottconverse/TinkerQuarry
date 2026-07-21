"""TEST-003: static frontend-contract checks for the web UI.

Stage 4 replaced the old single-file vanilla-JS page with a React + TypeScript SPA built
by Vite (build-time only) into ``src/kimcad/web`` and served by the Python server. The
committed build output is what ships — there is no Node toolchain at runtime — so these
checks read the built artifacts on disk and assert, by simple presence, that:

  1. the built ``index.html`` shell mounts the SPA (``id="root"``) and references its
     bundled module + stylesheet under ``/assets/``; and
  2. every asset the shell references actually exists in ``web/assets/`` (so a stale or
     missing build can't be served as a blank page).

The server-side half of the contract — that ``/`` serves this shell and ``/assets/<file>``
serves the bundles (with traversal rejected) — is covered in tests/test_webapp.py.

The frontend↔backend FIELD contract (the SPA consuming ``gate_status`` / ``clarification`` /
the printer-status vocabulary, etc.) is asserted against the TypeScript source as those
flows are wired in the later Stage 4 slices (design flow, then printer/slice/send); the
shell built in the first slice does not consume those fields yet, so there is nothing to
assert about them here.

Kept deliberately robust: presence checks on the build output, not DOM parsing or JS
execution, so cosmetic edits don't make it brittle, but a missing/stale build trips it.
"""

from __future__ import annotations

import re

from kimcad.webapp import WEB_DIR

_HTML = (WEB_DIR / "index.html").read_text(encoding="utf-8")


# --- WALK-3 (GauntletGate 2026-07-19): the committed SPA bundle is GONE ------------------
#
# Six tests used to live here asserting the built bundle's shape: that index.html mounted
# #root and pulled /assets/*.js, that every referenced asset existed, that a stylesheet was
# linked, that the built CSS carried the theme tokens and the three self-hosted woff2 fonts,
# and that three.js was code-split into Workspace.js.
#
# They were removed with the artifact they described, not silently: `kimcad web` served a
# bundle that was EIGHT PRs stale (last regenerated at 3d61bc5) and rendered an onboarding
# wizard that no longer exists anywhere in apps/ui/src. Nothing here could ever have caught
# that, because every one of those assertions was about the bundle's INTERNAL consistency —
# a perfectly self-consistent, perfectly stale build passed all six.
#
# Worth being blunt about what was actually lost: nothing that guarded the shipped product.
# The Tauri installer builds its frontend fresh from apps/ui at release time
# (tauri.conf.json frontendDist), so this bundle was never the shipped artifact. These tests
# verified a build that no user ever ran. The theme-token and code-split checks that DO
# matter belong to apps/ui's own suite, against the build that actually ships.
#
# What replaces them below is the contract that now holds: a self-contained placeholder that
# tells the reader where the real UI is, and does not hand out the session token.
# `scripts/check_no_committed_spa_bundle.py` keeps the bundle from creeping back.


def test_served_page_is_the_standalone_placeholder_not_a_stale_spa():
    """`kimcad web` serves a placeholder, not a compiled SPA. If a bundle is ever recommitted,
    this fails — a stale UI served silently is exactly what WALK-3 was filed for."""
    assert (WEB_DIR / "index.html").exists()
    assert 'id="root"' not in _HTML, (
        "a React mount point is back in the served page — the committed SPA bundle has returned"
    )
    assert not re.search(r'<script[^>]+src="/assets/', _HTML), (
        "the served page references a bundled script again; the placeholder must be self-contained"
    )
    assert not (WEB_DIR / "assets").is_dir(), (
        "web/assets/ is back on disk — the stale committed bundle has been recommitted"
    )


def test_placeholder_explains_where_the_real_ui_is():
    """The point of the placeholder is that someone who runs `kimcad web` and opens the port is
    told what they are looking at, instead of being shown a years-old UI as if it were current."""
    lowered = _HTML.lower()
    assert "engine" in lowered, "the placeholder should say the engine is what is running here"
    assert "/api/" in _HTML or "api" in lowered, (
        "the placeholder should point at the API this server actually serves"
    )


def test_placeholder_does_not_hand_out_the_session_token():
    """Deliberate call, recorded so it is not casually reverted: the old shell substituted the
    per-boot bearer secret into a meta tag for the SPA's fetches. The placeholder runs no
    JavaScript, so serving the token to anyone who GETs / would give away a credential that
    nothing on the page can use."""
    assert "__KIMCAD_SESSION_TOKEN__" not in _HTML, "unsubstituted token placeholder left in the page"
    assert "kimcad-session-token" not in _HTML, (
        "the placeholder is serving the per-boot session token to any client that GETs /"
    )


_FRONTEND_SRC = WEB_DIR.parents[4] / "apps" / "ui" / "src"
assert _FRONTEND_SRC.exists(), (
    "TinkerQuarry UI source tree is missing; expected canonical app source at apps/ui/src"
)
_TS_FILES = sorted(_FRONTEND_SRC.rglob("*.ts*"))


def _strip_ts_comments(src: str) -> str:
    """Remove `/* */` and `//` comments so a field/status NAMED ONLY IN A COMMENT can't satisfy
    the contract. (Good enough for our own source — no `//` appears inside its string literals;
    API paths use single slashes.)"""
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.DOTALL)
    src = re.sub(r"//[^\n]*", " ", src)
    return src


# "Consumer" source = the components/logic that USE the wire fields, COMMENTS STRIPPED, with the
# api.ts type declaration, the *.test.ts files, AND the `viewport/` 3D-engine module excluded.
# (Declaring/naming a field is not consuming it; and `viewport/KCViewport.ts` has a three.js
# bounding-box member `this.dims` whose `.dims` access is unrelated to the backend `report.dims`
# — a cross-module name collision that would let `dims` false-pass, caught by the re-audit.) The
# field checks below require a real property ACCESS (`.<field>`) or a quoted literal, so a
# className like `kc-dims`, a JSDoc mention, a test reference, or the viewport's own `.dims` can
# NOT satisfy the contract. (Hardened after the audit-team mutation-proved the prior bare-substring
# grep was a spell-checker: deleting the whole printability panel left it green except `headline`.)
_TS_CONSUMERS = "\n".join(
    _strip_ts_comments(p.read_text(encoding="utf-8"))
    for p in _TS_FILES
    if p.name != "api.ts" and ".test." not in p.name and p.parent.name != "viewport"
)
_ENGINE_CLIENT = (_FRONTEND_SRC / "services" / "engineClient.ts").read_text(encoding="utf-8")


def test_frontend_source_consumes_documented_response_fields():
    """The TinkerQuarry UI keeps the engine design-response contract typed and consumes the fields
    that drive visible product state: mesh preview, readiness, error handling, templates, and STEP."""
    typed_fields = [
        "status",
        "clarification",
        "plan",
        "report",
        "error",
        "mesh_url",
        "has_mesh",
        # report payload
        "gate_status",
        "headline",
        "dims",
        "findings",
    ]
    missing = [f for f in typed_fields if not re.search(rf"\b{re.escape(f)}\??:", _ENGINE_CLIENT)]
    assert not missing, (
        f"engine client no longer types documented design-response fields: {missing}"
    )

    consumed_fields = [
        "status",
        "error",
        "mesh_url",
        "has_mesh",
        "report",
        "readiness",
        "headline",
        "gate_status",
        "findings",
        "template",
        "step_url",
    ]
    missing = [f for f in consumed_fields if not re.search(rf"\.{re.escape(f)}\b", _TS_CONSUMERS)]
    assert not missing, (
        f"frontend consumer source does not ACCESS current engine fields "
        f"(a className/comment doesn't count): {missing}"
    )


def test_frontend_source_handles_every_pipeline_status():
    """Each engine pipeline status is represented in the typed client, and the consumer code
    branches on completed versus non-completed before enabling preview/manufacturing state."""
    for status_value in (
        "clarification_needed",
        "render_failed",
        "gate_failed",
        "plan_failed",
        "model_unavailable",
        "needs_experimental",
        "completed",
    ):
        assert re.search(rf"""['"]{re.escape(status_value)}['"]""", _ENGINE_CLIENT), (
            f"engine client no longer declares status={status_value}"
        )
    assert re.search(r"\.status\s*===\s*['\"]completed['\"]", _TS_CONSUMERS), (
        "frontend does not branch on completed engine designs"
    )


def test_frontend_source_consumes_connector_status_fields():
    """The send UI consumes the current TinkerQuarry connector contract: listed connectors carry
    name/configured/simulated, while send outcomes carry state/reason/simulated."""
    for field in ("name", "configured", "simulated"):
        assert re.search(rf"\b{re.escape(field)}\??:", _ENGINE_CLIENT), (
            f"connector client type no longer declares '{field}'"
        )
    for field in ("name", "simulated"):
        assert re.search(rf"\.{re.escape(field)}\b", _TS_CONSUMERS), (
            f"connector UI does not access '{field}'"
        )
    for field in ("state", "reason", "printer_state", "simulated"):
        assert re.search(rf"\b{re.escape(field)}\??:", _ENGINE_CLIENT), (
            f"send-result client type no longer declares '{field}'"
        )


# test_viewport_chunk_is_code_split_from_the_entry was removed with the bundle (WALK-3). It
# asserted that three.js landed in Workspace.js rather than the kimcad.js entry — a real
# property, but of a build no user ever ran. The equivalent guarantee for the build that DOES
# ship belongs to apps/ui, where the lazy import lives.
