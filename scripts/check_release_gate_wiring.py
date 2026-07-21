"""Release-gate wiring check - makes "CI is green" vs "this build is release-proven" a
difference you cannot miss, and cannot let rot silently.

Background (gate finding TEST-2, 2026-07-19): `release-gate.yml` triggered only on
``workflow_dispatch``, and ``gh run list --workflow=release-gate.yml`` returned zero rows
for the entire life of the repo - the full release proof had never once run in GitHub
Actions. Every release shipped on a human remembering to run ``pnpm test:release`` locally.
Nothing anywhere said so, so a green CI badge read as "proven".

This script enforces four properties. Each one fails loudly and specifically:

  A. release-gate.yml has a real *automatic* trigger (a schedule and/or a tag push),
     not workflow_dispatch alone.
  B. Every leaf command of the root ``test:release`` script is classified *exactly once*
     as either "covered in CI" (declared in .github/workflows/ci.yml) or "release-only"
     (declared in .github/workflows/release-gate.yml). Add a new lane to test:release and
     forget to classify it -> this goes red. That is the point: the gap is enumerated,
     not invisible.
  C. Every "covered in CI" claim points at a job + step name that actually exists in
     ci.yml. Rename or delete that step -> red. A claim of coverage has to stay true.
  D. The release path (sign-installer.yml) refuses to sign a tag unless a *successful*
     release-gate run exists for that tag's exact commit.

Run it:  python scripts/check_release_gate_wiring.py
Exit 0 = wired. Exit 1 = a specific, named property is broken (printed).

All printed text is ASCII on purpose: this runs on Windows consoles that default to cp1252.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
CI_YML = WORKFLOWS / "ci.yml"
RELEASE_GATE_YML = WORKFLOWS / "release-gate.yml"
SIGN_YML = WORKFLOWS / "sign-installer.yml"
PACKAGE_JSON = REPO_ROOT / "package.json"

# The marked comment blocks the two workflows carry. Kept as comments (not YAML keys) so
# GitHub Actions never sees them, while the explanation lives in the workflow file itself
# - where the next person reads it - instead of in a side file nobody opens.
BLOCK_RE = (
    r"^#\s*BEGIN RELEASE-PROOF-MAP:\s*{name}\s*$(?P<body>.*?)^#\s*END RELEASE-PROOF-MAP\s*$"
)

# The signing workflow must gate on a job with this exact id, and that job must query the
# Actions API for a green release-gate run at the tag's own commit.
PROOF_JOB_ID = "release-gate-proof"


class Failure(Exception):
    """A named wiring property is broken."""


# --------------------------------------------------------------------------------------
# package.json -> the leaf commands the full release proof actually runs
# --------------------------------------------------------------------------------------


def _split_chain(command: str) -> list[str]:
    """Split a shell chain on && and drop pure `cd` hops (they are not test lanes)."""
    parts = [p.strip() for p in command.split("&&")]
    return [p for p in parts if p and not re.fullmatch(r"cd\s+\S+", p)]


def leaf_key(command: str) -> str:
    """Stable, human-readable key for one leaf command.

    ``pnpm [flags] <script>``       -> ``<script>``   (e.g. "test:rust", "lint")
    ``node path/to/thing.mjs``      -> ``thing.mjs``  (basename)
    ``scripts\\native-release.cmd`` -> ``native-release.cmd``
    """
    tokens = command.split()
    if tokens and tokens[0] in ("pnpm", "npm", "yarn"):
        rest = tokens[1:]
        if rest and rest[0] == "run":
            rest = rest[1:]
        # skip flags and their values (--dir apps/ui, --filter web, -r, ...)
        i = 0
        while i < len(rest) and rest[i].startswith("-"):
            if rest[i] in ("--dir", "--filter", "-C", "--workspace"):
                i += 2
            else:
                i += 1
        if i < len(rest):
            return rest[i]
    for token in tokens:
        if re.search(r"\.(mjs|cjs|js|cmd|ps1|py|sh)$", token):
            return token.replace("\\", "/").rsplit("/", 1)[-1]
    return tokens[0] if tokens else command


def release_leaf_commands() -> dict[str, str]:
    """Expand the root ``test:release`` script into {leaf_key: leaf_command}.

    Expansion rule (deliberately narrow and deterministic): a ``pnpm <name>`` invocation is
    expanded only when <name> is a root script that fans out to two or more real commands.
    A ``cd apps/ui && pnpm test:coverage ...`` script is one lane that happens to chdir, not
    an aggregator, so it stays a leaf and keeps its own name as the key.
    """
    scripts: dict[str, str] = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))["scripts"]
    if "test:release" not in scripts:
        raise Failure("package.json has no `test:release` script - this check is misaimed.")

    leaves: dict[str, str] = {}
    seen: set[str] = set()

    def expand(command: str) -> None:
        for part in _split_chain(command):
            tokens = part.split()
            name = tokens[1] if len(tokens) > 1 and tokens[0] == "pnpm" else None
            body = scripts.get(name) if name else None
            if body is not None and name not in seen and len(_split_chain(body)) > 1:
                seen.add(name)
                expand(body)
                continue
            key = leaf_key(part)
            if key in leaves and leaves[key] != part:
                raise Failure(
                    f"leaf key collision on {key!r}: {leaves[key]!r} vs {part!r}. "
                    "Rename one lane or extend leaf_key()."
                )
            leaves[key] = part

    seen.add("test:release")
    expand(scripts["test:release"])
    return leaves


# --------------------------------------------------------------------------------------
# the marked comment blocks
# --------------------------------------------------------------------------------------


def read_map_block(path: Path, name: str) -> dict[str, str]:
    """Parse a `# BEGIN RELEASE-PROOF-MAP: <name>` comment block into {key: note}."""
    text = path.read_text(encoding="utf-8")
    match = re.search(BLOCK_RE.format(name=re.escape(name)), text, re.MULTILINE | re.DOTALL)
    if not match:
        raise Failure(
            f"{path.relative_to(REPO_ROOT).as_posix()} has no "
            f"`# BEGIN RELEASE-PROOF-MAP: {name}` ... `# END RELEASE-PROOF-MAP` block. "
            "Without it, nothing states which parts of the release proof CI does and does "
            "not run, and a green CI badge silently reads as release-proven (TEST-2)."
        )
    entries: dict[str, str] = {}
    for raw in match.group("body").splitlines():
        line = raw.lstrip()
        if not line.startswith("#"):
            continue
        line = line[1:].strip()
        if not line or line.startswith("-") or line.endswith(":"):
            continue  # prose/heading inside the block
        key, _, note = line.partition("  ")
        key = key.strip()
        if not key or " " in key:
            continue  # prose sentence, not an entry
        if key in entries:
            raise Failure(
                f"{path.relative_to(REPO_ROOT).as_posix()}: duplicate map entry {key!r}"
            )
        entries[key] = note.strip()
    return entries


# --------------------------------------------------------------------------------------
# workflow structure
# --------------------------------------------------------------------------------------


def load_workflow(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise Failure(f"{path.relative_to(REPO_ROOT).as_posix()} is not a YAML mapping")
    return data


def triggers(workflow: dict[str, Any]) -> dict[str, Any]:
    """Return the `on:` block. PyYAML is YAML 1.1, so a bare `on:` key parses as True."""
    raw = workflow.get("on", workflow.get(True))
    if isinstance(raw, str):
        return {raw: None}
    if isinstance(raw, list):
        return {item: None for item in raw}
    return raw or {}


def step_names(workflow: dict[str, Any], job_id: str) -> list[str]:
    job = (workflow.get("jobs") or {}).get(job_id)
    if not isinstance(job, dict):
        return []
    return [s.get("name", "") for s in (job.get("steps") or []) if isinstance(s, dict)]


# --------------------------------------------------------------------------------------
# the four checks
# --------------------------------------------------------------------------------------


def check_a_automatic_trigger(problems: list[str]) -> None:
    on = triggers(load_workflow(RELEASE_GATE_YML))
    automatic = []
    if "schedule" in on:
        automatic.append("schedule")
    push = on.get("push")
    if isinstance(push, dict) and push.get("tags"):
        automatic.append("push:tags")
    if not automatic:
        problems.append(
            "A. release-gate.yml has no automatic trigger (found: "
            f"{sorted(map(str, on)) or 'nothing'}). The full release proof therefore only "
            "ever runs when a human remembers - which is why it had run zero times in this "
            "repo's history. Add a `schedule:` (see nightly-flakiness.yml) and/or "
            "`push: tags:`."
        )
    if "workflow_dispatch" not in on:
        problems.append(
            "A. release-gate.yml dropped `workflow_dispatch` - keep it so a release manager "
            "can force the full proof against a specific ref before tagging."
        )


def check_b_and_c_coverage_map(problems: list[str]) -> None:
    try:
        leaves = release_leaf_commands()
    except Failure as exc:
        problems.append(f"B. {exc}")
        return

    ci_map: dict[str, str] = {}
    gate_map: dict[str, str] = {}
    for path, name, target in (
        (CI_YML, "covered-in-ci", ci_map),
        (RELEASE_GATE_YML, "release-only", gate_map),
    ):
        try:
            target.update(read_map_block(path, name))
        except Failure as exc:
            problems.append(f"B. {exc}")

    if not ci_map and not gate_map:
        return

    classified = set(ci_map) | set(gate_map)
    unclassified = sorted(set(leaves) - classified)
    if unclassified:
        problems.append(
            "B. these `test:release` lanes are classified nowhere - CI does not claim them "
            "and release-gate.yml does not list them, so nobody can tell whether a green CI "
            f"run covers them: {unclassified}. Add each to exactly one RELEASE-PROOF-MAP "
            "block."
        )
    phantom = sorted(classified - set(leaves))
    if phantom:
        problems.append(
            "B. these RELEASE-PROOF-MAP entries no longer exist in `test:release` (stale "
            f"map - the doc has drifted from the script): {phantom}"
        )
    both = sorted(set(ci_map) & set(gate_map))
    if both:
        problems.append(
            f"B. classified as BOTH covered-in-ci and release-only: {both}. Pick one; a lane "
            "that CI partially covers belongs in covered-in-ci with the gap named in its note."
        )

    # C. every covered-in-ci claim must point at a job + step that really exists.
    ci = load_workflow(CI_YML)
    for key, note in sorted(ci_map.items()):
        # `-> <job id> / <step name>` runs up to the first run of 2+ spaces; anything after
        # that is free-text commentary. Not "up to the first `(`": real step names contain
        # parentheses ("Full UI unit tests (non-live lane)"), and truncating there silently
        # made every pointer stale.
        pointer = note.split("->", 1)[1] if "->" in note else ""
        pointer = re.split(r"\s{2,}", pointer.strip(), maxsplit=1)[0].strip()
        if "/" not in pointer:
            problems.append(
                f"C. covered-in-ci entry {key!r} has no `-> <job id> / <step name>` pointer. "
                "An unpointed coverage claim cannot be checked, so it rots."
            )
            continue
        job_id, step_name = (p.strip() for p in pointer.split("/", 1))
        names = step_names(ci, job_id)
        if not names:
            problems.append(f"C. {key!r} points at ci.yml job {job_id!r}, which does not exist.")
        elif step_name not in names:
            problems.append(
                f"C. {key!r} claims coverage by ci.yml step {job_id}/{step_name!r}, but that "
                f"job's steps are {names}. The claim is stale."
            )


def check_d_release_path_gated(problems: list[str]) -> None:
    sign = load_workflow(SIGN_YML)
    jobs = sign.get("jobs") or {}
    proof = jobs.get(PROOF_JOB_ID)
    if not isinstance(proof, dict):
        problems.append(
            f"D. sign-installer.yml has no `{PROOF_JOB_ID}` job. The release path will happily "
            "sign and publish a tag for which the full release proof never ran - exactly how "
            "v1.5.0 shipped. Add a job that asks the Actions API for a successful "
            "release-gate.yml run at the tag's own commit and fails when there is none."
        )
    else:
        body = yaml.safe_dump(proof)
        if "release-gate.yml" not in body:
            problems.append(
                f"D. `{PROOF_JOB_ID}` never mentions release-gate.yml, so it cannot be looking "
                "for a release-gate run."
            )
        if "head_sha" not in body:
            problems.append(
                f"D. `{PROOF_JOB_ID}` does not filter runs by `head_sha`. A release-gate run on "
                "some other commit does not prove anything about this tag."
            )
    consumers = [
        job_id
        for job_id, job in jobs.items()
        if job_id != PROOF_JOB_ID
        and isinstance(job, dict)
        and PROOF_JOB_ID in (job.get("needs") or [])
    ]
    if not consumers:
        problems.append(
            f"D. no job in sign-installer.yml `needs: [{PROOF_JOB_ID}]`, so the proof job runs "
            "beside the signing job instead of blocking it - a red proof would still publish."
        )


def main() -> int:
    problems: list[str] = []
    checks = (check_a_automatic_trigger, check_b_and_c_coverage_map, check_d_release_path_gated)
    for check in checks:
        try:
            check(problems)
        except Failure as exc:
            problems.append(str(exc))
        except FileNotFoundError as exc:
            problems.append(f"missing file: {exc}")

    if problems:
        print("release-gate wiring is BROKEN:\n")
        for problem in problems:
            print(f"  FAIL {problem}\n")
        print(f"{len(problems)} problem(s). See the docstring in {Path(__file__).name}.")
        return 1

    leaves = release_leaf_commands()
    ci_map = read_map_block(CI_YML, "covered-in-ci")
    gate_map = read_map_block(RELEASE_GATE_YML, "release-only")
    print(
        f"release-gate wiring OK: {len(leaves)} test:release lanes, "
        f"{len(ci_map)} covered in CI, {len(gate_map)} release-only; "
        "release-gate.yml runs automatically; sign-installer.yml is gated on a "
        "release-gate run at the tag's exact commit."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
