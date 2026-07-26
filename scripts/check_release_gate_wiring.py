"""Release-gate wiring check - makes "CI is green" vs "this build is release-proven" a
difference you cannot miss, and cannot let rot silently.

Background (gate finding TEST-2, 2026-07-19): `release-gate.yml` triggered only on
``workflow_dispatch``, and ``gh run list --workflow=release-gate.yml`` returned zero rows
for the entire life of the repo - the full release proof had never once run in GitHub
Actions. Every release shipped on a human remembering to run ``pnpm test:release`` locally.
Nothing anywhere said so, so a green CI badge read as "proven".

This script enforces six properties. Each one fails loudly and specifically:

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
  E. Signing preserves the proof chain after it mutates the published artifact: the
     manifest identity is checked against the proven tag, stale unsigned gate text is
     replaced with the successful run URL, and the uploaded asset is downloaded again
     for independent hash and Authenticode verification.
  F. The release proof runs directly on the declared GitHub-hosted Windows 2022 image
     family and records the exact image version, with no executable self-hosted jobs
     or runner-registration workflow. It creates
     and verifies one exact short-path worktree, provisions every full-proof
     dependency there, starts the product-pinned Ollama without leaking its host
     override into tests, keeps source mode active, and uploads an installer only
     after the complete proof succeeds.

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
from yaml.nodes import MappingNode
from yaml.resolver import BaseResolver

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
CI_YML = WORKFLOWS / "ci.yml"
RELEASE_GATE_YML = WORKFLOWS / "release-gate.yml"
SIGN_YML = WORKFLOWS / "sign-installer.yml"
EPHEMERAL_RUNNER_YML = WORKFLOWS / "ephemeral-release-runner.yml"
PACKAGE_JSON = REPO_ROOT / "package.json"

# Release-critical third-party Actions are commit-pinned. The trailing comments in the
# workflows carry the human-readable upstream tag; these full commit identities are what
# GitHub actually executes.
CHECKOUT_ACTION = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
SETUP_NODE_ACTION = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"
PNPM_SETUP_ACTION = "pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1"
SETUP_PYTHON_ACTION = "actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065"
UPLOAD_ARTIFACT_ACTION = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
AZURE_SIGNING_ACTION = "azure/artifact-signing-action@c7ab2a863ab5f9a846ddb8265964877ef296ee82"

ACTIONLINT_VERSION = "1.7.12"
ACTIONLINT_LINUX_SHA256 = "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
PINNED_NODE = "22.23.1"
PINNED_PYTHON = "3.13.14"
PINNED_PIP = "26.1.2"
PINNED_NODE_GYP = "12.1.0"
PINNED_CARGO_AUDIT = "0.22.2"
PINNED_RUST = "1.97.1"
PINNED_MODEL_DIGEST = (
    "sha256:6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7"
)

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


class _UniqueKeyLoader(yaml.SafeLoader):
    """Safe YAML loader that rejects the duplicate keys GitHub Actions rejects."""


def _construct_unique_mapping(
    loader: _UniqueKeyLoader, node: MappingNode, deep: bool = False
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                "found an unhashable YAML key",
                key_node.start_mark,
            ) from exc
        if duplicate:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate YAML key {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeyLoader.add_constructor(
    BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


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
    try:
        data = yaml.load(
            path.read_text(encoding="utf-8"),
            Loader=_UniqueKeyLoader,
        )
    except yaml.YAMLError as exc:
        try:
            display_path = path.relative_to(REPO_ROOT).as_posix()
        except ValueError:
            display_path = str(path)
        raise Failure(f"{display_path}: invalid workflow YAML: {exc}") from exc
    if not isinstance(data, dict):
        try:
            display_path = path.relative_to(REPO_ROOT).as_posix()
        except ValueError:
            display_path = str(path)
        raise Failure(f"{display_path} is not a YAML mapping")
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


def _unguarded_native_commands(script: str) -> list[str]:
    """Return Python provisioning commands whose next executable line is not an exit check.

    PowerShell updates ``$LASTEXITCODE`` after every native command. Checking it only after
    several installs lets a later success erase an earlier lockfile failure, so the guard must
    be adjacent to the command it protects.
    """
    executable = [
        line.strip()
        for line in script.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    unguarded: list[str] = []
    native = re.compile(r"^(?:python(?:\.exe)?|&\s+\$cqPython)\s", re.IGNORECASE)
    exit_check = re.compile(
        r"^if\s*\(\$LASTEXITCODE\s+-ne\s+0\)\s*\{(?P<body>.*)\}\s*$",
        re.IGNORECASE,
    )
    failing_action = re.compile(
        r"^\s*(?:throw\b|exit\s+(?:1|\$LASTEXITCODE)\b)",
        re.IGNORECASE,
    )
    for index, line in enumerate(executable):
        if not native.match(line):
            continue
        next_line = executable[index + 1] if index + 1 < len(executable) else ""
        check = exit_check.match(next_line)
        if not check or not failing_action.match(check.group("body")):
            unguarded.append(line)
    return unguarded


def _is_single_runner_temp_artifact_root(path_value: object) -> bool:
    """True only when upload-artifact receives the reviewed single-volume staging root."""
    if not isinstance(path_value, str):
        return False
    normalized = path_value.strip().replace("\\", "/").rstrip("/")
    return normalized == "${{ runner.temp }}/tinkerquarry-windows-release-artifacts"


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


def _executable_step_text(job: dict[str, Any]) -> str:
    """The EXECUTABLE body of a job's steps - each step's `run:` script and any `with:` values -
    with shell (`#`) comments stripped line by line.

    TEST-2 (rev 5): check D used to test tokens against ``yaml.safe_dump(proof)``, i.e. the whole
    job serialized back to YAML. A step's `run:` block is one big string that INCLUDES its own
    ``# ...`` comment lines, so ``"head_sha" in dump`` was satisfied by the paragraph of comments
    that *explains* head_sha - someone could delete the real ``?head_sha=`` query, keep the
    comment, and this guard stayed green. Stripping comments here means only an executable
    reference counts. (Our proof step is bash; `#` is the comment marker.)"""
    chunks: list[str] = []

    def strip_comments(text: str) -> str:
        return "\n".join(line.split("#", 1)[0] for line in text.splitlines())

    for step in job.get("steps") or []:
        if not isinstance(step, dict):
            continue
        run = step.get("run")
        if isinstance(run, str):
            chunks.append(strip_comments(run))
        with_block = step.get("with")
        if isinstance(with_block, dict):
            for value in with_block.values():
                if isinstance(value, str):
                    chunks.append(strip_comments(value))
    return "\n".join(chunks)


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
        # Comment-stripped, so a `# ... head_sha ...` note describing the query cannot stand in for
        # the query itself (TEST-2 rev 5).
        exe = _executable_step_text(proof)
        if "release-gate.yml" not in exe:
            problems.append(
                f"D. `{PROOF_JOB_ID}` never references release-gate.yml in an executable step (a "
                "comment does not count), so it cannot be looking for a release-gate run."
            )
        if "head_sha" not in exe:
            problems.append(
                f"D. `{PROOF_JOB_ID}` does not filter runs by `head_sha` in an executable step (a "
                "comment mentioning it does not count). A release-gate run on some other commit "
                "does not prove anything about this tag."
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


def check_e_signed_artifact_evidence_chain(problems: list[str]) -> None:
    sign = load_workflow(SIGN_YML)
    jobs = sign.get("jobs") or {}
    proof = jobs.get(PROOF_JOB_ID)
    signing = jobs.get("sign")
    if not isinstance(proof, dict) or not isinstance(signing, dict):
        return  # Check D owns the missing-job diagnostics.

    proof_exe = _executable_step_text(proof)
    for token, why in (
        ("GITHUB_OUTPUT", "export machine-readable proof outputs"),
        ("tag_commit_sha", "export the exact proven tag commit"),
        ("release_gate_url", "export the successful release-gate run URL"),
        ("release_gate_run_id", "export the successful release-gate run ID"),
        ("release_gate_run_attempt", "export the successful release-gate run attempt"),
        ("release_gate_head_sha", "export the selected run's exact head SHA"),
        ("run_json", "derive proof fields from one API response snapshot"),
    ):
        if token not in proof_exe:
            problems.append(
                f"E. `{PROOF_JOB_ID}` does not {why} (`{token}` is absent from executable "
                "steps). The signing job cannot bind its manifest update to the proof it found."
            )

    sign_exe = _executable_step_text(signing)
    signing_actions = [
        str(step.get("uses"))
        for step in (signing.get("steps") or [])
        if isinstance(step, dict) and step.get("uses")
    ]
    if signing_actions != [AZURE_SIGNING_ACTION]:
        problems.append(
            "E. the Azure signing action must be pinned to the reviewed v2.0.0 commit; "
            f"found {signing_actions or '<none>'}."
        )
    required_signing_tokens = (
        ("PROOF_SHA", "consume the exact proven tag commit"),
        ("PROOF_URL", "consume the successful release-gate run URL"),
        ("PROOF_RUN_ID", "consume the successful release-gate run ID"),
        ("PROOF_RUN_ATTEMPT", "consume the successful release-gate run attempt"),
        ("PROOF_HEAD_SHA", "consume the selected release-gate run's head SHA"),
        ("gh run download", "obtain the installer from the successful release-gate run"),
        (
            "tinkerquarry-windows-release-artifacts",
            "select the release gate's named native-artifact bundle",
        ),
        ("$m.commit", "read the manifest's source commit before upload"),
        ("$m.tag", "read the manifest's tag before upload"),
        ("source_unsigned_sha256", "record the exact gated bytes that were signed"),
        ("EXPECTED_SIGNED_SHA256", "carry the exact pre-upload signed hash into publication verification"),
        ("EXPECTED_SIGNER_SUBJECT", "pin the expected Azure Trusted Signing identity"),
        ("Resolve-ProvenTagCommit", "re-resolve the release tag at publication time"),
        ("unsigned_build = $false", "mark the signed artifact as signed"),
        ("$m.release_gate", "replace the stale release-gate narrative"),
        ("gh release upload", "publish the signed installer and revised metadata"),
        ("published", "use a distinct post-upload download directory"),
        ("gh release download", "download the published assets again after upload"),
        ("Get-FileHash", "derive the published installer's hash independently"),
        ("signtool", "verify Authenticode on the published installer"),
        (
            "tinkerquarry-release-substrate.json",
            "consume and publish the full-gate substrate receipt",
        ),
        (
            "substrate_receipt_sha256",
            "bind the public manifest to the exact substrate receipt bytes",
        ),
        (
            "unsigned_installer.sha256",
            "compare the gated receipt to the unsigned installer input",
        ),
        (
            "runner.image_version",
            "carry the actual hosted image version into published provenance",
        ),
        (
            "model.digest",
            "carry the exact pulled model digest into published provenance",
        ),
    )
    for token, why in required_signing_tokens:
        if token not in sign_exe:
            problems.append(
                f"E. sign job does not {why} (`{token}` is absent from executable steps). "
                "A pre-upload green check cannot prove the final public artifact."
            )

    if proof_exe.count('gh api "$url"') != 1:
        problems.append(
            "E. release proof must derive count, URL, run ID, and attempt from exactly one "
            "`gh api \"$url\"` response per candidate. Independent queries can bind fields "
            "from different runs."
        )
    for token, why in (
        ('<<< "$run_json"', "derive proof values from the captured API response"),
        ("proof_run_id=$(jq", "derive the proof run ID from the selected response object"),
        (
            "proof_run_attempt=$(jq",
            "derive the proof run attempt from the selected response object",
        ),
        (
            'proof_head_sha="$candidate"',
            "bind the selected proof to the candidate SHA used in its API query",
        ),
    ):
        if token not in proof_exe:
            problems.append(
                f"E. release proof does not {why}; expected executable dataflow token "
                f"`{token}`."
            )

    workflow_concurrency = sign.get("concurrency")
    expected_group = "sign-installer-${{ inputs.release-tag || github.run_id }}"
    if (
        not isinstance(workflow_concurrency, dict)
        or workflow_concurrency.get("group") != expected_group
        or workflow_concurrency.get("cancel-in-progress") is not False
    ):
        problems.append(
            "E. sign-installer.yml must serialize the exact release-tag group, keep smoke "
            "runs unique by run ID, and never cancel an in-progress publisher."
        )

    exact_hash_check = "$publishedHash -ne $env:EXPECTED_SIGNED_SHA256"
    if exact_hash_check not in sign_exe:
        problems.append(
            "E. post-publication verification does not compare the downloaded installer to "
            "the exact pre-upload signed SHA-256."
        )

    upload_pos = sign_exe.find("gh release upload")
    published_download_pos = sign_exe.rfind("gh release download")
    if upload_pos < 0 or published_download_pos <= upload_pos:
        problems.append(
            "E. the distinct public re-download must execute after `gh release upload`."
        )

    artifact_download_pos = sign_exe.find("gh run download")
    run_recheck_pos = sign_exe.find('actions/runs/$env:PROOF_RUN_ID')
    if run_recheck_pos < 0 or artifact_download_pos <= run_recheck_pos:
        problems.append(
            "E. the selected release-gate run identity must be re-queried before its "
            "artifact is downloaded."
        )
    if "$run.head_sha -ne $env:PROOF_HEAD_SHA" not in sign_exe:
        problems.append(
            "E. the pre-download run recheck must compare the API head SHA to the exact "
            "selected proof head, not assume an annotated tag object's SHA equals its commit."
        )

    for token, why in (
        (
            "$tagCommitBeforeUpload = Resolve-ProvenTagCommit",
            "re-resolve the tag immediately before upload",
        ),
        (
            "$tagCommitAfterUpload = Resolve-ProvenTagCommit",
            "re-resolve the tag immediately after upload",
        ),
        (
            "$tagCommitAfterVerification = Resolve-ProvenTagCommit",
            "re-resolve the tag when public verification closes",
        ),
        (
            "$signature.SignerCertificate.Subject -ne $env:EXPECTED_SIGNER_SUBJECT",
            "enforce the expected signer before publication",
        ),
        (
            "$publishedSignature.SignerCertificate.Subject -ne $env:EXPECTED_SIGNER_SUBJECT",
            "enforce the expected signer on the public re-download",
        ),
        (
            "signer_subject = $signature.SignerCertificate.Subject",
            "record the signer identity from the verified certificate",
        ),
        (
            "release_gate_head_sha = $env:PROOF_HEAD_SHA",
            "record the selected run head SHA in the release manifest",
        ),
        (
            "$publishedManifest.signing.signer_subject -ne "
            "$publishedSignature.SignerCertificate.Subject",
            "compare the public signer to the published manifest",
        ),
        (
            "$publishedManifest.signing.release_gate_head_sha -ne $env:PROOF_HEAD_SHA",
            "compare the public proof record to the selected run head SHA",
        ),
    ):
        if token not in sign_exe:
            problems.append(f"E. signing workflow does not {why}; expected `{token}`.")


def check_f_hosted_release_scope(problems: list[str]) -> None:
    executable_self_hosted: list[tuple[Path, str, set[str]]] = []
    workflow_paths = sorted([*WORKFLOWS.glob("*.yml"), *WORKFLOWS.glob("*.yaml")])
    for path in workflow_paths:
        doc = load_workflow(path)
        trigger = triggers(doc)
        trigger_names = set(trigger) if isinstance(trigger, dict) else {str(trigger)}
        for job_id, job in (doc.get("jobs") or {}).items():
            if not isinstance(job, dict):
                continue
            runs_on = job.get("runs-on")
            labels = runs_on if isinstance(runs_on, list) else [runs_on]
            if any(str(label).lower() == "self-hosted" for label in labels):
                executable_self_hosted.append((path, str(job_id), trigger_names))

    expected: list[tuple[Path, str]] = []
    actual = [(path, job_id) for path, job_id, _ in executable_self_hosted]
    if actual != expected:
        rendered = ", ".join(f"{p.name}:{j}" for p, j in actual) or "<none>"
        problems.append(
            "F. executable self-hosted scope drifted. Expected none; "
            f"found {rendered}."
        )

    for path, job_id, trigger_set in executable_self_hosted:
        unsafe = trigger_set & {"pull_request", "pull_request_target"}
        if unsafe:
            problems.append(
                f"F. `{path.name}:{job_id}` is self-hosted but accepts untrusted "
                f"pull-request trigger(s): {', '.join(sorted(unsafe))}."
            )

    release_doc = load_workflow(RELEASE_GATE_YML)
    release_jobs = release_doc.get("jobs") or {}
    release_job = release_jobs.get("windows-release-gate")
    if not isinstance(release_job, dict):
        problems.append("F. release-gate.yml has no `windows-release-gate` job.")
        return
    if release_job.get("runs-on") != "windows-2022":
        problems.append(
            "F. the full Windows release proof must run directly on the declared "
            "`windows-2022` GitHub-hosted image family."
        )

    release_steps = [
        step for step in (release_job.get("steps") or []) if isinstance(step, dict)
    ]
    checkout_steps = [
        step
        for step in release_steps
        if str(step.get("uses", "")).startswith("actions/checkout@")
    ]
    if (
        len(checkout_steps) != 1
        or checkout_steps[0].get("uses") != CHECKOUT_ACTION
        or (checkout_steps[0].get("with") or {}).get("persist-credentials") is not False
    ):
        problems.append(
            "F. the hosted release job must have one commit-pinned checkout with "
            "persisted Actions credentials disabled."
        )

    license_job = release_jobs.get("license-gate")
    for job_id, job, step_name in (
        ("license-gate", license_job, "Install the shipped bundle set"),
        (
            "windows-release-gate",
            release_job,
            "Provision full engine and browser dependencies",
        ),
    ):
        steps = (job.get("steps") or []) if isinstance(job, dict) else []
        install_steps = [
            step
            for step in steps
            if isinstance(step, dict) and step.get("name") == step_name
        ]
        if len(install_steps) != 1:
            problems.append(
                f"F. `{job_id}` must contain exactly one `{step_name}` step."
            )
            continue
        unguarded = _unguarded_native_commands(str(install_steps[0].get("run", "")))
        if unguarded:
            problems.append(
                f"F. `{job_id}` can mask failed Python provisioning commands because these "
                f"commands lack an immediate `$LASTEXITCODE` check: {unguarded}."
            )

    expected_actions = {
        "license-gate": [CHECKOUT_ACTION, SETUP_PYTHON_ACTION],
        "windows-release-gate": [
            CHECKOUT_ACTION,
            SETUP_NODE_ACTION,
            PNPM_SETUP_ACTION,
            SETUP_PYTHON_ACTION,
            UPLOAD_ARTIFACT_ACTION,
            UPLOAD_ARTIFACT_ACTION,
        ],
    }
    for job_id, job in (
        ("license-gate", license_job),
        ("windows-release-gate", release_job),
    ):
        if not isinstance(job, dict):
            problems.append(f"F. release-gate.yml has no `{job_id}` job.")
            continue
        actual_actions = [
            str(step.get("uses"))
            for step in (job.get("steps") or [])
            if isinstance(step, dict) and step.get("uses")
        ]
        if actual_actions != expected_actions[job_id]:
            problems.append(
                f"F. `{job_id}` release Actions are not the exact reviewed commits; "
                f"expected {expected_actions[job_id]}, found {actual_actions}."
            )

    setup_node_steps = [
        step for step in release_steps if step.get("uses") == SETUP_NODE_ACTION
    ]
    setup_python_steps = [
        step for step in release_steps if step.get("uses") == SETUP_PYTHON_ACTION
    ]
    if (
        len(setup_node_steps) != 1
        or str((setup_node_steps[0].get("with") or {}).get("node-version")) != PINNED_NODE
    ):
        problems.append(f"F. release Node must be pinned to {PINNED_NODE}.")
    if (
        len(setup_python_steps) != 1
        or str((setup_python_steps[0].get("with") or {}).get("python-version"))
        != PINNED_PYTHON
    ):
        problems.append(f"F. release Python must be pinned to {PINNED_PYTHON}.")
    release_env = release_job.get("env") or {}
    if (
        release_env.get("TQ_MODEL_NAME") != "qwen3.5:9b"
        or release_env.get("TQ_MODEL_DIGEST") != PINNED_MODEL_DIGEST
    ):
        problems.append(
            "F. the release job must pin qwen3.5:9b to the exact A/B-proven model digest."
        )

    release_exe = _executable_step_text(release_job)
    full_proof_steps = [
        step
        for step in release_steps
        if step.get("name") == "Run full hosted release proof with the real local model"
    ]
    if len(full_proof_steps) != 1:
        problems.append(
            "F. the hosted release job must contain exactly one full release-proof step."
        )
        full_proof_script = ""
    else:
        full_proof_script = str(full_proof_steps[0].get("run", ""))

    staging_integrity_sequence = (
        "$receiptHash = (Get-FileHash $receiptPath -Algorithm SHA256)",
        '$artifactRoot = Join-Path $env:RUNNER_TEMP "tinkerquarry-windows-release-artifacts"',
        "[IO.Directory]::CreateDirectory($artifactRoot) | Out-Null",
        "$stagedInstaller = Join-Path $artifactRoot $installer.Name",
        '$stagedReceipt = Join-Path $artifactRoot "tinkerquarry-release-substrate.json"',
        "Copy-Item -LiteralPath $installer.FullName -Destination $stagedInstaller",
        "Copy-Item -LiteralPath $receiptPath -Destination $stagedReceipt",
        "(Get-FileHash $stagedInstaller -Algorithm SHA256)",
        'throw "staged installer hash does not match the proven installer"',
        "(Get-FileHash $stagedReceipt -Algorithm SHA256)",
        'throw "staged substrate receipt hash does not match the generated receipt"',
        "$stagedFiles = @(Get-ChildItem -LiteralPath $artifactRoot -File)",
        "if ($stagedFiles.Count -ne 2)",
        'throw "release artifact staging must contain exactly two files;',
    )
    staging_positions = [full_proof_script.find(token) for token in staging_integrity_sequence]
    if (
        any(position < 0 for position in staging_positions)
        or staging_positions != sorted(staging_positions)
        or any(full_proof_script.count(token) != 1 for token in staging_integrity_sequence)
    ):
        problems.append(
            "F. the hosted proof's artifact staging integrity sequence must create one "
            "RUNNER_TEMP root, copy installer then receipt, verify both hashes, and enforce "
            "exactly two staged files in that order."
        )

    for token, why in (
        (
            'git rev-parse "${env:GITHUB_SHA}^{commit}"',
            "dereference an annotated release tag to its exact commit",
        ),
        (
            "git worktree add --detach $env:TQ_SOURCE_ROOT $expectedCommit",
            "create the exact short-path release worktree",
        ),
        (
            "git -C $env:TQ_SOURCE_ROOT rev-parse HEAD",
            "verify the short-path worktree commit",
        ),
        (
            "python -m pip install -e \".[dev]\"",
            "install the engine's full test dependencies",
        ),
        (
            "python -m playwright install chromium",
            "install the real browser used by the release proof",
        ),
        (
            "cadquery==2.7.0",
            "provision the exact CadQuery worker dependency",
        ),
        (
            "python scripts\\fetch_tools.py",
            "fetch the exact OpenSCAD and OrcaSlicer toolchain",
        ),
        (
            "python scripts\\build_installer.py --stage-only",
            "build engine staging before Cargo validates the Tauri resource tree",
        ),
        (
            "python scripts\\verify_install.py dist\\staging",
            "verify the staged engine before the full proof",
        ),
        (
            "fetch_portable_ollama",
            "fetch the product-pinned managed Ollama through its integrity gate",
        ),
        (
            "& $ollamaExe pull $env:TQ_MODEL_NAME",
            "provision the exact default live model",
        ),
        (
            "Remove-Item Env:OLLAMA_HOST",
            "remove the bootstrap host override before nested runtime tests",
        ),
        (
            "Remove-Item Env:PYTHONPATH",
            "remove the source import override before installed-app tests",
        ),
        (
            "if ($env:KIMCAD_INSTALL_ROOT)",
            "fail if the hosted source proof is contaminated by installed mode",
        ),
        (
            "pnpm.cmd test:release",
            "execute the complete release proof",
        ),
        (
            "Stop-Process -Id $env:TQ_OLLAMA_PID",
            "stop the exact provisioned model server during cleanup",
        ),
        (
            f"node-gyp@{PINNED_NODE_GYP}",
            "install the exact node-gyp release input",
        ),
        (
            f'pip=={PINNED_PIP}',
            "install the exact pip release input",
        ),
        (
            f"cargo-audit --version {PINNED_CARGO_AUDIT} --locked",
            "install the exact cargo-audit release input",
        ),
        (
            f"rustup toolchain install {PINNED_RUST}-x86_64-pc-windows-msvc",
            "install the exact Rust release toolchain",
        ),
        (
            "ImageVersion",
            "record the actual weekly runner image version",
        ),
        (
            "tinkerquarry-release-substrate.json",
            "emit an artifact-bound substrate receipt",
        ),
        (
            "unsigned_installer",
            "bind the substrate receipt to the exact unsigned installer",
        ),
        (
            "Get-Content -LiteralPath $stderr -Tail",
            "surface Ollama stderr when the hosted proof fails",
        ),
    ):
        if token not in release_exe:
            problems.append(f"F. hosted release job does not {why}; `{token}` is absent.")

    upload_steps = [
        step
        for step in release_steps
        if step.get("uses") == UPLOAD_ARTIFACT_ACTION
    ]
    success_uploads = [
        step
        for step in upload_steps
        if (step.get("with") or {}).get("name")
        == "tinkerquarry-windows-release-artifacts"
    ]
    failure_uploads = [
        step
        for step in upload_steps
        if (step.get("with") or {}).get("name")
        == "tinkerquarry-release-ollama-diagnostics"
    ]
    if (
        len(success_uploads) != 1
        or success_uploads[0].get("if") == "always()"
        or (success_uploads[0].get("with") or {}).get("if-no-files-found") != "error"
    ):
        problems.append(
            "F. the installer and substrate receipt must upload only after success "
            "and must fail when either artifact is absent."
        )
    elif not _is_single_runner_temp_artifact_root(
        (success_uploads[0].get("with") or {}).get("path")
    ):
        problems.append(
            "F. the installer and substrate receipt must upload from the one reviewed "
            "RUNNER_TEMP staging root; cross-volume upload paths fail on hosted Windows."
        )
    if (
        len(failure_uploads) != 1
        or failure_uploads[0].get("if") != "failure()"
        or (failure_uploads[0].get("with") or {}).get("if-no-files-found") != "warn"
    ):
        problems.append(
            "F. Ollama stdout/stderr must upload in one failure-only diagnostic artifact."
        )

    ci_doc = load_workflow(CI_YML)
    release_wiring_job = (ci_doc.get("jobs") or {}).get("release-wiring")
    ci_exe = (
        _executable_step_text(release_wiring_job)
        if isinstance(release_wiring_job, dict)
        else ""
    )
    actionlint_steps = [
        step
        for step in (
            (release_wiring_job.get("steps") or [])
            if isinstance(release_wiring_job, dict)
            else []
        )
        if isinstance(step, dict)
        and step.get("name") == "Validate every Actions workflow with pinned actionlint"
    ]
    if (
        len(actionlint_steps) != 1
        or (actionlint_steps[0].get("env") or {}).get("ACTIONLINT_VERSION")
        != ACTIONLINT_VERSION
        or (actionlint_steps[0].get("env") or {}).get("ACTIONLINT_SHA256")
        != ACTIONLINT_LINUX_SHA256
    ):
        problems.append(
            "F. merge-gate actionlint version/checksum environment is not the reviewed pin."
        )
    for token, why in (
        (
            "rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}",
            "download actionlint only from its official pinned release",
        ),
        (
            "sha256sum --check",
            "verify the pinned actionlint archive checksum",
        ),
        (
            '".github/workflows"',
            "lint every workflow directory entry",
        ),
    ):
        if token not in ci_exe:
            problems.append(
                f"F. merge-gate Actions syntax validation does not {why}; `{token}` is absent."
            )

    if EPHEMERAL_RUNNER_YML.exists():
        problems.append(
            "F. obsolete ephemeral-release-runner.yml still exists; the release proof "
            "must not register a repository self-hosted runner."
        )

def main() -> int:
    problems: list[str] = []
    checks = (
        check_a_automatic_trigger,
        check_b_and_c_coverage_map,
        check_d_release_path_gated,
        check_e_signed_artifact_evidence_chain,
        check_f_hosted_release_scope,
    )
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
