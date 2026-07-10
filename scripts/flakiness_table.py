"""Nightly flakiness table (v1.5): fold N junit XML files from repeated identical runs into
one per-test verdict table, and fail if any test flapped.

Usage:
    python scripts/flakiness_table.py --out table.md run1.xml run2.xml [...]

A test is FLAKY when it neither passed in every run nor failed in every run. Consistent
failures are reported too (they're broken, not flaky, and the nightly should be red either
way), but the headline metric is the flaky set — the audit's point was that a single green
sample proves determinism-of-claim, not determinism-of-behavior.

Exit 0 = every test behaved identically in all runs and none failed; 1 = flaky and/or
consistently failing tests (table says which); 2 = usage error.
"""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def collect(path: Path) -> dict[str, str]:
    """testcase id -> 'pass' | 'fail' | 'skip' for one junit file."""
    verdicts: dict[str, str] = {}
    root = ET.parse(path).getroot()
    for case in root.iter("testcase"):
        tid = f"{case.get('classname', '')}::{case.get('name', '')}"
        if case.find("failure") is not None or case.find("error") is not None:
            verdicts[tid] = "fail"
        elif case.find("skipped") is not None:
            verdicts[tid] = "skip"
        else:
            verdicts[tid] = "pass"
    return verdicts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("runs", nargs="+", type=Path, help="junit XML files, one per run")
    ap.add_argument("--out", type=Path, help="write the markdown table here")
    args = ap.parse_args()
    if len(args.runs) < 2:
        print("need at least two runs to measure flakiness", file=sys.stderr)
        return 2

    per_run = [collect(p) for p in args.runs]
    all_ids = sorted(set().union(*per_run))
    flaky: list[str] = []
    always_fail: list[str] = []
    lines = [
        f"# Flakiness table — {len(per_run)} identical runs",
        "",
        "| Test | " + " | ".join(f"run {i + 1}" for i in range(len(per_run))) + " | verdict |",
        "|---" * (len(per_run) + 2) + "|",
    ]
    for tid in all_ids:
        vs = [run.get(tid, "absent") for run in per_run]
        effective = {v for v in vs if v != "skip"} or {"skip"}
        if effective == {"pass"} or effective == {"skip"}:
            continue  # stable — keep the table to the interesting rows
        verdict = "ALWAYS-FAIL" if effective == {"fail"} else "FLAKY"
        (always_fail if verdict == "ALWAYS-FAIL" else flaky).append(tid)
        lines.append(f"| `{tid}` | " + " | ".join(vs) + f" | **{verdict}** |")

    stable = len(all_ids) - len(flaky) - len(always_fail)
    lines += ["", f"Stable: {stable} · Flaky: {len(flaky)} · Always-fail: {len(always_fail)}"]
    if not flaky and not always_fail:
        lines.insert(4, "| *(none — every test behaved identically in all runs)* |" +
                     " |" * (len(per_run) + 1))
    report = "\n".join(lines) + "\n"
    print(report)
    if args.out:
        args.out.write_text(report, encoding="utf-8")
    return 1 if (flaky or always_fail) else 0


if __name__ == "__main__":
    sys.exit(main())
