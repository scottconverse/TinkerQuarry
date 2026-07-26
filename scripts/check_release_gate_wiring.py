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
  F. The only executable self-hosted job is the release gate, and it cannot be
     triggered by a pull-request event from untrusted fork code. The temporary
     runner bootstrap stays manual-only, isolates its one-hour registration secret
     to the ephemeral configuration step, queues one exact rerun itself, installs an
     exact-job start hook, withholds its actions:write control token from nested code,
     injects only a manifest-bound exact-tag engine tree, and proves that assignment
     completed on its named runner.

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
EPHEMERAL_RUNNER_YML = WORKFLOWS / "ephemeral-release-runner.yml"
RUNNER_SUPPORT_DIR = REPO_ROOT / "scripts" / "release-runner"
ENGINE_STAGING_HELPER = RUNNER_SUPPORT_DIR / "ensure-engine-staging.ps1"
CARGO_WRAPPER = RUNNER_SUPPORT_DIR / "cargo.cmd"
ENGINE_STAGING_FIXTURE = RUNNER_SUPPORT_DIR / "test-engine-staging-injection.ps1"
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


def check_f_self_hosted_scope(problems: list[str]) -> None:
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

    expected = [(RELEASE_GATE_YML, "windows-release-gate")]
    actual = [(path, job_id) for path, job_id, _ in executable_self_hosted]
    if actual != expected:
        rendered = ", ".join(f"{p.name}:{j}" for p, j in actual) or "<none>"
        problems.append(
            "F. executable self-hosted scope drifted. Expected only "
            f"`release-gate.yml:windows-release-gate`; found {rendered}."
        )

    for path, job_id, trigger_set in executable_self_hosted:
        unsafe = trigger_set & {"pull_request", "pull_request_target"}
        if unsafe:
            problems.append(
                f"F. `{path.name}:{job_id}` is self-hosted but accepts untrusted "
                f"pull-request trigger(s): {', '.join(sorted(unsafe))}."
            )

    if EPHEMERAL_RUNNER_YML.exists():
        bootstrap_doc = load_workflow(EPHEMERAL_RUNNER_YML)
        bootstrap_triggers = set(triggers(bootstrap_doc))
        if bootstrap_triggers != {"workflow_dispatch"}:
            problems.append(
                "F. ephemeral-release-runner.yml must remain manual-only while it can "
                "register a repository runner; found triggers "
                f"{sorted(bootstrap_triggers) or '<none>'}."
            )
        bootstrap_permissions = bootstrap_doc.get("permissions") or {}
        if bootstrap_permissions.get("actions") != "write":
            problems.append(
                "F. ephemeral-release-runner.yml needs `actions: write` so it can queue "
                "the exact audited rerun itself instead of depending on timing by an operator."
            )
        bootstrap_concurrency = bootstrap_doc.get("concurrency") or {}
        if (
            bootstrap_concurrency.get("group")
            != "tinkerquarry-v1.5.1-ephemeral-release-runner"
            or bootstrap_concurrency.get("cancel-in-progress") is not False
        ):
            problems.append(
                "F. ephemeral runner bootstrap must serialize one fixed v1.5.1 recovery "
                "group without cancelling an in-flight provisioner."
            )

        bootstrap_jobs = bootstrap_doc.get("jobs") or {}
        bootstrap = bootstrap_jobs.get("bootstrap")
        if not isinstance(bootstrap, dict) or len(bootstrap_jobs) != 1:
            problems.append(
                "F. ephemeral-release-runner.yml must contain exactly its audited "
                "`bootstrap` job."
            )
            return
        if bootstrap.get("runs-on") != "windows-2022":
            problems.append(
                "F. temporary release bootstrap must stay pinned to the audited "
                "`windows-2022` hosted image."
            )

        steps = bootstrap.get("steps") or []
        checkout_steps = [
            (index, step)
            for index, step in enumerate(steps)
            if isinstance(step, dict)
            and str(step.get("uses", "")).startswith("actions/checkout@")
        ]
        tag_checkouts = [
            (index, step)
            for index, step in checkout_steps
            if (step.get("with") or {}).get("ref") == "v1.5.1"
            and not (step.get("with") or {}).get("path")
        ]
        control_checkouts = [
            (index, step)
            for index, step in checkout_steps
            if (step.get("with") or {}).get("ref") == "${{ github.sha }}"
            and (step.get("with") or {}).get("path") == ".tq-bootstrap-control"
            and (step.get("with") or {}).get("sparse-checkout")
            == "scripts/release-runner"
            and (step.get("with") or {}).get("persist-credentials") is False
        ]
        if (
            len(tag_checkouts) != 1
            or len(control_checkouts) != 1
            or tag_checkouts[0][0] >= control_checkouts[0][0]
        ):
            problems.append(
                "F. bootstrap must first check out immutable v1.5.1 as the product "
                "tree, then sparsely check out runner controls from `${{ github.sha }}` "
                "under `.tq-bootstrap-control` without persisted credentials."
            )

        token_steps = [
            step
            for step in steps
            if isinstance(step, dict)
            and "secrets.TQ_EPHEMERAL_RUNNER_TOKEN" in str(step)
        ]
        if len(token_steps) != 1 or "config.cmd --unattended --ephemeral" not in (
            _executable_step_text({"steps": token_steps}) if token_steps else ""
        ):
            problems.append(
                "F. the ephemeral registration secret must appear in exactly one step, "
                "and that step must only configure an unattended one-job runner."
            )

        bootstrap_exe = _executable_step_text(bootstrap)
        for support_path in (
            ENGINE_STAGING_HELPER,
            CARGO_WRAPPER,
            ENGINE_STAGING_FIXTURE,
        ):
            if not support_path.exists():
                problems.append(
                    "F. ephemeral runner support file is absent: "
                    f"`{support_path.relative_to(REPO_ROOT)}`."
                )
            else:
                bootstrap_exe += "\n" + support_path.read_text(encoding="utf-8")

        ci_doc = load_workflow(CI_YML)
        ci_frontend = (ci_doc.get("jobs") or {}).get("frontend") or {}
        ci_exe = _executable_step_text(ci_frontend)
        if (
            "scripts\\release-runner\\test-engine-staging-injection.ps1"
            not in ci_exe
        ):
            problems.append(
                "F. Windows CI must execute the exact-tag engine staging injection "
                "fixture before this temporary bootstrap can be merged."
            )
        for token, why in (
            (
                "EXPECTED_RELEASE_GATE_RUN_ID",
                "bind startup to an explicitly selected Release Gate run",
            ),
            (
                "ACTIONS_RUNNER_HOOK_JOB_STARTED",
                "install the fail-closed pre-job identity hook",
            ),
            (
                'actions/runs/$runId/rerun',
                "queue the exact selected Release Gate rerun itself",
            ),
            (
                "EXPECTED_RELEASE_GATE_RUN_ATTEMPT",
                "bind routing and completion to one exact rerun attempt",
            ),
            (
                '$receiptPath = "C:\\tq-provision\\accepted-release-job.json"',
                "declare the one exact accepted-assignment receipt path",
            ),
            (
                'Set-Content -LiteralPath "C:\\tq-provision\\accepted-release-job.json"',
                "write the accepted-assignment receipt from the pre-job hook",
            ),
            (
                "Get-Content -LiteralPath $receiptPath -Raw",
                "read the accepted-assignment receipt after the listener exits",
            ),
            (
                "$completedWindowsJobs[0].runner_name -ne $env:TQ_EXPECTED_RUNNER_NAME",
                "prove the exact job completed on the provisioned runner",
            ),
            (
                "if ($env:RUNNER_TOKEN)",
                "prove the registration token is absent before the listener starts",
            ),
            (
                'if ($env:GH_TOKEN) { $problems += "outer_actions_token" }',
                "make the pre-job hook reject an inherited bootstrap control token",
            ),
            (
                "git diff --quiet $expectedSha -- packages/engine",
                "prove the staged engine inputs are byte-source-equivalent to the immutable tag",
            ),
            (
                "python scripts\\build_installer.py --stage-only",
                "build the exact-tag engine resource tree before the immutable job reaches Cargo",
            ),
            (
                "python scripts\\verify_install.py dist\\staging",
                "verify the exact-tag engine staging tree before exposing it to the nested job",
            ),
            (
                "TQ_ENGINE_STAGING_MANIFEST_SHA256",
                "bind the injected engine tree to a complete pre-build file manifest",
            ),
            (
                '$controlSha = (git -C $controlRoot rev-parse HEAD).Trim()',
                "resolve the separate bootstrap-control checkout before copying helpers",
            ),
            (
                '$controlSha -ne "${{ github.sha }}"',
                "bind the copied bootstrap controls to this workflow run's exact reviewed head",
            ),
            (
                ".tq-bootstrap-control\\scripts\\release-runner\\ensure-engine-staging.ps1",
                "copy the injection helper from the audited control checkout, not the older tag",
            ),
            (
                'New-Item -ItemType Junction -Path $link -Target $source',
                "inject the verified staging tree only when the exact tag job first invokes Cargo",
            ),
            (
                'pwsh.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File',
                "run the injection helper under the same PowerShell 7 host used by the release runner",
            ),
            (
                '$injectionReceiptPath = "C:\\tq-provision\\engine-staging-injection.json"',
                "declare the engine-staging injection receipt checked after the listener exits",
            ),
            (
                "Get-Content -LiteralPath $injectionReceiptPath -Raw",
                "read the exact engine-staging injection receipt after the listener exits",
            ),
            (
                "$postManifestHash -ne $env:TQ_ENGINE_STAGING_MANIFEST_SHA256",
                "prove the injected exact-tag engine tree stayed unchanged through packaging",
            ),
        ):
            if token not in bootstrap_exe:
                problems.append(
                    f"F. ephemeral runner bootstrap does not {why}; `{token}` is absent."
                )

        control_save = bootstrap_exe.find("$controlToken = $env:GH_TOKEN")
        control_remove = bootstrap_exe.find("Remove-Item Env:GH_TOKEN")
        listener_start = bootstrap_exe.find(".\\run.cmd")
        control_restore = bootstrap_exe.find("$env:GH_TOKEN = $controlToken")
        wrapper_prepend = bootstrap_exe.find(
            '$env:PATH = "$env:TQ_CARGO_WRAPPER_ROOT;$env:PATH"'
        )
        if not (
            0
            <= control_save
            < wrapper_prepend
            < control_remove
            < listener_start
            < control_restore
        ):
            problems.append(
                "F. the exact-tag Cargo staging wrapper must join PATH before the "
                "actions:write bootstrap token is removed and `run.cmd` starts; the "
                "token may be restored only after the listener exits."
            )


def main() -> int:
    problems: list[str] = []
    checks = (
        check_a_automatic_trigger,
        check_b_and_c_coverage_map,
        check_d_release_path_gated,
        check_e_signed_artifact_evidence_chain,
        check_f_self_hosted_scope,
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
