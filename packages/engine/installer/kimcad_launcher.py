"""Installed/staged KimCad entry point.

This file is copied next to the embedded Python runtime and site-packages tree. It owns the
installed-mode path seam: set KIMCAD_INSTALL_ROOT before importing any kimcad module so config,
library, bundled tools, and web assets resolve from the staged install root while user data stays
under the normal writable locations.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent
os.environ["KIMCAD_INSTALL_ROOT"] = str(APP_ROOT)
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True
sys.path.insert(0, str(APP_ROOT / "site-packages"))

from kimcad.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
