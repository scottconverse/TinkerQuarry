"""TinkerQuarry — one-command offline dev launcher.

Starts the mock KimCad API (:8766) and serves the frontend (:8753) together, so the whole
offline app runs with a single command and **no toolchain beyond the Python standard library**.

    python scripts/dev.py
    # workspace : http://127.0.0.1:8753/
    # mock API  : http://127.0.0.1:8766   (X-TinkerQuarry-Mock: 1)

To drive the UI from a **real** `kimcad web` engine instead of the mock, open:
    http://127.0.0.1:8753/?api=http://127.0.0.1:8765
(the api-client resolves `?api=<url>` ahead of the mock default; response shapes match).
"""

from __future__ import annotations

import functools
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

FRONTEND_PORT = 8753
API_PORT = 8766


def main() -> None:
    from mock_api import MockKimCad, make_handler  # backend/mock_api.py

    api = ThreadingHTTPServer(("127.0.0.1", API_PORT), make_handler(MockKimCad()))
    threading.Thread(target=api.serve_forever, daemon=True).start()

    frontend = ThreadingHTTPServer(
        ("127.0.0.1", FRONTEND_PORT),
        functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT / "frontend")),
    )
    print("TinkerQuarry dev (offline):")
    print(f"  workspace : http://127.0.0.1:{FRONTEND_PORT}/")
    print(f"  mock API  : http://127.0.0.1:{API_PORT}   (X-TinkerQuarry-Mock: 1)")
    print(f"  real API  : open http://127.0.0.1:{FRONTEND_PORT}/?api=http://127.0.0.1:8765")
    print("  Ctrl+C to stop.")
    try:
        frontend.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
