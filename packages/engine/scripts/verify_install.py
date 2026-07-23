"""Stage 11 Slice 11.5 — the scriptable core of the clean-profile install test.

Points at an INSTALL tree (the real ``{app}`` dir, or ``dist/staging``) and proves the
installed KimCad actually works, with no dev venv anywhere in the loop:

  1. the embedded interpreter + launcher report the right version;
  2. the server comes up (demo mode) on the installed payload;
  3. ``/api/health`` sees the bundled OpenSCAD + OrcaSlicer;
  4. a demo design renders and its mesh downloads;
  5. writes landed under ``%LOCALAPPDATA%\\KimCad`` — never the install dir.

Usage:  python scripts/verify_install.py "C:\\Program Files\\KimCad" [--port 8741]
Exit 0 = all green; non-zero prints the first failure. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path


def fail(msg: str) -> int:
    print(f"FAIL: {msg}", file=sys.stderr)
    return 1


def _session_headers(session_token: str) -> dict[str, str]:
    """Headers for a state-changing POST to the installed server. The session-token guard
    (#31 / KC-26) requires the per-boot token on every POST when the server mints one — and
    ``kimcad web`` does, even in ``--demo``. Without it ``/api/design`` 403s and the verifier can
    never reach ALL GREEN (clean-machine finding, 2026-06-15).

    WALK-3 (2026-07-20): the token used to be scraped out of the served page's meta tag. The page
    no longer carries it, so we now supply the token we handed the child in TINKERQUARRY_DEV_TOKEN
    — the same mechanism the shipped desktop app uses, which makes this check faithful to the real
    product path instead of to the deleted SPA's."""
    return {"Content-Type": "application/json", "X-KimCad-Session": session_token}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("install_dir", type=Path)
    ap.add_argument("--port", type=int, default=8741)
    args = ap.parse_args(argv)

    app = args.install_dir.resolve()
    py = app / "python" / "python.exe"
    launcher = app / "kimcad_launcher.py"
    for p in (
        py, launcher, app / "tools" / "openscad", app / "config" / "default.yaml",
        # Slice 11.7: the PrintProof3D engine ships (stable v0.6.2) — the default install
        # must carry it at the path the config names.
        app / "tools" / "printproof3d" / "printproof3d.exe",
    ):
        if not p.exists():
            return fail(f"install tree incomplete: {p} missing")

    # 1. Version through the embedded interpreter.
    out = subprocess.run([str(py), str(launcher), "--version"],
                         capture_output=True, text=True, timeout=120)
    if out.returncode != 0 or not out.stdout.startswith("kimcad "):
        return fail(f"--version: rc={out.returncode} out={out.stdout!r} err={out.stderr[-300:]!r}")
    version = out.stdout.strip().split(" ", 1)[1]
    print(f"ok: kimcad {version}")

    # 11.5-audit FINDING-003: snapshot the ENTIRE app tree — "untouched" is proven by
    # diff, not by spot-checking one directory.
    before = {str(p.relative_to(app)) for p in app.rglob("*")}

    # 2-4. The server on the installed payload (demo: no model needed).
    # WALK-3 (2026-07-20): this verifier used to scrape the per-boot token out of the served
    # page's meta tag. The page no longer carries it — see shell.py — so authenticate the way
    # the SHIPPED app does instead: the desktop shell mints a token and passes it to the engine
    # in TINKERQUARRY_DEV_TOKEN (apps/ui/src-tauri/src/cmd/engine.rs:132-153). Doing the same
    # here keeps this check faithful to the real product path rather than to a dead one.
    session_token = "verify-install-" + uuid.uuid4().hex
    child_env = {**os.environ, "TINKERQUARRY_DEV_TOKEN": session_token}
    proc = subprocess.Popen(
        [str(py), str(launcher), "web", "--demo", "--port", str(args.port)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=child_env,
    )
    base = f"http://127.0.0.1:{args.port}"
    try:
        deadline = time.monotonic() + 60
        health = None
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f"{base}/api/health", timeout=3) as r:
                    health = json.load(r)
                break
            except OSError:
                if proc.poll() is not None:
                    return fail(f"server died at startup:\n{proc.stdout.read()[-1200:]}")
                time.sleep(0.5)
        if health is None:
            return fail("server never answered /api/health within 60s")
        if health["version"] != version:
            return fail(f"health version {health['version']!r} != launcher version {version!r}")
        print(f"ok: server up, version {health['version']} (matches the launcher)")
        if not (health.get("openscad") and health.get("orcaslicer")):
            return fail(f"bundled tools not seen by the app: {health}")
        print("ok: bundled OpenSCAD + OrcaSlicer present")

        # BG-U001 originally required the engine to serve a full SPA here, because at the time
        # `kimcad web` WAS the user interface. It no longer is: the desktop app ships its own
        # frontend in the Tauri bundle and only ever calls the engine's /api/*. WALK-3 deleted
        # the stale committed bundle, so what must serve at '/' now is the placeholder.
        #
        # Being explicit about the limit of this check, because the original comment overclaimed
        # and that is how a hollow artifact passed before: this proves the ENGINE serves. It does
        # NOT prove the installed window renders a real app — that is the Tauri frontend, and it
        # is not reachable from here. The clean-machine gauntlet is what covers that.
        with urllib.request.urlopen(f"{base}/", timeout=10) as r:
            shell_html = r.read().decode("utf-8", errors="replace")
        if r.status != 200 or "kimcad" not in shell_html.lower():
            return fail("the engine did not serve its landing page at /")
        if re.search(r'/assets/[^"\']+\.js', shell_html):
            return fail("a committed SPA bundle is being served again — WALK-3 regression")
        if session_token in shell_html:
            return fail("the engine served its per-boot session token to an unauthenticated GET /")
        print("ok: the engine serves its placeholder at / (no bundle, no token leak)")
        # And the prompt templates (the REAL design path needs them; demo doesn't).
        prompts = app / "site-packages" / "kimcad" / "prompts"
        if not prompts.exists() or not any(prompts.iterdir()):
            return fail("kimcad/prompts is missing from the install - real designs would fail")
        print("ok: prompt templates shipped")

        # The session-token guard (#31 / KC-26) requires the per-boot token on this POST. We echo
        # the token we handed the child in TINKERQUARRY_DEV_TOKEN, exactly as the desktop app does
        # (clean-machine finding 2026-06-15 — without it /api/design 403s and this never reaches
        # GREEN; that finding stays closed because the token now comes from the env, not the page).
        req = urllib.request.Request(
            f"{base}/api/design", data=json.dumps({"prompt": "a 40 mm desk cable clip"}).encode(),
            headers=_session_headers(session_token),
        )
        with urllib.request.urlopen(req, timeout=300) as r:
            design = json.load(r)
        mesh_url = design.get("mesh_url")
        if not mesh_url:
            return fail(f"demo design returned no mesh: {str(design)[:400]}")
        with urllib.request.urlopen(base + mesh_url, timeout=60) as r:
            mesh = r.read()
        if len(mesh) < 1000:
            return fail(f"mesh download suspiciously small ({len(mesh)} bytes)")
        print(f"ok: demo design rendered, mesh downloaded ({len(mesh)} bytes)")

        # 5. Writes landed in the per-user tree, not the install dir — by FULL tree diff.
        local = Path(os.environ.get("LOCALAPPDATA", "")) / "KimCad" / "output" / "web"
        if not local.exists():
            return fail(f"expected writes under {local} - the paths seam isn't routing")
        after = {str(p.relative_to(app)) for p in app.rglob("*")}
        new_paths = sorted(after - before)
        if new_paths:
            return fail(f"the install dir gained {len(new_paths)} path(s): {new_paths[:10]}")
        print(f"ok: writes under {local}; the install tree is byte-path identical (diffed)")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("VERIFY-INSTALL: ALL GREEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
